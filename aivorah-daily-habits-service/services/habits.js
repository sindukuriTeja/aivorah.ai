const supabase = require('./supabase');
const { sendPush } = require('./push');

// Students are created in a different service's database
// (aivorah-students-service, or a legacy monolith account) - this service's
// own `users` table (which parent_daily_tasks.child_id foreign-keys against)
// never gets those rows, so creating a task for a real student fails with a
// FK violation. Only inserts when no local row exists yet - never updates or
// overwrites one that's already there. Same fix as aivorah-assignments-service.
async function ensureLocalStudent(id, name, grade, curriculum) {
  if (!id || !name) return;
  const { data: existing } = await supabase.from('users').select('id').eq('id', id).maybeSingle();
  if (existing) return;
  await supabase.from('users').insert({
    id, name, role: 'student',
    grade: grade || null, curriculum: curriculum || null,
    onboarding_complete: true,
  });
}

const STREAK_BONUS_DAYS  = 100;
const STREAK_BONUS_COINS = 20;

function todayStr() { return new Date().toISOString().slice(0, 10); }

// ── Compute streak from array of dated checkin rows ───────────────────────────
function computeStreak(dateSet) {
  const sorted = [...dateSet].sort().reverse();
  if (!sorted.length) return 0;
  let streak = 0;
  let cursor = new Date(todayStr());
  for (const d of sorted) {
    const day  = new Date(d);
    const diff = Math.round((cursor - day) / 86400000);
    if (diff > 1) break;
    streak++; cursor = day;
  }
  return streak;
}

// ── Auto-generate journal from today's checked habits ─────────────────────────
function generateJournal(completedLabels) {
  if (!completedLabels.length) return '';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return [
    `Today is ${dateStr}.`,
    `I am proud of myself for completing these habits:`,
    ...completedLabels.map(l => `• ${l}`),
    `Every small step counts. I am building a better version of myself, one day at a time!`,
  ].join('\n');
}

async function getToday(userEmail) {
  const email = userEmail.toLowerCase().trim();
  const today = todayStr();

  const { data: userRow } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  const studentId = userRow?.id;

  let parentTasks = [];
  if (studentId) {
    const { data: tasks } = await supabase
      .from('parent_daily_tasks')
      .select('id, label, icon, coins')
      .eq('child_id', studentId);
    parentTasks = (tasks ?? []).map(t => ({ ...t, fromParent: true }));
  }

  const { data: checkinRows } = await supabase
    .from('habits_checkins')
    .select('habit_id, checked_at')
    .eq('user_email', email)
    .eq('date', today);

  const completed = (checkinRows ?? []).map(r => r.habit_id);

  const allTaskMap = Object.fromEntries(parentTasks.map(t => [t.id, t.coins]));
  const coinsEarned = completed.reduce((sum, id) => sum + (allTaskMap[id] ?? 0), 0);

  const { data: allCheckins } = await supabase
    .from('habits_checkins')
    .select('date')
    .eq('user_email', email);
  const dateSet = new Set((allCheckins ?? []).map(r => r.date));
  const streak = computeStreak(dateSet);
  const streakBonus = streak > 0 && streak % STREAK_BONUS_DAYS === 0 ? STREAK_BONUS_COINS : 0;

  const { data: allPrefs } = await supabase
    .from('student_preferences')
    .select('total_coins')
    .eq('user_email', email)
    .maybeSingle();
  const totalCoins = allPrefs?.total_coins ?? 0;

  const completedLabels = completed.map(id => parentTasks.find(t => t.id === id)?.label).filter(Boolean);
  const journalText = generateJournal(completedLabels);

  return {
    habits: [],
    parentTasks,
    today: { completed, coinsEarned },
    streak,
    streakBonus,
    totalCoins,
    date: today,
    journalText,
  };
}

