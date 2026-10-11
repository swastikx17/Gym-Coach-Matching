-- Oracle SQL practice and operational queries. Use bind variables where shown.

-- 1. Display all members.
SELECT * FROM MEMBER ORDER BY CARD_NO;

-- 2. Display all coaches.
SELECT * FROM COACH ORDER BY COACH_ID;

-- 3. Members and their assigned coach (also shows unassigned members).
SELECT m.CARD_NO, m.MEMBER_NAME, m.FITNESS_GOAL, a.COACH_ID, c.COACH_NAME
FROM MEMBER m
LEFT JOIN COACH_ASSIGNMENT a ON a.CARD_NO = m.CARD_NO
LEFT JOIN COACH c ON c.COACH_ID = a.COACH_ID
ORDER BY m.CARD_NO;

-- 4. Members assigned to one coach; change :coach_id in SQL Developer.
SELECT m.CARD_NO, m.MEMBER_NAME, m.FITNESS_GOAL
FROM MEMBER m JOIN COACH_ASSIGNMENT a ON a.CARD_NO=m.CARD_NO
WHERE a.COACH_ID = :coach_id ORDER BY m.MEMBER_NAME;

-- 5. Member count for every coach, including coaches with zero members.
SELECT c.COACH_ID, c.COACH_NAME, COUNT(a.CARD_NO) AS MEMBER_COUNT
FROM COACH c LEFT JOIN COACH_ASSIGNMENT a ON a.COACH_ID=c.COACH_ID
GROUP BY c.COACH_ID, c.COACH_NAME ORDER BY MEMBER_COUNT DESC;

-- 6. Coach(es) with the highest number of members.
SELECT coach_id, coach_name, member_count
FROM (
  SELECT c.COACH_ID, c.COACH_NAME, COUNT(a.CARD_NO) AS MEMBER_COUNT,
         DENSE_RANK() OVER (ORDER BY COUNT(a.CARD_NO) DESC) AS rnk
  FROM COACH c LEFT JOIN COACH_ASSIGNMENT a ON a.COACH_ID=c.COACH_ID
  GROUP BY c.COACH_ID, c.COACH_NAME
) WHERE rnk=1;

-- 7. Members by fitness goal.
SELECT CARD_NO, MEMBER_NAME, FITNESS_GOAL
FROM MEMBER WHERE FITNESS_GOAL = :fitness_goal ORDER BY MEMBER_NAME;

-- 8. Unassigned members.
SELECT m.CARD_NO, m.MEMBER_NAME FROM MEMBER m
LEFT JOIN COACH_ASSIGNMENT a ON a.CARD_NO=m.CARD_NO WHERE a.CARD_NO IS NULL;

-- 9. Update a member goal.
UPDATE MEMBER SET FITNESS_GOAL='Muscle Gain' WHERE CARD_NO='GC1010';
-- COMMIT; -- execute only when you want to keep the change; goal must satisfy CK_MEMBER_GOAL.

-- 10. Reassign member GC1001 to coach 101.
UPDATE COACH_ASSIGNMENT SET COACH_ID=101, ASSIGNED_ON=SYSDATE WHERE CARD_NO='GC1001';

-- 11. Remove assignment without deleting the member.
DELETE FROM COACH_ASSIGNMENT WHERE CARD_NO='GC1010';

-- 12. Add a member (phone must be unique if supplied).
INSERT INTO MEMBER (CARD_NO, MEMBER_NAME, FITNESS_GOAL, PHONE)
VALUES ('GC1011', 'Riya Sen', 'Endurance', '9100001011');

-- 13. Add a coach.
INSERT INTO COACH (COACH_ID, COACH_NAME, SPECIALIZATION, EXPERIENCE_YEARS, CONTACT_NO)
VALUES (106, 'Neel Khanna', 'Mobility', 3, '9000000106');

-- 14. Assign a member to a coach.
INSERT INTO COACH_ASSIGNMENT (CARD_NO, COACH_ID) VALUES ('GC1011', 106);

-- 15. Character functions.
SELECT COACH_NAME, UPPER(COACH_NAME), LOWER(COACH_NAME),
       SUBSTR(COACH_NAME, 1, 3), LENGTH(COACH_NAME) FROM COACH;

-- 16. Aggregates, GROUP BY and HAVING.
SELECT COACH_ID, COUNT(*) AS MEMBER_COUNT
FROM COACH_ASSIGNMENT GROUP BY COACH_ID HAVING COUNT(*) > 1;

-- 17. Subquery: members assigned to coaches whose names begin with Rahul.
SELECT CARD_NO, MEMBER_NAME FROM MEMBER
WHERE CARD_NO IN (
  SELECT a.CARD_NO FROM COACH_ASSIGNMENT a
  WHERE a.COACH_ID IN (SELECT COACH_ID FROM COACH WHERE COACH_NAME LIKE 'Rahul%')
);

-- 18. Assignment join view.
SELECT m.CARD_NO, m.MEMBER_NAME, m.FITNESS_GOAL,
       c.COACH_ID, c.COACH_NAME, c.SPECIALIZATION, a.ASSIGNED_ON
FROM MEMBER m JOIN COACH_ASSIGNMENT a ON a.CARD_NO=m.CARD_NO
JOIN COACH c ON c.COACH_ID=a.COACH_ID ORDER BY c.COACH_ID, m.CARD_NO;

-- 19. Delete member; assignment is removed by ON DELETE CASCADE.
DELETE FROM MEMBER WHERE CARD_NO='GC1011';

-- 20. Delete coach only when it has no assignments.
DELETE FROM COACH WHERE COACH_ID=106;
COMMIT;
