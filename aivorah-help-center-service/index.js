require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'aivorah-help-center-service' }));

app.use('/help', require('./routes/help'));

const PORT = process.env.PORT || 3013;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Aivorah Help Center service running on http://localhost:${PORT}`);
  });
}

module.exports = app;
