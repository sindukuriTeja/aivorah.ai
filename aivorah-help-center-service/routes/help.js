const express = require('express');
const router = express.Router();
const { getChatReply, sendSupportTicket } = require('../services/help');

// POST /help/chat
// Body: { message, userName? }
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const result = await getChatReply(message.trim());
  if (result.error) return res.status(500).json(result);
  res.json(result);
});

// POST /help/ticket
// Body: { email?, subject, message }
router.post('/ticket', async (req, res) => {
  const senderEmail = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : '';
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';

  if (!subject) {
    return res.status(400).json({ success: false, error: 'subject is required' });
  }
  if (!message) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  const result = await sendSupportTicket({ senderEmail, subject, message });
  if (!result.success) return res.status(500).json(result);
  return res.status(200).json(result);
});

module.exports = router;
