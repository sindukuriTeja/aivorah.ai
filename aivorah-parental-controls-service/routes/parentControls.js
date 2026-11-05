const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const { parseHourField } = require('../services/parseHourField');

// ── POST /parent/:parentEmail/children/:childId/screen-time ─────────
// Save all parental controls for a child. Ported as-is from
// ai-mentor/server/routes/parent.js - same shape, same Supabase project
// (screen_time lives in user_preferences.data, alongside other legacy
// per-student preference fields the monolith still owns).
router.post('/:parentEmail/children/:childId/screen-time', async (req, res) => {
  try {
    const { parentEmail, childId } = req.params;
    const {
      dailyLimitMinutes, enabled, lockWhenReached,
      weeklyCapEnabled, weeklyCapMinutes,
      allowedHoursEnabled, allowedHoursStart, allowedHoursEnd,
      breakEnforcerEnabled, breakIntervalMinutes, breakDurationMinutes,
      homeworkFirstEnabled,
      subjectFilterEnabled, blockedSubjects,
    } = req.body;

    const { data: link } = await supabase
      .from('parent_children')
      .select('child_id')
      .eq('parent_email', parentEmail)
      .eq('child_id', childId)
      .maybeSingle();
    if (!link) return res.status(403).json({ error: 'Child not linked to this parent' });

    const { data: child } = await supabase.from('users').select('email').eq('id', childId).maybeSingle();
    if (!child) return res.status(404).json({ error: 'Child not found' });

    const { data: existing } = await supabase
      .from('user_preferences')
      .select('data')
      .eq('user_email', child.email)
      .maybeSingle();

    const ex = existing?.data || {};
    const exSt = ex.screen_time || {};

    const controls = {
      // Daily screen time
      daily_limit_minutes: dailyLimitMinutes != null ? Number(dailyLimitMinutes) : (exSt.daily_limit_minutes ?? 60),
      enabled: enabled != null ? Boolean(enabled) : (exSt.enabled ?? true),
      lock_when_reached: lockWhenReached != null ? Boolean(lockWhenReached) : (exSt.lock_when_reached ?? false),
      // Weekly cap
      weekly_cap_enabled: weeklyCapEnabled != null ? Boolean(weeklyCapEnabled) : (exSt.weekly_cap_enabled ?? false),
      weekly_cap_minutes: weeklyCapMinutes != null ? Number(weeklyCapMinutes) : (exSt.weekly_cap_minutes ?? 300),
      // Allowed hours
      allowed_hours_enabled: allowedHoursEnabled != null ? Boolean(allowedHoursEnabled) : (exSt.allowed_hours_enabled ?? false),
      allowed_hours_start: allowedHoursStart != null ? parseHourField(allowedHoursStart) : (exSt.allowed_hours_start ?? 14),
      allowed_hours_end: allowedHoursEnd != null ? parseHourField(allowedHoursEnd) : (exSt.allowed_hours_end ?? 21),
      // Break enforcer
      break_enforcer_enabled: breakEnforcerEnabled != null ? Boolean(breakEnforcerEnabled) : (exSt.break_enforcer_enabled ?? false),
      break_interval_minutes: breakIntervalMinutes != null ? Number(breakIntervalMinutes) : (exSt.break_interval_minutes ?? 25),
      break_duration_minutes: breakDurationMinutes != null ? Number(breakDurationMinutes) : (exSt.break_duration_minutes ?? 5),
      // Homework first
      homework_first_enabled: homeworkFirstEnabled != null ? Boolean(homeworkFirstEnabled) : (exSt.homework_first_enabled ?? false),
      // Subject filter
      subject_filter_enabled: subjectFilterEnabled != null ? Boolean(subjectFilterEnabled) : (exSt.subject_filter_enabled ?? false),
      blocked_subjects: blockedSubjects != null ? blockedSubjects : (exSt.blocked_subjects ?? []),
      // Meta
      set_by: parentEmail,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_email: child.email, data: { ...ex, screen_time: controls } }, { onConflict: 'user_email' });

    if (error) return res.status(500).json({ error: error.message });

    res.json({ success: true, controls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /parent/:parentEmail/children/:childId/screen-time ──────────
// Get all parental controls for a child.
router.get('/:parentEmail/children/:childId/screen-time', async (req, res) => {
  try {
    const { parentEmail, childId } = req.params;

    const { data: link } = await supabase
      .from('parent_children')
      .select('child_id')
      .eq('parent_email', parentEmail)
      .eq('child_id', childId)
      .maybeSingle();
    if (!link) return res.status(403).json({ error: 'Child not linked to this parent' });

    const { data: child } = await supabase.from('users').select('email').eq('id', childId).maybeSingle();
    if (!child) return res.status(404).json({ error: 'Child not found' });

    const { data: pref } = await supabase
      .from('user_preferences')
      .select('data')
      .eq('user_email', child.email)
      .maybeSingle();

    const st = pref?.data?.screen_time || {};

    const { data: stats } = await supabase
      .from('student_stats')
      .select('today_study_minutes')
      .eq('student_id', childId)
      .maybeSingle();

    // Weekly usage from daily log (last 7 days)
    const today = new Date();
    const weekStart = new Date(); weekStart.setDate(today.getDate() - 6);
    const { data: weekLogs } = await supabase
      .from('student_daily_log')
      .select('log_date, study_minutes')
      .eq('student_id', childId)
      .gte('log_date', weekStart.toISOString().split('T')[0])
      .lte('log_date', today.toISOString().split('T')[0]);
    const weeklyUsageMinutes = (weekLogs ?? []).reduce((sum, r) => sum + (r.study_minutes ?? 0), 0);

    res.json({
      // Daily limit
      dailyLimitMinutes: st.daily_limit_minutes ?? null,
      isEnabled: st.enabled ?? false,
      lockWhenReached: st.lock_when_reached ?? false,
      // Weekly cap
      weeklyCapEnabled: st.weekly_cap_enabled ?? false,
      weeklyCapMinutes: st.weekly_cap_minutes ?? 300,
      // Allowed hours
      allowedHoursEnabled: st.allowed_hours_enabled ?? false,
      allowedHoursStart: st.allowed_hours_start ?? 14,
      allowedHoursEnd: st.allowed_hours_end ?? 21,
      // Break enforcer
      breakEnforcerEnabled: st.break_enforcer_enabled ?? false,
      breakIntervalMinutes: st.break_interval_minutes ?? 25,
      breakDurationMinutes: st.break_duration_minutes ?? 5,
      // Homework first
      homeworkFirstEnabled: st.homework_first_enabled ?? false,
      // Subject filter
      subjectFilterEnabled: st.subject_filter_enabled ?? false,
      blockedSubjects: st.blocked_subjects ?? [],
      // Usage
      todayUsageMinutes: stats?.today_study_minutes ?? 0,
      weeklyUsageMinutes,
      setBy: st.set_by ?? null,
      updatedAt: st.updated_at ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /parent/screen-time-status/:studentEmail ─────────────────────
// Student checks all active restrictions (called by ScreenLayout every 15s).
router.get('/screen-time-status/:studentEmail', async (req, res) => {
  try {
    const { studentEmail } = req.params;

    const { data: pref } = await supabase
      .from('user_preferences')
      .select('data')
      .eq('user_email', studentEmail)
      .maybeSingle();

    const st = pref?.data?.screen_time || null;
    // Return hasLimit:false only if no controls at all are configured
    const anyControlActive = st && (
      st.enabled ||
      st.allowed_hours_enabled ||
      st.break_enforcer_enabled ||
      st.homework_first_enabled ||
      st.subject_filter_enabled ||
      st.weekly_cap_enabled
    );
    if (!anyControlActive) {
      return res.json({ hasLimit: false });
    }

    const { data: userRow } = await supabase.from('users').select('id').eq('email', studentEmail).maybeSingle();
    const { data: stats } = await supabase
      .from('student_stats')
      .select('today_study_minutes')
      .eq('student_id', userRow?.id)
      .maybeSingle();

    const used = stats?.today_study_minutes ?? 0;
    const limit = st.daily_limit_minutes;
    const remaining = Math.max(0, limit - used);

    res.json({
      hasLimit: true,
      // Daily
      dailyLimitMinutes: limit,
      usedMinutes: used,
      remainingMinutes: remaining,
      isLocked: st.lock_when_reached && remaining <= 0,
      // Weekly cap
      weeklyCap: st.weekly_cap_enabled ? {
        enabled: true,
        weeklyLimitMinutes: st.weekly_cap_minutes ?? 300,
        weeklyUsedMinutes: used, // proxy: replace with real weekly tracking when session log exists
        isOverWeeklyCap: used >= (st.weekly_cap_minutes ?? 300),
      } : { enabled: false },
      // Allowed hours
      allowedHours: st.allowed_hours_enabled ? {
        enabled: true,
        startHour: st.allowed_hours_start ?? 14,
        endHour: st.allowed_hours_end ?? 21,
      } : { enabled: false },
      // Break enforcer
      breakEnforcer: st.break_enforcer_enabled ? {
        enabled: true,
        intervalMinutes: st.break_interval_minutes ?? 25,
        breakDurationMinutes: st.break_duration_minutes ?? 5,
      } : { enabled: false },
      // Homework first
      homeworkFirst: { enabled: st.homework_first_enabled ?? false },
      // Subject filter
      subjectFilter: st.subject_filter_enabled ? {
        enabled: true,
        blockedSubjects: st.blocked_subjects ?? [],
      } : { enabled: false },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
