require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'aivorah-messages-service' }));

// The frontend makes calls directly to `/messages/...`, but typically an API gateway 
// or reverse proxy strips that or forwards it. 
// We'll mount it at `/messages` so it cleanly matches the frontend's expected paths.
app.use('/messages', require('./routes/messages'));

// Group/class chat rooms — a separate table family from the 1:1 `messages`
// route above (see routes/channels.js header). Ported from the ai-mentor
// monolith's routes/channels.js.
app.use('/channels', require('./routes/channels'));

app.use('/notifications', require('./routes/notifications'));

const PORT = process.env.PORT || 3020;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Aivorah Messages service running on http://localhost:${PORT}`);
  });
  require('./services/realtime').attach(server);
}

module.exports = app;
