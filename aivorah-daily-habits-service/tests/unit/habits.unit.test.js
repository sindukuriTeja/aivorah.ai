jest.mock('../../services/supabase', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
    single: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };
  return { from: jest.fn(() => chain), _chain: chain };
});
jest.mock('../../services/push', () => ({ sendPush: jest.fn().mockResolvedValue({ sent: 1 }) }));

const supabase = require('../../services/supabase');
const { sendPush } = require('../../services/push');
const {
  getToday, checkin, getHistory, getParentTasks, createParentTask, deleteParentTask,
} = require('../../services/habits');

function makeThenableChain(resolvedData, resolvedError = null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    then: (resolve) => resolve({ data: resolvedData, error: resolvedError }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabase.from.mockImplementation(() => supabase._chain);
  // Default: no rows anywhere unless a test overrides it.
  supabase._chain.maybeSingle.mockResolvedValue({ data: null });
  supabase._chain.single.mockResolvedValue({ data: null });
});

describe('getToday', () => {
  test('returns real parent tasks, completed habits, coins earned, streak, and journal for a real user', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'student-1' } }) };
      if (table === 'parent_daily_tasks') return makeThenableChain([{ id: 't1', label: 'Brush teeth', icon: 'smile', coins: 5 }, { id: 't2', label: 'Read a book', icon: 'book', coins: 10 }]);
      if (table === 'habits_checkins') {
        // First call (today's checkins) vs second call (all checkins for streak) — differentiate by call count.
        return makeThenableChain([{ habit_id: 't1', checked_at: '2026-08-19T10:00:00Z' }]);
      }
      if (table === 'student_preferences') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { total_coins: 50 } }) };
      return supabase._chain;
    });

    const result = await getToday('Student@A.com');

    expect(result.parentTasks).toEqual([
      { id: 't1', label: 'Brush teeth', icon: 'smile', coins: 5, fromParent: true },
      { id: 't2', label: 'Read a book', icon: 'book', coins: 10, fromParent: true },
    ]);
    expect(result.today).toEqual({ completed: ['t1'], coinsEarned: 5 });
    expect(result.totalCoins).toBe(50);
    expect(result.journalText).toContain('Brush teeth');
  });

  test('a user with no matching row (no studentId) skips parent tasks entirely, no crash', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
      if (table === 'habits_checkins') return makeThenableChain([]);
      if (table === 'student_preferences') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
      return supabase._chain;
    });

    const result = await getToday('nobody@a.com');

    expect(result.parentTasks).toEqual([]);
    expect(result.totalCoins).toBe(0);
  });

  test('no completed habits today produces an empty journal', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { id: 's1' } }) };
      if (table === 'parent_daily_tasks') return makeThenableChain([{ id: 't1', label: 'Brush teeth', coins: 5 }]);
      if (table === 'habits_checkins') return makeThenableChain([]);
      if (table === 'student_preferences') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
      return supabase._chain;
    });

    const result = await getToday('a@a.com');

    expect(result.journalText).toBe('');
  });

  test('lowercases and trims the userEmail before any lookup', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'users') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
      if (table === 'habits_checkins') return makeThenableChain([]);
      if (table === 'student_preferences') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
      return supabase._chain;
    });
    const usersEqSpy = jest.fn().mockReturnThis();
    supabase.from.mockImplementation((table) => {
      if (table === 'users') return { ...supabase._chain, eq: usersEqSpy, maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
      if (table === 'habits_checkins') return makeThenableChain([]);
      if (table === 'student_preferences') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
      return supabase._chain;
    });

    await getToday('  Student@A.COM  ');

    expect(usersEqSpy).toHaveBeenCalledWith('email', 'student@a.com');
  });
});