async function checkin(userEmail, habitId) {
  const email = userEmail.toLowerCase().trim();
  const today = todayStr();

  const { data: pt } = await supabase.from('parent_daily_tasks').select('id, label, icon, coins').eq('id', habitId).maybeSingle();
  if (!pt) return { error: 'not_found' };

  const { data: existing } = await supabase
    .from('habits_checkins')
    .select('id')
    .eq('user_email', email)
    .eq('habit_id', habitId)
    .eq('date', today)
    .maybeSingle();

  let checked = false;
  let coinsChange = 0;

  if (existing) {
    await supabase.from('habits_checkins').delete().eq('id', existing.id);
    coinsChange = -pt.coins;
    checked = false;
  } else {
    await supabase.from('habits_checkins').insert({ user_email: email, habit_id: habitId, date: today });
    coinsChange = pt.coins;
    checked = true;
  }

  const { data: todayRows } = await supabase
    .from('habits_checkins')
    .select('habit_id')
    .eq('user_email', email)
    .eq('date', today);
  const completed = (todayRows ?? []).map(r => r.habit_id);

  const { data: userRow } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  let parentTasks = [];
  if (userRow?.id) {
    const { data: tasks } = await supabase.from('parent_daily_tasks').select('id, coins, label').eq('child_id', userRow.id);
    parentTasks = tasks ?? [];
  }
  const allTaskMap = Object.fromEntries(parentTasks.map(t => [t.id, t.coins]));
  const coinsEarned = completed.reduce((sum, id) => sum + (allTaskMap[id] ?? 0), 0);

  const { data: prefs } = await supabase.from('student_preferences').select('total_coins').eq('user_email', email).maybeSingle();
  const newTotal = Math.max(0, (prefs?.total_coins ?? 0) + coinsChange);
  await supabase.from('student_preferences').upsert({ user_email: email, total_coins: newTotal, updated_at: new Date().toISOString() }, { onConflict: 'user_email' });

  const { data: allDates } = await supabase.from('habits_checkins').select('date').eq('user_email', email);
  const dateSet = new Set((allDates ?? []).map(r => r.date));
  const streak = computeStreak(dateSet);
  const streakBonus = streak > 0 && streak % STREAK_BONUS_DAYS === 0 ? STREAK_BONUS_COINS : 0;

  const completedLabels = completed.map(id => parentTasks.find(t => t.id === id)?.label).filter(Boolean);
  const journalText = generateJournal(completedLabels);

  return { completed, coinsEarned, coinsChange, journalText, streak, streakBonus, totalCoins: newTotal, checked };
}

async function getHistory(userEmail, days) {
  const email = userEmail.toLowerCase().trim();

  const { data: rows } = await supabase
    .from('habits_checkins')
    .select('date, habit_id')
    .eq('user_email', email);

  // Each habit's coin value lives on parent_daily_tasks, not on the
  // checkin row itself - look up every distinct habit_id referenced so
  // coinsEarned can be accumulated per date below. Without this, coins
  // stayed permanently 0 (confirmed bug - `byDate[date].coins` was
  // initialized but never actually incremented anywhere).
  const habitIds = [...new Set((rows ?? []).map(r => r.habit_id))];
  let coinsByHabitId = {};
  if (habitIds.length > 0) {
    const { data: tasks } = await supabase
      .from('parent_daily_tasks')
      .select('id, coins')
      .in('id', habitIds);
    coinsByHabitId = Object.fromEntries((tasks ?? []).map(t => [t.id, t.coins]));
  }

  const byDate = {};
  for (const r of (rows ?? [])) {
    if (!byDate[r.date]) byDate[r.date] = { count: 0, coins: 0 };
    byDate[r.date].count++;
    byDate[r.date].coins += coinsByHabitId[r.habit_id] ?? 0;
  }

  const history = [];
  for (let i = 0; i < Number(days); i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dk = d.toISOString().slice(0, 10);
    history.push({ date: dk, completed: byDate[dk]?.count || 0, coinsEarned: byDate[dk]?.coins || 0 });
  }

  const dateSet = new Set(Object.keys(byDate));
  const streak = computeStreak(dateSet);
  return { history, streak };
}

async function getParentTasks(childId) {
  const { data, error } = await supabase.from('parent_daily_tasks').select('*').eq('child_id', childId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const tasks = data ?? [];

  // Mark which tasks the child has completed today so the parent sees live status.
  // habits_checkins.habit_id maps to parent_daily_tasks.id.
  const today = todayStr();
  const taskIds = tasks.map(t => String(t.id));
  let completedSet = new Set();
  if (taskIds.length > 0) {
    const { data: checkins } = await supabase
      .from('habits_checkins')
      .select('habit_id')
      .in('habit_id', taskIds)
      .eq('date', today);
    completedSet = new Set((checkins ?? []).map(c => String(c.habit_id)));
  }
  return tasks.map(t => ({ ...t, completedToday: completedSet.has(String(t.id)) }));
}

async function createParentTask({ parentEmail, childId, childName, grade, curriculum, label, icon = 'check-circle', coins = 5 }) {
  await ensureLocalStudent(childId, childName, grade, curriculum);
  const { data, error } = await supabase.from('parent_daily_tasks').insert({ parent_email: parentEmail, child_id: childId, label: label.trim(), icon, coins }).select().single();
  if (error) throw new Error(error.message);

  // Notify the child that a new daily task arrived — same bell + push treatment
  // as challenges/assignments. Previously a parent-assigned task landed silently,
  // so the student never knew. Best-effort (non-blocking; never fails the create).
  (async () => {
    try {
      const { data: child } = await supabase.from('users').select('email').eq('id', childId).maybeSingle();
      if (child?.email) {
        await sendPush(child.email, {
          title: 'New daily task',
          body: `Your parent added: ${label.trim()}`,
          data: { type: 'task' },
          prefKey: 'assignmentAlerts',
        });
      }
    } catch (_) { /* best-effort */ }
  })();

  return data;
}

async function deleteParentTask(taskId) {
  const { error } = await supabase.from('parent_daily_tasks').delete().eq('id', taskId);
  if (error) throw new Error(error.message);
}

module.exports = {
  getToday,
  checkin,
  getHistory,
  getParentTasks,
  createParentTask,
  deleteParentTask,
};
