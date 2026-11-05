// Integration tests - hit the REAL routes/parentControls.js through
// Supertest. services/supabase is mocked directly since every call in
// this route queries it straight (no intermediate service layer, ported
// as-is from the monolith's routes/parent.js).

jest.mock('../../services/supabase', () => ({ from: jest.fn() }));

const request = require('supertest');
const supabase = require('../../services/supabase');
const { makeChain } = require('../helpers/mockSupabase');
const app = require('../../index');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /parent/:parentEmail/children/:childId/screen-time', () => {
  test('child not linked to this parent -> 403', async () => {
    supabase.from.mockImplementationOnce(() => makeChain({ data: null })); // parent_children link

    const res = await request(app)
      .post('/parent/parent@test.com/children/c1/screen-time')
      .send({ enabled: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Child not linked to this parent');
  });

  test('child row not found -> 404', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({ data: { child_id: 'c1' } })) // link
      .mockImplementationOnce(() => makeChain({ data: null })); // users lookup

    const res = await request(app)
      .post('/parent/parent@test.com/children/c1/screen-time')
      .send({ enabled: true });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Child not found');
  });

  test('a real save persists all fields and returns them snake_cased', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({ data: { child_id: 'c1' } })) // link
      .mockImplementationOnce(() => makeChain({ data: { email: 'kid@test.com' } })) // child
      .mockImplementationOnce(() => makeChain({ data: null })) // existing user_preferences (none yet)
      .mockImplementationOnce(() => makeChain({ error: null })); // upsert

    const res = await request(app)
      .post('/parent/parent@test.com/children/c1/screen-time')
      .send({
        dailyLimitMinutes: 90, enabled: true, lockWhenReached: true,
        weeklyCapEnabled: true, weeklyCapMinutes: 400,
        allowedHoursEnabled: true, allowedHoursStart: '09:00', allowedHoursEnd: '21:00',
        breakEnforcerEnabled: true, breakIntervalMinutes: 30, breakDurationMinutes: 10,
        homeworkFirstEnabled: true,
        subjectFilterEnabled: true, blockedSubjects: ['Mathematics'],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      controls: expect.objectContaining({
        daily_limit_minutes: 90,
        enabled: true,
        lock_when_reached: true,
        weekly_cap_enabled: true,
        weekly_cap_minutes: 400,
        allowed_hours_enabled: true,
        allowed_hours_start: 9,
        allowed_hours_end: 21,
        break_enforcer_enabled: true,
        break_interval_minutes: 30,
        break_duration_minutes: 10,
        homework_first_enabled: true,
        subject_filter_enabled: true,
        blocked_subjects: ['Mathematics'],
        set_by: 'parent@test.com',
      }),
    });
  });

  test('omitted fields fall back to the existing stored values, not hardcoded defaults', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({ data: { child_id: 'c1' } })) // link
      .mockImplementationOnce(() => makeChain({ data: { email: 'kid@test.com' } })) // child
      .mockImplementationOnce(() => makeChain({
        data: { data: { screen_time: { daily_limit_minutes: 75, enabled: true } } },
      })) // existing preferences
      .mockImplementationOnce(() => makeChain({ error: null })); // upsert

    // Only toggling lockWhenReached - everything else must be preserved.
    const res = await request(app)
      .post('/parent/parent@test.com/children/c1/screen-time')
      .send({ lockWhenReached: true });

    expect(res.status).toBe(200);
    expect(res.body.controls.daily_limit_minutes).toBe(75);
    expect(res.body.controls.enabled).toBe(true);
    expect(res.body.controls.lock_when_reached).toBe(true);
  });

  test('a Supabase write error -> 500', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({ data: { child_id: 'c1' } }))
      .mockImplementationOnce(() => makeChain({ data: { email: 'kid@test.com' } }))
      .mockImplementationOnce(() => makeChain({ data: null }))
      .mockImplementationOnce(() => makeChain({ error: { message: 'db down' } }));

    const res = await request(app)
      .post('/parent/parent@test.com/children/c1/screen-time')
      .send({ enabled: true });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('db down');
  });
});

