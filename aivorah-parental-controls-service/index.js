require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'aivorah-parental-controls-service' }));

app.use('/parent', require('./routes/parentControls'));

const PORT = process.env.PORT || 3018;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Aivorah Parental Controls service running on http://localhost:${PORT}`);
  });
}

module.exports = app;
