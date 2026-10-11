const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/api/health', async (_req, res, next) => {
  try {
    const result = await db.execute('SELECT 1 AS DB_OK FROM DUAL');
    res.json({ status: 'ok', database: result.rows[0].DB_OK === 1 ? 'connected' : 'unknown' });
  } catch (err) { next(err); }
});

app.get('/api/dashboard', async (_req, res, next) => {
  try {
    const result = await db.execute(`
      SELECT (SELECT COUNT(*) FROM MEMBER) AS TOTAL_MEMBERS,
             (SELECT COUNT(*) FROM COACH) AS TOTAL_COACHES,
             (SELECT COUNT(*) FROM COACH_ASSIGNMENT) AS ASSIGNED_MEMBERS,
             ((SELECT COUNT(*) FROM MEMBER) - (SELECT COUNT(*) FROM COACH_ASSIGNMENT)) AS UNASSIGNED_MEMBERS
      FROM DUAL`);
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

app.use('/api/members', require('./routes/members'));
app.use('/api/coaches', require('./routes/coaches'));
app.use('/api/assignments', require('./routes/assignments'));

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.errorNum === 1) return res.status(409).json({ error: 'A record with that unique identifier already exists.' });
  if (err.errorNum === 2291) return res.status(400).json({ error: 'Invalid member or coach ID. Check that both records exist.' });
  if (err.errorNum === 2292) return res.status(409).json({ error: 'This record is referenced by another record. Remove related assignments first.' });
  if (err.errorNum === 2290) return res.status(400).json({ error: 'A database validation rule was not satisfied.' });
  if (err.code === 'NJS-040' || err.errorNum === 1017) return res.status(503).json({ error: 'Oracle connection failed. Check backend/.env and database availability.' });
  res.status(500).json({ error: 'Unexpected server/database error. Check backend terminal logs.' });
});

const port = Number(process.env.PORT || 3000);
let server;
(async () => {
  try {
    await db.initializePool();
    server = app.listen(port, () => console.log(`Gym Coach Matching API running at http://localhost:${port}`));
  } catch (err) {
    console.error('Unable to start: Oracle connection pool could not be created.', err.message);
    process.exit(1);
  }
})();
async function shutdown() {
  if (server) server.close();
  try { await db.closePool(); } catch (err) { console.error(err.message); }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