describe('GET /parent/:parentEmail/children/:childId/screen-time', () => {
  test('child not linked to this parent -> 403', async () => {
    supabase.from.mockImplementationOnce(() => makeChain({ data: null }));

    const res = await request(app).get('/parent/parent@test.com/children/c1/screen-time');

    expect(res.status).toBe(403);
  });

  test('returns saved controls plus computed weekly usage', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({ data: { child_id: 'c1' } })) // link
      .mockImplementationOnce(() => makeChain({ data: { email: 'kid@test.com' } })) // child
      .mockImplementationOnce(() => makeChain({
        data: { data: { screen_time: { enabled: true, daily_limit_minutes: 60, set_by: 'parent@test.com' } } },
      })) // user_preferences
      .mockImplementationOnce(() => makeChain({ data: { today_study_minutes: 25 } })) // student_stats
      .mockImplementationOnce(() => makeChain({
        data: [{ study_minutes: 10 }, { study_minutes: 15 }],
      })); // student_daily_log (last 7 days)

    const res = await request(app).get('/parent/parent@test.com/children/c1/screen-time');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      isEnabled: true,
      dailyLimitMinutes: 60,
      todayUsageMinutes: 25,
      weeklyUsageMinutes: 25,
      setBy: 'parent@test.com',
    });
  });

  test('no screen_time configured yet -> sensible defaults, not nulls/crashes', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({ data: { child_id: 'c1' } }))
      .mockImplementationOnce(() => makeChain({ data: { email: 'kid@test.com' } }))
      .mockImplementationOnce(() => makeChain({ data: null })) // no preferences row at all
      .mockImplementationOnce(() => makeChain({ data: null })) // no stats row
      .mockImplementationOnce(() => makeChain({ data: [] })); // no daily logs

    const res = await request(app).get('/parent/parent@test.com/children/c1/screen-time');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      isEnabled: false,
      dailyLimitMinutes: null,
      weeklyCapMinutes: 300,
      allowedHoursStart: 14,
      allowedHoursEnd: 21,
      todayUsageMinutes: 0,
      weeklyUsageMinutes: 0,
      blockedSubjects: [],
    });
  });
});

describe('GET /parent/screen-time-status/:studentEmail', () => {
  test('no controls configured at all -> hasLimit:false, nothing else computed', async () => {
    supabase.from.mockImplementationOnce(() => makeChain({ data: null })); // user_preferences

    const res = await request(app).get('/parent/screen-time-status/kid@test.com');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasLimit: false });
    // Confirms the route short-circuits - only ONE supabase call was made.
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  test('daily limit reached with lockWhenReached -> isLocked true', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({
        data: { data: { screen_time: { enabled: true, daily_limit_minutes: 60, lock_when_reached: true } } },
      })) // user_preferences
      .mockImplementationOnce(() => makeChain({ data: { id: 'u1' } })) // users
      .mockImplementationOnce(() => makeChain({ data: { today_study_minutes: 60 } })); // student_stats

    const res = await request(app).get('/parent/screen-time-status/kid@test.com');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hasLimit: true, isLocked: true, remainingMinutes: 0, usedMinutes: 60,
    });
  });

  test('under the daily limit -> isLocked false even with lockWhenReached on', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({
        data: { data: { screen_time: { enabled: true, daily_limit_minutes: 60, lock_when_reached: true } } },
      }))
      .mockImplementationOnce(() => makeChain({ data: { id: 'u1' } }))
      .mockImplementationOnce(() => makeChain({ data: { today_study_minutes: 10 } }));

    const res = await request(app).get('/parent/screen-time-status/kid@test.com');

    expect(res.body.isLocked).toBe(false);
    expect(res.body.remainingMinutes).toBe(50);
  });

  test('weekly cap enabled and reached -> weeklyCap.isOverWeeklyCap true', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({
        data: {
          data: {
            screen_time: {
              enabled: false, weekly_cap_enabled: true, weekly_cap_minutes: 300, daily_limit_minutes: 60,
            },
          },
        },
      }))
      .mockImplementationOnce(() => makeChain({ data: { id: 'u1' } }))
      .mockImplementationOnce(() => makeChain({ data: { today_study_minutes: 300 } }));

    const res = await request(app).get('/parent/screen-time-status/kid@test.com');

    expect(res.body.weeklyCap).toEqual({
      enabled: true, weeklyLimitMinutes: 300, weeklyUsedMinutes: 300, isOverWeeklyCap: true,
    });
  });

  test('allowed hours enabled -> reflected in the response', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({
        data: {
          data: {
            screen_time: {
              enabled: false, allowed_hours_enabled: true, allowed_hours_start: 9, allowed_hours_end: 17,
              daily_limit_minutes: 60,
            },
          },
        },
      }))
      .mockImplementationOnce(() => makeChain({ data: { id: 'u1' } }))
      .mockImplementationOnce(() => makeChain({ data: null }));

    const res = await request(app).get('/parent/screen-time-status/kid@test.com');

    expect(res.body.allowedHours).toEqual({ enabled: true, startHour: 9, endHour: 17 });
  });

  test('subject filter enabled -> blocked subjects returned', async () => {
    supabase.from
      .mockImplementationOnce(() => makeChain({
        data: {
          data: {
            screen_time: {
              enabled: false, subject_filter_enabled: true, blocked_subjects: ['Mathematics', 'Science'],
              daily_limit_minutes: 60,
            },
          },
        },
      }))
      .mockImplementationOnce(() => makeChain({ data: { id: 'u1' } }))
      .mockImplementationOnce(() => makeChain({ data: null }));

    const res = await request(app).get('/parent/screen-time-status/kid@test.com');

    expect(res.body.subjectFilter).toEqual({ enabled: true, blockedSubjects: ['Mathematics', 'Science'] });
  });
});
