const express = require('express');
const router  = express.Router();
const {
  getToday,
  checkin,
  getHistory,
  getParentTasks,
  createParentTask,
  deleteParentTask,
} = require('../services/habits');

// ── GET /habits/today?userEmail= ──────────────────────────────────────────────
router.get('/today', async (req, res) => {
  const { userEmail } = req.query;
  if (!userEmail) return res.status(400).json({ error: 'userEmail required' });
  try {
    res.json(await getToday(userEmail));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /habits/checkin ──────────────────────────────────────────────────────
router.post('/checkin', async (req, res) => {
  const { userEmail, habitId } = req.body;
  if (!userEmail || !habitId) return res.status(400).json({ error: 'userEmail and habitId required' });
  try {
    const result = await checkin(userEmail, habitId);
    if (result.error === 'not_found') return res.status(404).json({ error: 'Habit not found' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /habits/history?userEmail=&days=7 ─────────────────────────────────────
router.get('/history', async (req, res) => {
  const { userEmail, days = 7 } = req.query;
  if (!userEmail) return res.status(400).json({ error: 'userEmail required' });
  try {
    res.json(await getHistory(userEmail, days));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /habits/parent-tasks?childId= ────────────────────────────────────────
router.get('/parent-tasks', async (req, res) => {
  const { childId } = req.query;
  if (!childId) return res.status(400).json({ error: 'childId required' });
  try {
    res.json(await getParentTasks(childId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /habits/parent-tasks ─────────────────────────────────────────────────
router.post('/parent-tasks', async (req, res) => {
  const { parentEmail, childId, childName, grade, curriculum, label, icon, coins } = req.body;
  if (!parentEmail || !childId || !label) return res.status(400).json({ error: 'parentEmail, childId and label required' });
  try {
    res.json(await createParentTask({ parentEmail, childId, childName, grade, curriculum, label, icon, coins }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /habits/parent-tasks/:taskId ───────────────────────────────────────
router.delete('/parent-tasks/:taskId', async (req, res) => {
  try {
    await deleteParentTask(req.params.taskId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
