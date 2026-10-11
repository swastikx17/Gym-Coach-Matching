# Gym Coach Matching System

**DBMS full-stack project** — Student: **Swastik Satyam**, Registration No. **25BCB0039**

A real Oracle-backed gym member and coach administration dashboard. The browser uses HTML/CSS/JavaScript and calls an Express REST API; only the Node.js backend connects to Oracle using `oracledb`. No application data is hardcoded into the UI.

## Features

- Dashboard counts: members, coaches, assigned and unassigned members.
- Member CRUD with card number, name, fitness goal and optional phone.
- Coach CRUD with internal coach ID, name, specialization, experience and optional contact.
- Assign, reassign and remove a member's current coach assignment.
- View members per coach; search/filter members by text, fitness goal and coach; search coaches by ID/name/specialization.
- Oracle constraints, parameterized SQL, backend validation and readable error messages.
- Responsive HTML/CSS/JavaScript frontend.

## Requirements

- Node.js 18 or newer and npm.
- Oracle Database (Oracle Free/XE, 19c, or a compatible Oracle instance).
- Oracle SQL Developer or SQL*Plus.
- Network access from the Node.js machine to the Oracle listener.

The `oracledb` package uses Thin mode by default in supported versions, so Oracle Instant Client is not normally needed for this project. If your Oracle environment requires Thick mode, follow the official node-oracledb installation documentation.

## Project layout

```text
Gym-Coach-Matching/
├── frontend/                 # Static HTML, CSS, JS
├── backend/
│   ├── server.js             # Express app and dashboard/health endpoints
│   ├── package.json
│   ├── .env.example
│   ├── config/db.js          # Oracle connection pool and execute helper
│   ├── controllers/          # Parameterized SQL and validation
│   └── routes/               # REST route definitions
├── database/
│   ├── schema.sql
│   ├── sample_data.sql
│   └── queries.sql
├── PROJECT_REPORT.md         # Detailed report / DBMS documentation
└── README.md
```

## 1. Database setup

1. Start Oracle Database and confirm the PDB/service name. For a common local Oracle Free installation, the service may be `localhost:1521/FREEPDB1`; for XE it may be `localhost:1521/XEPDB1`. Use the actual service configured on your machine.
2. Open SQL Developer and connect as the schema owner/application user. Use your own credentials; do not use a privileged SYS account for the app.
3. Open `database/schema.sql` and run it as a script (F5). It creates `COACH`, `MEMBER`, and `COACH_ASSIGNMENT`.
4. Open `database/sample_data.sql` and run it as a script. It inserts five coaches, ten members and nine assignments; GC1010 is intentionally unassigned.
5. Verify:
   ```sql
   SELECT table_name FROM user_tables
   WHERE table_name IN ('COACH','MEMBER','COACH_ASSIGNMENT')
   ORDER BY table_name;

   SELECT COUNT(*) FROM COACH;
   SELECT COUNT(*) FROM MEMBER;
   SELECT COUNT(*) FROM COACH_ASSIGNMENT;
   ```
   Expected counts immediately after seed setup: 5 coaches, 10 members, 9 assignments.
6. To re-run the schema from scratch, drop tables in dependency order first:
   ```sql
   DROP TABLE COACH_ASSIGNMENT CASCADE CONSTRAINTS;
   DROP TABLE MEMBER CASCADE CONSTRAINTS;
   DROP TABLE COACH CASCADE CONSTRAINTS;
   ```
   Only do this in a development schema; it deletes the data.

## 2. Backend setup

Open a terminal in the project directory:

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and edit it with your own Oracle account and service:

```dotenv
PORT=3000
DB_USER=your_oracle_username
DB_PASSWORD=your_oracle_password
DB_CONNECT_STRING=localhost:1521/FREEPDB1
```

Never commit `.env` or share database credentials. `DB_CONNECT_STRING` must match your Oracle host, port and service name.

Start the API (from `backend/`):

```bash
npm start
```

The server creates an Oracle connection pool at startup. A successful startup prints `Gym Coach Matching API running at http://localhost:3000`. If it exits, verify Oracle is running, the credentials are correct, the service name is right, and the database user can access the three tables.

## 3. Frontend setup

The Express server serves the frontend from the same origin, so no separate frontend server is needed. With the backend running, open:

**http://localhost:3000**

Do not open `frontend/index.html` directly as a `file://` URL. Serving it through Express keeps API requests same-origin.

## 4. Verify Frontend → Backend → Oracle

1. Open `http://localhost:3000/api/health`. Expected shape: `{"status":"ok","database":"connected"}`.
2. Open `http://localhost:3000/api/members`; rows should match Oracle's `MEMBER` table and joins.
3. Open the dashboard at `http://localhost:3000`. The totals should initially show 10 members, 5 coaches, 9 assigned and 1 unassigned.
4. Add a member through the UI, then run `SELECT * FROM MEMBER WHERE CARD_NO='your-card';` in SQL Developer.
5. Assign the member to a coach, then verify `SELECT * FROM COACH_ASSIGNMENT WHERE CARD_NO='your-card';`.
6. Edit a fitness goal, reassign a coach, remove an assignment, and verify each change with SQL Developer.
7. Try a duplicate card number or invalid coach ID; the UI should show a readable error and Oracle should reject invalid data.

## REST API

All endpoints return JSON. IDs and data are validated server-side, and values are bound as parameters rather than concatenated into SQL.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check API and Oracle connectivity |
| GET | `/api/dashboard` | Dashboard totals |
| GET | `/api/members` | List members; optional `?search=`, `?goal=`, `?coachId=` |
| GET | `/api/members/:cardNo` | Fetch one member |
| POST | `/api/members` | Create member |
| PUT | `/api/members/:cardNo` | Update member details/goal/phone |
| DELETE | `/api/members/:cardNo` | Delete member and its assignment |
| GET | `/api/coaches` | List coaches and member counts; optional `?search=` |
| GET | `/api/coaches/:coachId` | Fetch one coach |
| GET | `/api/coaches/:coachId/members` | List members assigned to a coach |
| POST | `/api/coaches` | Create coach |
| PUT | `/api/coaches/:coachId` | Update coach |
| DELETE | `/api/coaches/:coachId` | Delete coach only when no assignment references it |
| GET | `/api/assignments` | List current assignments |
| POST | `/api/assignments` | Assign a member (`{ "cardNo":"GC1010", "coachId":101 }`) |
| PUT | `/api/assignments/:cardNo` | Reassign a member (`{ "coachId":102 }`) |
| DELETE | `/api/assignments/:cardNo` | Remove assignment, retaining member |

Example API requests:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/members
curl -X POST http://localhost:3000/api/assignments \
  -H "Content-Type: application/json" \
  -d "{\"cardNo\":\"GC1010\",\"coachId\":101}"
```

## Data model decisions

`COACH` and `MEMBER` are entity tables. `COACH_ASSIGNMENT` represents the current relationship. Its primary key is `CARD_NO`, so a member can have at most one active coach; `COACH_ID` is a foreign key and is not unique, so one coach can have many members. A member may be unassigned by having no row in `COACH_ASSIGNMENT`. Deleting a member cascades to its assignment; deleting a coach with active assignments is blocked and handled with a friendly API error.

See `PROJECT_REPORT.md` for ER diagram, relational schema, functional dependencies, normalization, test cases, and full project documentation.
