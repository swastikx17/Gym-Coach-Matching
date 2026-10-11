const db = require('../config/db');
const { asyncHandler, cleanString } = require('../utils');

exports.list = asyncHandler(async (req, res) => {
  const binds = {};
  let sql = `SELECT c.COACH_ID, c.COACH_NAME, c.SPECIALIZATION, c.EXPERIENCE_YEARS, c.CONTACT_NO,
    COUNT(a.CARD_NO) AS MEMBER_COUNT
    FROM COACH c LEFT JOIN COACH_ASSIGNMENT a ON a.COACH_ID=c.COACH_ID WHERE 1=1`;
  if (req.query.search) {
    binds.search = `%${String(req.query.search).trim().toUpperCase()}%`;
    sql += ' AND (UPPER(c.COACH_NAME) LIKE :search OR UPPER(c.SPECIALIZATION) LIKE :search OR TO_CHAR(c.COACH_ID) LIKE :search)';
  }
  sql += ' GROUP BY c.COACH_ID, c.COACH_NAME, c.SPECIALIZATION, c.EXPERIENCE_YEARS, c.CONTACT_NO ORDER BY c.COACH_ID';
  const result = await db.execute(sql, binds);
  res.json(result.rows);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await db.execute(
    `SELECT c.COACH_ID, c.COACH_NAME, c.SPECIALIZATION, c.EXPERIENCE_YEARS, c.CONTACT_NO,
      COUNT(a.CARD_NO) AS MEMBER_COUNT
     FROM COACH c LEFT JOIN COACH_ASSIGNMENT a ON a.COACH_ID=c.COACH_ID
     WHERE c.COACH_ID=:coachId
     GROUP BY c.COACH_ID, c.COACH_NAME, c.SPECIALIZATION, c.EXPERIENCE_YEARS, c.CONTACT_NO`,
    { coachId: Number(req.params.coachId) });
  if (!result.rows.length) return res.status(404).json({ error: 'Coach not found.' });
  res.json(result.rows[0]);
});

exports.create = asyncHandler(async (req, res) => {
  const coachId = Number(req.body.coachId);
  const coachName = cleanString(req.body.coachName);
  const specialization = cleanString(req.body.specialization) || 'General Fitness';
  const experienceYears = Number(req.body.experienceYears ?? 0);
  const contactNo = cleanString(req.body.contactNo) || null;
  if (!Number.isInteger(coachId) || coachId <= 0 || !coachName) return res.status(400).json({ error: 'A positive coach ID and coach name are required.' });
  if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 60) return res.status(400).json({ error: 'Experience must be an integer between 0 and 60.' });
  await db.execute(
    `INSERT INTO COACH (COACH_ID, COACH_NAME, SPECIALIZATION, EXPERIENCE_YEARS, CONTACT_NO)
     VALUES (:coachId, :coachName, :specialization, :experienceYears, :contactNo)`,
    { coachId, coachName, specialization, experienceYears, contactNo }, { autoCommit: true });
  res.status(201).json({ message: 'Coach created.', coachId });
});

exports.update = asyncHandler(async (req, res) => {
  const coachName = cleanString(req.body.coachName);
  const specialization = cleanString(req.body.specialization) || 'General Fitness';
  const experienceYears = Number(req.body.experienceYears ?? 0);
  const contactNo = cleanString(req.body.contactNo) || null;
  if (!coachName) return res.status(400).json({ error: 'Coach name is required.' });
  if (!Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 60) return res.status(400).json({ error: 'Experience must be an integer between 0 and 60.' });
  const result = await db.execute(
    `UPDATE COACH SET COACH_NAME=:coachName, SPECIALIZATION=:specialization,
      EXPERIENCE_YEARS=:experienceYears, CONTACT_NO=:contactNo WHERE COACH_ID=:coachId`,
    { coachName, specialization, experienceYears, contactNo, coachId: Number(req.params.coachId) }, { autoCommit: true });
  if (!result.rowsAffected) return res.status(404).json({ error: 'Coach not found.' });
  res.json({ message: 'Coach updated.' });
});

exports.remove = asyncHandler(async (req, res) => {
  try {
    const result = await db.execute('DELETE FROM COACH WHERE COACH_ID=:coachId', { coachId: Number(req.params.coachId) }, { autoCommit: true });
    if (!result.rowsAffected) return res.status(404).json({ error: 'Coach not found.' });
    res.json({ message: 'Coach deleted.' });
  } catch (err) {
    if (err.errorNum === 2292) return res.status(409).json({ error: 'This coach still has member assignments. Reassign or remove those assignments first.' });
    throw err;
  }
});

exports.members = asyncHandler(async (req, res) => {
  const result = await db.execute(
    `SELECT m.CARD_NO, m.MEMBER_NAME, m.FITNESS_GOAL, m.PHONE
     FROM MEMBER m JOIN COACH_ASSIGNMENT a ON a.CARD_NO=m.CARD_NO
     WHERE a.COACH_ID=:coachId ORDER BY m.MEMBER_NAME`,
    { coachId: Number(req.params.coachId) });
  res.json(result.rows);
});
