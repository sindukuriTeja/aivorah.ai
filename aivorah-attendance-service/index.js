require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requireUser } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'aivorah-attendance-service' }));

app.use('/classes', requireUser, require('./routes/classes'));
app.use('/attendance', requireUser, require('./routes/attendance'));

const PORT = process.env.PORT || 3022;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Aivorah Attendance service on http://localhost:${PORT}`));
}

module.exports = app;