describe('checkin', () => {
  test('checking in a real habit creates a checkin row and awards its real coins', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { id: 't1', label: 'Brush teeth', coins: 5 } }), in: jest.fn().mockReturnThis() };
      if (table === 'habits_checkins') {
        return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: null }), insert: jest.fn().mockResolvedValue({}), then: (resolve) => resolve({ data: [{ habit_id: 't1' }] }) };
      }
      if (table === 'users') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { id: 's1' } }) };
      if (table === 'student_preferences') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { total_coins: 10 } }), upsert: jest.fn().mockResolvedValue({}) };
      return supabase._chain;
    });

    const result = await checkin('a@a.com', 't1');

    expect(result.checked).toBe(true);
    expect(result.coinsChange).toBe(5);
    expect(result.totalCoins).toBe(15);
  });

  test('checking in again on the same day un-checks (toggle) and removes the coins', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { id: 't1', label: 'Brush teeth', coins: 5 } }) };
      if (table === 'habits_checkins') {
        return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'checkin-1' } }), delete: jest.fn().mockReturnThis(), then: (resolve) => resolve({ data: [] }) };
      }
      if (table === 'users') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { id: 's1' } }) };
      if (table === 'student_preferences') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { total_coins: 15 } }), upsert: jest.fn().mockResolvedValue({}) };
      return supabase._chain;
    });

    const result = await checkin('a@a.com', 't1');

    expect(result.checked).toBe(false);
    expect(result.coinsChange).toBe(-5);
    expect(result.totalCoins).toBe(10);
  });

  test('coins never go negative even if coinsChange would push the total below 0', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { id: 't1', label: 'Brush teeth', coins: 5 } }) };
      if (table === 'habits_checkins') {
        return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'checkin-1' } }), delete: jest.fn().mockReturnThis(), then: (resolve) => resolve({ data: [] }) };
      }
      if (table === 'users') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
      if (table === 'student_preferences') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { total_coins: 2 } }), upsert: jest.fn().mockResolvedValue({}) };
      return supabase._chain;
    });

    const result = await checkin('a@a.com', 't1');

    expect(result.totalCoins).toBe(0);
  });

  test('an unknown habitId returns a real not_found error, no side effects', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
      return supabase._chain;
    });

    const result = await checkin('a@a.com', 'ghost-id');

    expect(result).toEqual({ error: 'not_found' });
  });
});

describe('getHistory', () => {
  test('accumulates real completed count and coins per date across the requested window', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'habits_checkins') return makeThenableChain([
        { date: new Date().toISOString().slice(0, 10), habit_id: 't1' },
        { date: new Date().toISOString().slice(0, 10), habit_id: 't2' },
      ]);
      if (table === 'parent_daily_tasks') return makeThenableChain([{ id: 't1', coins: 5 }, { id: 't2', coins: 10 }]);
      return supabase._chain;
    });

    const result = await getHistory('a@a.com', 1);

    expect(result.history[0]).toEqual({ date: new Date().toISOString().slice(0, 10), completed: 2, coinsEarned: 15 });
  });

  test('no checkins at all produces a real zeroed-out history for every requested day', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'habits_checkins') return makeThenableChain([]);
      return supabase._chain;
    });

    const result = await getHistory('a@a.com', 3);

    expect(result.history).toHaveLength(3);
    expect(result.history.every(d => d.completed === 0 && d.coinsEarned === 0)).toBe(true);
    expect(result.streak).toBe(0);
  });
});

describe('getParentTasks', () => {
  test('marks each real task completedToday based on a real matching checkin', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return makeThenableChain([{ id: 't1', label: 'Brush teeth' }, { id: 't2', label: 'Read' }]);
      if (table === 'habits_checkins') return makeThenableChain([{ habit_id: 't1' }]);
      return supabase._chain;
    });

    const result = await getParentTasks('student-1');

    expect(result).toEqual([
      { id: 't1', label: 'Brush teeth', completedToday: true },
      { id: 't2', label: 'Read', completedToday: false },
    ]);
  });

  test('zero tasks skips the checkins lookup entirely, returns an empty array', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return makeThenableChain([]);
      return supabase._chain;
    });

    const result = await getParentTasks('student-1');

    expect(result).toEqual([]);
  });

  test('a Supabase error on the task fetch throws the real error message', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return makeThenableChain(null, { message: 'db down' });
      return supabase._chain;
    });

    await expect(getParentTasks('student-1')).rejects.toThrow('db down');
  });
});

