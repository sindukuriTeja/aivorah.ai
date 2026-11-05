const request = require('supertest');

jest.mock('../../services/habits', () => ({
  getToday: jest.fn(),
  checkin: jest.fn(),
  getHistory: jest.fn(),
  getParentTasks: jest.fn(),
  createParentTask: jest.fn(),
  deleteParentTask: jest.fn(),
}));

const {
  getToday, checkin, getHistory, getParentTasks, createParentTask, deleteParentTask,
} = require('../../services/habits');
const app = require('../../index');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /health', () => {
  test('reports ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'aivorah-daily-habits-service' });
  });
});

describe('GET /habits/today', () => {
  test('requires userEmail', async () => {
    const res = await request(app).get('/habits/today');
    expect(res.status).toBe(400);
  });

  test('returns the real data from getToday', async () => {
    getToday.mockResolvedValue({ habits: [], today: { completed: [], coinsEarned: 0 }, streak: 0 });
    const res = await request(app).get('/habits/today?userEmail=a@a.com');
    expect(res.status).toBe(200);
    expect(getToday).toHaveBeenCalledWith('a@a.com');
    expect(res.body.streak).toBe(0);
  });

  test('a service error maps to 500', async () => {
    getToday.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/habits/today?userEmail=a@a.com');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'db down' });
  });
});

describe('POST /habits/checkin', () => {
  test('requires userEmail and habitId', async () => {
    const res = await request(app).post('/habits/checkin').send({ userEmail: 'a@a.com' });
    expect(res.status).toBe(400);
  });

  test('returns the real checkin result', async () => {
    checkin.mockResolvedValue({ checked: true, coinsChange: 5, totalCoins: 15 });
    const res = await request(app).post('/habits/checkin').send({ userEmail: 'a@a.com', habitId: 't1' });
    expect(res.status).toBe(200);
    expect(checkin).toHaveBeenCalledWith('a@a.com', 't1');
    expect(res.body.totalCoins).toBe(15);
  });

  test('a not_found result maps to a real 404', async () => {
    checkin.mockResolvedValue({ error: 'not_found' });
    const res = await request(app).post('/habits/checkin').send({ userEmail: 'a@a.com', habitId: 'ghost' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Habit not found' });
  });

  test('a service error maps to 500', async () => {
    checkin.mockRejectedValue(new Error('db down'));
    const res = await request(app).post('/habits/checkin').send({ userEmail: 'a@a.com', habitId: 't1' });
    expect(res.status).toBe(500);
  });
});

describe('GET /habits/history', () => {
  test('requires userEmail', async () => {
    const res = await request(app).get('/habits/history');
    expect(res.status).toBe(400);
  });

  test('defaults days to 7 and returns the real history', async () => {
    getHistory.mockResolvedValue({ history: [], streak: 0 });
    const res = await request(app).get('/habits/history?userEmail=a@a.com');
    expect(res.status).toBe(200);
    expect(getHistory).toHaveBeenCalledWith('a@a.com', 7);
  });

  test('honors a real custom days value', async () => {
    getHistory.mockResolvedValue({ history: [], streak: 0 });
    await request(app).get('/habits/history?userEmail=a@a.com&days=30');
    expect(getHistory).toHaveBeenCalledWith('a@a.com', '30');
  });
});

describe('GET /habits/parent-tasks', () => {
  test('requires childId', async () => {
    const res = await request(app).get('/habits/parent-tasks');
    expect(res.status).toBe(400);
  });

  test('returns the real tasks list', async () => {
    getParentTasks.mockResolvedValue([{ id: 't1', label: 'Brush teeth', completedToday: true }]);
    const res = await request(app).get('/habits/parent-tasks?childId=student-1');
    expect(res.status).toBe(200);
    expect(getParentTasks).toHaveBeenCalledWith('student-1');
    expect(res.body).toEqual([{ id: 't1', label: 'Brush teeth', completedToday: true }]);
  });
});

describe('POST /habits/parent-tasks', () => {
  test('requires parentEmail, childId, and label', async () => {
    const res = await request(app).post('/habits/parent-tasks').send({ parentEmail: 'p@a.com' });
    expect(res.status).toBe(400);
  });

  test('creates the real task with real fields', async () => {
    createParentTask.mockResolvedValue({ id: 'new-task', label: 'Brush teeth' });
    const res = await request(app).post('/habits/parent-tasks').send({ parentEmail: 'p@a.com', childId: 'c1', childName: 'Sri S', grade: 'Grade 10', curriculum: 'CBSE', label: 'Brush teeth', icon: 'smile', coins: 5 });
    expect(res.status).toBe(200);
    expect(createParentTask).toHaveBeenCalledWith({ parentEmail: 'p@a.com', childId: 'c1', childName: 'Sri S', grade: 'Grade 10', curriculum: 'CBSE', label: 'Brush teeth', icon: 'smile', coins: 5 });
  });

  test('a service error maps to 500', async () => {
    createParentTask.mockRejectedValue(new Error('insert failed'));
    const res = await request(app).post('/habits/parent-tasks').send({ parentEmail: 'p@a.com', childId: 'c1', label: 'Read' });
    expect(res.status).toBe(500);
  });
});

describe('DELETE /habits/parent-tasks/:taskId', () => {
  test('deletes the real task and returns success', async () => {
    deleteParentTask.mockResolvedValue(undefined);
    const res = await request(app).delete('/habits/parent-tasks/task-1');
    expect(res.status).toBe(200);
    expect(deleteParentTask).toHaveBeenCalledWith('task-1');
    expect(res.body).toEqual({ success: true });
  });

  test('a service error maps to 500', async () => {
    deleteParentTask.mockRejectedValue(new Error('delete failed'));
    const res = await request(app).delete('/habits/parent-tasks/task-1');
    expect(res.status).toBe(500);
  });
});
