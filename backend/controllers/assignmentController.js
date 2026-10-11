const db = require('../config/db');
const { asyncHandler } = require('../utils');

exports.list = asyncHandler(async (_req, res) => {
  const result = await db.execute(
    `SELECT a.CARD_NO, m.MEMBER_NAME, m.FITNESS_GOAL, a.COACH_ID, c.COACH_NAME, a.ASSIGNED_ON
     FROM COACH_ASSIGNMENT a JOIN MEMBER m ON m.CARD_NO=a.CARD_NO
     JOIN COACH c ON c.COACH_ID=a.COACH_ID ORDER BY c.COACH_ID, m.CARD_NO`);
  res.json(result.rows);
});

exports.create = asyncHandler(async (req, res) => {
  const cardNo = String(req.body.cardNo || '').trim();
  const coachId = Number(req.body.coachId);
  if (!cardNo || !Number.isInteger(coachId) || coachId <= 0) return res.status(400).json({ error: 'Valid card number and coach ID are required.' });
  await db.execute(
    `INSERT INTO COACH_ASSIGNMENT (CARD_NO, COACH_ID, ASSIGNED_ON) VALUES (:cardNo, :coachId, SYSDATE)`,
    { cardNo, coachId }, { autoCommit: true });
  res.status(201).json({ message: 'Coach assigned to member.' });
});

exports.reassign = asyncHandler(async (req, res) => {
  const coachId = Number(req.body.coachId);
  if (!Number.isInteger(coachId) || coachId <= 0) return res.status(400).json({ error: 'A valid coach ID is required.' });
  const result = await db.execute(
    `UPDATE COACH_ASSIGNMENT SET COACH_ID=:coachId, ASSIGNED_ON=SYSDATE WHERE CARD_NO=:cardNo`,
    { coachId, cardNo: req.params.cardNo }, { autoCommit: true });
  if (!result.rowsAffected) return res.status(404).json({ error: 'No assignment exists for this member. Use POST to create one.' });
  res.json({ message: 'Member reassigned successfully.' });
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await db.execute('DELETE FROM COACH_ASSIGNMENT WHERE CARD_NO=:cardNo', { cardNo: req.params.cardNo }, { autoCommit: true });
  if (!result.rowsAffected) return res.status(404).json({ error: 'Assignment not found.' });
  res.json({ message: 'Assignment removed. Member remains registered.' });
});
