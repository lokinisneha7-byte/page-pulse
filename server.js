const express = require('express');
const cors = require('cors');
const path = require('path');
const { auditUrl, AuditError } = require('./lib/audit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * POST /api/audit
 * Body: { "url": "https://example.com" }
 * Returns: JSON audit report (see README for full contract)
 */
app.post('/api/audit', async (req, res) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: '"url" is required and must be a string.' });
  }

  try {
    const report = await auditUrl(url);
    return res.status(200).json(report);
  } catch (err) {
    if (err instanceof AuditError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    // Unexpected/unhandled error — never crash the process.
    console.error('Unexpected error auditing URL:', err);
    return res.status(500).json({ error: 'Something went wrong while auditing this URL.' });
  }
});

// Fallback so direct refresh on any non-API path still serves the app.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Page Pulse running on http://localhost:${PORT}`);
});

module.exports = app;