const db = require('../config/db');
const { asyncHandler, cleanString } = require('../utils');

const memberSelect = `
 SELECT m.CARD_NO, m.MEMBER_NAME, m.FITNESS_GOAL, m.PHONE, m.JOIN_DATE,
        a.COACH_ID, c.COACH_NAME
 FROM MEMBER m
 LEFT JOIN COACH_ASSIGNMENT a ON a.CARD_NO = m.CARD_NO
 LEFT JOIN COACH c ON c.COACH_ID = a.COACH_ID`;

exports.list = asyncHandler(async (req, res) => {
  const binds = {};
  let sql = memberSelect + ' WHERE 1=1';
  if (req.query.search) {
    binds.search = `%${String(req.query.search).trim().toUpperCase()}%`;
    sql += ` AND (UPPER(m.CARD_NO) LIKE :search OR UPPER(m.MEMBER_NAME) LIKE :search OR UPPER(m.FITNESS_GOAL) LIKE :search OR UPPER(c.COACH_NAME) LIKE :search OR TO_CHAR(a.COACH_ID) LIKE :search)`;
  }
  if (req.query.goal) {
    binds.goal = String(req.query.goal).trim();
    sql += ' AND UPPER(m.FITNESS_GOAL) = UPPER(:goal)';
  }
  if (req.query.coachId) {
    binds.coachId = Number(req.query.coachId);
    sql += ' AND a.COACH_ID = :coachId';
  }
  sql += ' ORDER BY m.CARD_NO';
  const result = await db.execute(sql, binds);
  res.json(result.rows);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await db.execute(memberSelect + ' WHERE m.CARD_NO = :cardNo', { cardNo: req.params.cardNo });
  if (!result.rows.length) return res.status(404).json({ error: 'Member not found.' });
  res.json(result.rows[0]);
});

exports.create = asyncHandler(async (req, res) => {
  const cardNo = cleanString(req.body.cardNo);
  const memberName = cleanString(req.body.memberName);
  const fitnessGoal = cleanString(req.body.fitnessGoal);
  const phone = cleanString(req.body.phone) || null;
  if (!cardNo || !memberName || !fitnessGoal) return res.status(400).json({ error: 'Card number, member name and fitness goal are required.' });
  if (cardNo.length > 20 || memberName.length > 100 || fitnessGoal.length > 40) return res.status(400).json({ error: 'One or more fields exceed the allowed length.' });
  await db.execute(
    `INSERT INTO MEMBER (CARD_NO, MEMBER_NAME, FITNESS_GOAL, PHONE, JOIN_DATE)
     VALUES (:cardNo, :memberName, :fitnessGoal, :phone, SYSDATE)`,
    { cardNo, memberName, fitnessGoal, phone }, { autoCommit: true });
  res.status(201).json({ message: 'Member created.', cardNo });
});

exports.update = asyncHandler(async (req, res) => {
  const memberName = cleanString(req.body.memberName);
  const fitnessGoal = cleanString(req.body.fitnessGoal);
  const phone = cleanString(req.body.phone) || null;
  if (!memberName || !fitnessGoal) return res.status(400).json({ error: 'Member name and fitness goal are required.' });
  const result = await db.execute(
    `UPDATE MEMBER SET MEMBER_NAME=:memberName, FITNESS_GOAL=:fitnessGoal, PHONE=:phone
     WHERE CARD_NO=:cardNo`,
    { memberName, fitnessGoal, phone, cardNo: req.params.cardNo }, { autoCommit: true });
  if (!result.rowsAffected) return res.status(404).json({ error: 'Member not found.' });
  res.json({ message: 'Member updated.' });
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await db.execute('DELETE FROM MEMBER WHERE CARD_NO=:cardNo', { cardNo: req.params.cardNo }, { autoCommit: true });
  if (!result.rowsAffected) return res.status(404).json({ error: 'Member not found.' });
  res.json({ message: 'Member deleted.' });
});
