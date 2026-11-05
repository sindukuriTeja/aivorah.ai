const express = require('express');
const { requireUser } = require('../middleware/firebaseAuth');
const svc = require('../services/notifications');

const router = express.Router();
router.use(requireUser);

// GET /notifications?limit=&cursor=&unreadOnly=true — newest first, keyset-paginated
router.get('/', async (req, res) => {
  const cursor = req.query.cursor ? svc.decodeCursor(req.query.cursor) : null;
  if (req.query.cursor && !cursor) return res.status(400).json({ error: 'Invalid cursor' });
  try {
    const page = await svc.listNotifications(req.auth.userId, {
      limit: svc.parseLimit(req.query.limit),
      cursor,
      unreadOnly: req.query.unreadOnly === 'true',
    });
    res.json(page);
  } catch (err) {
    svc.logEvent({ evt: 'notification.list', ok: false, recipient: req.auth.userId, reason: err.message });
    res.status(500).json({ error: 'Could not load notifications' });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    res.json({ count: await svc.unreadCount(req.auth.userId) });
  } catch (err) {
    svc.logEvent({ evt: 'notification.count', ok: false, recipient: req.auth.userId, reason: err.message });
    res.status(500).json({ error: 'Could not load unread count' });
  }
});

// POST /notifications/read-all  body: { type? }
router.post('/read-all', async (req, res) => {
  const type = req.body?.type;
  if (type !== undefined && !svc.EVENT_TYPES.includes(type)) return res.status(400).json({ error: 'Unknown type' });
  try {
    const marked = await svc.markAllRead(req.auth.userId, { type });
    svc.logEvent({ evt: 'notification.read_all', ok: true, recipient: req.auth.userId, type: type || 'all', marked });
    res.json({ marked });
  } catch (err) {
    svc.logEvent({ evt: 'notification.read_all', ok: false, recipient: req.auth.userId, reason: err.message });
    res.status(500).json({ error: 'Could not mark notifications read' });
  }
});

router.post('/:id/read', async (req, res) => {
  try {
    const item = await svc.markRead(req.auth.userId, req.params.id);
    if (!item) return res.status(404).json({ error: 'Notification not found' });
    svc.logEvent({ evt: 'notification.read', ok: true, recipient: req.auth.userId, notificationId: item.id });
    res.json(item);
  } catch (err) {
    svc.logEvent({ evt: 'notification.read', ok: false, recipient: req.auth.userId, notificationId: req.params.id, reason: err.message });
    res.status(500).json({ error: 'Could not mark notification read' });
  }
});

module.exports = router;