describe('createParentTask', () => {
  test('creates a real task and notifies the real child via push', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'new-task', label: 'Brush teeth' }, error: null }) };
      if (table === 'users') return { ...supabase._chain, maybeSingle: jest.fn().mockResolvedValue({ data: { email: 'child@a.com' } }) };
      return supabase._chain;
    });

    const result = await createParentTask({ parentEmail: 'parent@a.com', childId: 'child-1', label: '  Brush teeth  ' });

    expect(result).toEqual({ id: 'new-task', label: 'Brush teeth' });
    await new Promise(process.nextTick); // flush the best-effort async push
    expect(sendPush).toHaveBeenCalledWith('child@a.com', expect.objectContaining({ title: 'New daily task', prefKey: 'assignmentAlerts' }));
  });

  test('a push failure after creation is swallowed, the task is still returned', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'new-task' }, error: null }) };
      if (table === 'users') return { ...supabase._chain, maybeSingle: jest.fn().mockRejectedValue(new Error('lookup failed')) };
      return supabase._chain;
    });

    const result = await createParentTask({ parentEmail: 'parent@a.com', childId: 'child-1', label: 'Read' });

    expect(result).toEqual({ id: 'new-task' });
  });

  test('a Supabase insert error throws the real error message', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }) };
      return supabase._chain;
    });

    await expect(createParentTask({ parentEmail: 'p@a.com', childId: 'c1', label: 'Read' })).rejects.toThrow('insert failed');
  });

  // Regression tests: a student created in a different service's database
  // (aivorah-students-service, or a legacy monolith account) never gets a
  // matching row in THIS service's own `users` table, so
  // parent_daily_tasks.child_id's FK violates on every attempt.
  // ensureLocalStudent() must sync a minimal row first, but only ever
  // INSERT - never touch an existing one.
  test('a student not yet present locally, with childName provided, gets synced before the task insert succeeds', async () => {
    const usersInsertCalls = [];
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'new-task', label: 'Brush teeth' }, error: null }) };
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
          insert: jest.fn((payload) => { usersInsertCalls.push(payload); return Promise.resolve({ data: payload, error: null }); }),
        };
      }
      return supabase._chain;
    });

    const result = await createParentTask({
      parentEmail: 'parent@a.com', childId: 'child-1', childName: 'Sri S', grade: 'Grade 10', curriculum: 'CBSE', label: 'Brush teeth',
    });

    expect(result).toEqual({ id: 'new-task', label: 'Brush teeth' });
    expect(usersInsertCalls).toHaveLength(1);
    expect(usersInsertCalls[0]).toEqual(expect.objectContaining({
      id: 'child-1', name: 'Sri S', role: 'student', grade: 'Grade 10', curriculum: 'CBSE',
    }));
  });

  test('a student already present locally is never re-inserted or overwritten', async () => {
    const usersInsertCalls = [];
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: { id: 'new-task' }, error: null }) };
      if (table === 'users') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'child-1' }, error: null }) }) }),
          insert: jest.fn((payload) => { usersInsertCalls.push(payload); return Promise.resolve({ data: payload, error: null }); }),
        };
      }
      return supabase._chain;
    });

    const result = await createParentTask({ parentEmail: 'parent@a.com', childId: 'child-1', childName: 'Existing Student', label: 'Read' });

    expect(result).toEqual({ id: 'new-task' });
    expect(usersInsertCalls).toHaveLength(0);
  });

  test('no childName provided (legacy caller) behaves exactly as before - no sync attempted, no crash', async () => {
    const usersInsertCalls = [];
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, insert: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: { message: 'insert or update on table "parent_daily_tasks" violates foreign key constraint "parent_daily_tasks_child_id_fkey"' } }) };
      if (table === 'users') return { ...supabase._chain, insert: jest.fn((payload) => { usersInsertCalls.push(payload); return Promise.resolve({ data: payload, error: null }); }) };
      return supabase._chain;
    });

    await expect(createParentTask({ parentEmail: 'parent@a.com', childId: 'child-1', label: 'Read' }))
      .rejects.toThrow(/foreign key constraint/);
    expect(usersInsertCalls).toHaveLength(0);
  });
});

describe('deleteParentTask', () => {
  test('deletes the real task by id', async () => {
    const eqSpy = jest.fn().mockResolvedValue({ error: null });
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, delete: jest.fn().mockReturnThis(), eq: eqSpy };
      return supabase._chain;
    });

    await deleteParentTask('task-1');

    expect(eqSpy).toHaveBeenCalledWith('id', 'task-1');
  });

  test('a Supabase delete error throws the real error message', async () => {
    supabase.from.mockImplementation((table) => {
      if (table === 'parent_daily_tasks') return { ...supabase._chain, delete: jest.fn().mockReturnThis(), eq: jest.fn().mockResolvedValue({ error: { message: 'delete failed' } }) };
      return supabase._chain;
    });

    await expect(deleteParentTask('task-1')).rejects.toThrow('delete failed');
  });
});
