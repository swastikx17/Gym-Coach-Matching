import os
import sys
import time
import json
import sqlite3
import datetime
from decimal import Decimal
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"
ENV_FILE = BASE_DIR / ".env"

# Load .env manually if exists
env_vars = {}
if ENV_FILE.exists():
    with open(ENV_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip()

PORT = int(os.environ.get("PORT") or env_vars.get("PORT") or 3000)
DB_USER = os.environ.get("DB_USER") or env_vars.get("DB_USER") or "system"
DB_PASSWORD = os.environ.get("DB_PASSWORD") or env_vars.get("DB_PASSWORD") or "swastik"
DB_CONNECT_STRING = os.environ.get("DB_CONNECT_STRING") or env_vars.get("DB_CONNECT_STRING") or "localhost:1521/XE"
DB_ENGINE_PREF = os.environ.get("DB_ENGINE") or env_vars.get("DB_ENGINE") or "auto"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
CORS(app)

# In-memory SQL execution log for live website demonstration
SQL_LOGS = []
MAX_LOGS = 100
LOG_COUNTER = 0

def format_sql_with_params(sql, params):
    if not params:
        return sql.strip()
    formatted = sql
    for p in params:
        if p is None:
            rep = "NULL"
        elif isinstance(p, (int, float, Decimal)):
            rep = str(p)
        else:
            rep = f"'{str(p)}'"
        formatted = formatted.replace("?", rep, 1)
    return formatted.strip()

def detect_operation_and_table(sql):
    upper = sql.strip().upper()
    op = "SQL"
    for candidate in ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER"]:
        if upper.startswith(candidate):
            op = candidate
            break
    
    table = "UNKNOWN"
    for t in ["AUDIT_USER_UPDATES", "COACH_ASSIGNMENT", "MEMBER", "COACH", "DUAL"]:
        if t in upper:
            table = t
            break
    return op, table

def log_sql(sql, params, duration_ms, rows_affected, status="SUCCESS", error=None):
    global LOG_COUNTER, SQL_LOGS
    LOG_COUNTER += 1
    op, table = detect_operation_and_table(sql)
    rendered_sql = format_sql_with_params(sql, params)
    
    log_entry = {
        "id": LOG_COUNTER,
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        "raw_sql": sql.strip(),
        "rendered_sql": rendered_sql,
        "params": [str(p) if isinstance(p, Decimal) else p for p in (params or [])],
        "operation": op,
        "table": table,
        "duration_ms": round(duration_ms, 2),
        "rows_affected": rows_affected,
        "status": status,
        "error": error
    }
    SQL_LOGS.insert(0, log_entry)
    if len(SQL_LOGS) > MAX_LOGS:
        SQL_LOGS.pop()
    return log_entry

# Database Abstraction Layer supporting Oracle Database XE & SQLite
db_type = None

def get_oracle_connection():
    import pyodbc
    conn_str = f"Driver={{Oracle in XE}};Dbq={DB_CONNECT_STRING};Uid={DB_USER};Pwd={DB_PASSWORD};"
    return pyodbc.connect(conn_str, autocommit=True)

SQLITE_PATH = BASE_DIR / "gym_database.sqlite"

def init_sqlite_db():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS COACH (
        COACH_ID INTEGER PRIMARY KEY,
        COACH_NAME TEXT NOT NULL,
        SPECIALIZATION TEXT NOT NULL DEFAULT 'General Fitness',
        EXPERIENCE_YEARS INTEGER NOT NULL DEFAULT 0,
        CONTACT_NO TEXT UNIQUE
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS MEMBER (
        CARD_NO TEXT PRIMARY KEY,
        MEMBER_NAME TEXT NOT NULL,
        FITNESS_GOAL TEXT NOT NULL,
        PHONE TEXT UNIQUE,
        JOIN_DATE TEXT NOT NULL
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS COACH_ASSIGNMENT (
        CARD_NO TEXT PRIMARY KEY,
        COACH_ID INTEGER NOT NULL,
        ASSIGNED_ON TEXT NOT NULL,
        FOREIGN KEY (CARD_NO) REFERENCES MEMBER(CARD_NO) ON DELETE CASCADE,
        FOREIGN KEY (COACH_ID) REFERENCES COACH(COACH_ID)
    )
    """)
    cur.execute("""
    CREATE TABLE IF NOT EXISTS AUDIT_USER_UPDATES (
        LOG_ID INTEGER PRIMARY KEY AUTOINCREMENT,
        CARD_NO TEXT NOT NULL,
        MEMBER_NAME TEXT NOT NULL,
        FIELD_CHANGED TEXT NOT NULL,
        OLD_VALUE TEXT,
        NEW_VALUE TEXT,
        SQL_STATEMENT TEXT,
        UPDATED_AT TEXT NOT NULL
    )
    """)
    # Check if seed data exists
    cur.execute("SELECT COUNT(*) FROM COACH")
    if cur.fetchone()[0] == 0:
        sample_coaches = [
            (101, 'Aarav Sharma', 'Strength Training', 8, '9000000101'),
            (102, 'Priya Nair', 'Weight Management', 5, '9000000102'),
            (103, 'Rahul Mehta', 'Endurance', 6, '9000000103'),
            (104, 'Kavya Iyer', 'General Fitness', 4, '9000000104'),
            (105, 'Karan Patel', 'Muscle Gain', 9, '9000000105')
        ]
        cur.executemany("INSERT INTO COACH VALUES (?,?,?,?,?)", sample_coaches)
        sample_members = [
            ('GC1001', 'Ananya Rao', 'Weight Loss', '9100001001', '2026-01-10'),
            ('GC1002', 'Vihaan Kapoor', 'Muscle Gain', '9100001002', '2026-01-12'),
            ('GC1003', 'Diya Menon', 'Strength Training', '9100001003', '2026-02-01'),
            ('GC1004', 'Ishaan Verma', 'General Fitness', '9100001004', '2026-02-07'),
            ('GC1005', 'Meera Joshi', 'Endurance', '9100001005', '2026-02-11'),
            ('GC1006', 'Arjun Das', 'Fat Loss', '9100001006', '2026-03-04'),
            ('GC1007', 'Sara Thomas', 'Flexibility', '9100001007', '2026-03-12'),
            ('GC1008', 'Aditya Singh', 'Strength Training', '9100001008', '2026-03-18'),
            ('GC1009', 'Nisha Reddy', 'Cardio Fitness', '9100001009', '2026-04-02'),
            ('GC1010', 'Kabir Shah', 'General Fitness', '9100001010', '2026-04-15')
        ]
        cur.executemany("INSERT INTO MEMBER VALUES (?,?,?,?,?)", sample_members)
        sample_assignments = [
            ('GC1001', 102, '2026-01-10'),
            ('GC1002', 105, '2026-01-12'),
            ('GC1003', 101, '2026-02-01'),
            ('GC1004', 104, '2026-02-07'),
            ('GC1005', 103, '2026-02-11'),
            ('GC1006', 102, '2026-03-04'),
            ('GC1007', 104, '2026-03-12'),
            ('GC1008', 101, '2026-03-18'),
            ('GC1009', 103, '2026-04-02')
        ]
        cur.executemany("INSERT INTO COACH_ASSIGNMENT VALUES (?,?,?)", sample_assignments)
        conn.commit()
    conn.close()

# Detect and configure database
try:
    if DB_ENGINE_PREF != "sqlite":
        test_conn = get_oracle_connection()
        test_conn.close()
        db_type = "oracle"
        print("[Database] Connected successfully to Oracle Database XE (localhost:1521/XE)")
    else:
        init_sqlite_db()
        db_type = "sqlite"
        print("[Database] Initialized SQLite database engine")
except Exception as e:
    print(f"[Database] Oracle connection notice: {e}. Using SQLite fallback.")
    init_sqlite_db()
    db_type = "sqlite"

def get_connection():
    if db_type == "oracle":
        return get_oracle_connection()
    else:
        conn = sqlite3.connect(SQLITE_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

def serialize_val(val):
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(val, Decimal):
        return int(val) if val % 1 == 0 else float(val)
    if isinstance(val, float) and val.is_integer():
        return int(val)
    return val

def execute_query(sql, params=None):
    params = params or []
    t0 = time.time()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        if cur.description:
            cols = [d[0] for d in cur.description]
            rows = []
            for r in cur.fetchall():
                row_dict = {}
                for col_name, val in zip(cols, r):
                    row_dict[col_name] = serialize_val(val)
                rows.append(row_dict)
            elapsed = (time.time() - t0) * 1000.0
            log_sql(sql, params, elapsed, len(rows), "SUCCESS")
            return rows
        else:
            if hasattr(conn, "commit"):
                conn.commit()
            elapsed = (time.time() - t0) * 1000.0
            log_sql(sql, params, elapsed, cur.rowcount, "SUCCESS")
            return cur.rowcount
    except Exception as e:
        elapsed = (time.time() - t0) * 1000.0
        log_sql(sql, params, elapsed, 0, "ERROR", str(e))
        raise
    finally:
        conn.close()

def execute_update(sql, params=None):
    params = params or []
    t0 = time.time()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        if hasattr(conn, "commit"):
            conn.commit()
        cnt = cur.rowcount
        elapsed = (time.time() - t0) * 1000.0
        log_sql(sql, params, elapsed, cnt, "SUCCESS")
        return cnt
    except Exception as e:
        elapsed = (time.time() - t0) * 1000.0
        log_sql(sql, params, elapsed, 0, "ERROR", str(e))
        raise
    finally:
        conn.close()

# ----------------- Frontend Routes -----------------
@app.route("/")
def index():
    return send_from_directory(str(FRONTEND_DIR), "index.html")

@app.route("/<path:path>")
def static_proxy(path):
    if (FRONTEND_DIR / path).exists():
        return send_from_directory(str(FRONTEND_DIR), path)
    return send_from_directory(str(FRONTEND_DIR), "index.html")

# ----------------- ADMIN ONLY: LIVE DATABASE AUDIT -----------------
@app.route("/api/admin/live-updates", methods=["GET"])
def get_live_user_updates():
    try:
        sql = """
        SELECT LOG_ID, CARD_NO, MEMBER_NAME, FIELD_CHANGED, OLD_VALUE, NEW_VALUE, SQL_STATEMENT, UPDATED_AT
        FROM AUDIT_USER_UPDATES
        ORDER BY UPDATED_AT DESC
        """
        updates = execute_query(sql)
        return jsonify({
            "status": "success",
            "engine": f"Oracle Database XE (11g)" if db_type == "oracle" else "SQLite",
            "total_updates": len(updates),
            "updates": updates
        })
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route("/api/admin/live-updates/clear", methods=["POST"])
def clear_live_user_updates():
    try:
        execute_update("DELETE FROM AUDIT_USER_UPDATES")
        return jsonify({"message": "Live audit logs cleared."})
    except Exception as err:
        return jsonify({"error": str(err)}), 500

# ----------------- USER PORTAL: SELF-SERVICE PROFILE UPDATES -----------------
@app.route("/api/user/profile/<card_no>", methods=["GET"])
def get_user_profile(card_no):
    try:
        sql = f"{MEMBER_SELECT} WHERE m.CARD_NO = ?"
        members = execute_query(sql, [card_no])
        if not members:
            return jsonify({"error": "Member not found."}), 404
        return jsonify(members[0])
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route("/api/user/update-profile", methods=["POST"])
def user_update_profile():
    try:
        data = request.get_json(force=True) or {}
        card_no = (data.get("cardNo") or "").strip()
        new_name = (data.get("memberName") or "").strip()
        new_goal = (data.get("fitnessGoal") or "").strip()
        new_phone = (data.get("phone") or "").strip() or None

        if not card_no or not new_name or not new_goal:
            return jsonify({"error": "Card number, member name, and fitness goal are required."}), 400

        allowed_goals = ['Weight Loss', 'Muscle Gain', 'Strength Training', 'General Fitness', 'Endurance', 'Fat Loss', 'Flexibility', 'Cardio Fitness']
        if new_goal not in allowed_goals:
            return jsonify({"error": f"Invalid fitness goal. Must be one of: {', '.join(allowed_goals)}"}), 400

        # 1. Fetch current existing row to compute audit diff
        current_rows = execute_query("SELECT MEMBER_NAME, FITNESS_GOAL, PHONE FROM MEMBER WHERE CARD_NO = ?", [card_no])
        if not current_rows:
            return jsonify({"error": "Member not found."}), 404

        current = current_rows[0]
        old_name = current.get("MEMBER_NAME")
        old_goal = current.get("FITNESS_GOAL")
        old_phone = current.get("PHONE")

        changes = []
        if old_name != new_name:
            changes.append(("Member Name", old_name, new_name))
        if old_goal != new_goal:
            changes.append(("Fitness Goal", old_goal, new_goal))
        if (old_phone or "") != (new_phone or ""):
            changes.append(("Phone Number", old_phone or "None", new_phone or "None"))

        # 2. Execute update on MEMBER table
        update_sql = "UPDATE MEMBER SET MEMBER_NAME = ?, FITNESS_GOAL = ?, PHONE = ? WHERE CARD_NO = ?"
        params = [new_name, new_goal, new_phone, card_no]
        execute_update(update_sql, params)
        rendered_update_sql = format_sql_with_params(update_sql, params)

        # 3. Insert each modified field into AUDIT_USER_UPDATES with exact timestamp
        timestamp_now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for field, old_val, new_val in changes:
            if db_type == "oracle":
                audit_sql = """
                INSERT INTO AUDIT_USER_UPDATES 
                (LOG_ID, CARD_NO, MEMBER_NAME, FIELD_CHANGED, OLD_VALUE, NEW_VALUE, SQL_STATEMENT, UPDATED_AT)
                VALUES (SEQ_AUDIT_LOG.NEXTVAL, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """
                execute_update(audit_sql, [card_no, new_name, field, str(old_val), str(new_val), rendered_update_sql])
            else:
                audit_sql = """
                INSERT INTO AUDIT_USER_UPDATES 
                (CARD_NO, MEMBER_NAME, FIELD_CHANGED, OLD_VALUE, NEW_VALUE, SQL_STATEMENT, UPDATED_AT)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
                """
                execute_update(audit_sql, [card_no, new_name, field, str(old_val), str(new_val), rendered_update_sql])

        return jsonify({
            "status": "success",
            "message": f"Profile updated for {new_name} ({card_no}). {len(changes)} field(s) logged to Admin Live Database.",
            "cardNo": card_no,
            "changes_count": len(changes),
            "changes": [{"field": f, "old": o, "new": n} for f, o, n in changes],
            "sql": rendered_update_sql,
            "timestamp": timestamp_now
        }), 200

    except Exception as err:
        msg = str(err)
        if "ORA-00001" in msg or "UNIQUE constraint failed" in msg:
            return jsonify({"error": "Phone number is already associated with another gym member."}), 409
        return jsonify({"error": msg}), 500

# ----------------- SQL Inspector Endpoints -----------------
@app.route("/api/sql/logs", methods=["GET"])
def get_sql_logs():
    return jsonify({
        "engine": f"Oracle Database XE (11g)" if db_type == "oracle" else "SQLite",
        "total_queries": LOG_COUNTER,
        "logs": SQL_LOGS
    })

@app.route("/api/sql/clear", methods=["POST"])
def clear_sql_logs():
    global SQL_LOGS
    SQL_LOGS = []
    return jsonify({"message": "SQL logs cleared."})

@app.route("/api/sql/execute", methods=["POST"])
def run_custom_sql():
    data = request.get_json(force=True) or {}
    raw_sql = (data.get("sql") or "").strip()
    if not raw_sql:
        return jsonify({"error": "SQL statement is required."}), 400
    
    t0 = time.time()
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(raw_sql)
        elapsed = (time.time() - t0) * 1000.0
        
        if cur.description:
            columns = [d[0] for d in cur.description]
            records = []
            for row in cur.fetchall():
                row_dict = {}
                for col, val in zip(columns, row):
                    row_dict[col] = serialize_val(val)
                records.append(row_dict)
            
            log_sql(raw_sql, [], elapsed, len(records), "SUCCESS")
            return jsonify({
                "status": "success",
                "type": "SELECT",
                "columns": columns,
                "rows": records,
                "row_count": len(records),
                "duration_ms": round(elapsed, 2),
                "sql": raw_sql
            })
        else:
            if hasattr(conn, "commit"):
                conn.commit()
            rows_aff = cur.rowcount
            log_sql(raw_sql, [], elapsed, rows_aff, "SUCCESS")
            return jsonify({
                "status": "success",
                "type": "DML/DDL",
                "rows_affected": rows_aff,
                "duration_ms": round(elapsed, 2),
                "sql": raw_sql,
                "message": f"Query executed successfully ({rows_aff} rows affected)."
            })
    except Exception as e:
        elapsed = (time.time() - t0) * 1000.0
        err_msg = str(e)
        log_sql(raw_sql, [], elapsed, 0, "ERROR", err_msg)
        return jsonify({"status": "error", "error": err_msg, "duration_ms": round(elapsed, 2)}), 400
    finally:
        conn.close()

@app.route("/api/sql/tables", methods=["GET"])
def get_sql_tables():
    try:
        m_count = execute_query("SELECT COUNT(*) AS CNT FROM MEMBER")[0]["CNT"]
        c_count = execute_query("SELECT COUNT(*) AS CNT FROM COACH")[0]["CNT"]
        a_count = execute_query("SELECT COUNT(*) AS CNT FROM COACH_ASSIGNMENT")[0]["CNT"]
        u_count = execute_query("SELECT COUNT(*) AS CNT FROM AUDIT_USER_UPDATES")[0]["CNT"]
        return jsonify({
            "engine": f"Oracle Database XE (11g)" if db_type == "oracle" else "SQLite",
            "tables": [
                {
                    "name": "MEMBER",
                    "rows": int(m_count),
                    "primary_key": "CARD_NO",
                    "description": "Gym members with unique card number, fitness goal and join date",
                    "columns": ["CARD_NO (PK)", "MEMBER_NAME", "FITNESS_GOAL", "PHONE (UK)", "JOIN_DATE"]
                },
                {
                    "name": "COACH",
                    "rows": int(c_count),
                    "primary_key": "COACH_ID",
                    "description": "Certified fitness trainers with specialization and experience",
                    "columns": ["COACH_ID (PK)", "COACH_NAME", "SPECIALIZATION", "EXPERIENCE_YEARS", "CONTACT_NO (UK)"]
                },
                {
                    "name": "COACH_ASSIGNMENT",
                    "rows": int(a_count),
                    "primary_key": "CARD_NO",
                    "description": "Current 1-to-1 matching relationship between Member and Coach",
                    "columns": ["CARD_NO (PK, FK -> MEMBER)", "COACH_ID (FK -> COACH)", "ASSIGNED_ON"]
                },
                {
                    "name": "AUDIT_USER_UPDATES",
                    "rows": int(u_count),
                    "primary_key": "LOG_ID",
                    "description": "Real-time user modifications audit log for Admin inspection",
                    "columns": ["LOG_ID (PK)", "CARD_NO", "MEMBER_NAME", "FIELD_CHANGED", "OLD_VALUE", "NEW_VALUE", "SQL_STATEMENT", "UPDATED_AT"]
                }
            ]
        })
    except Exception as err:
        return jsonify({"error": str(err)}), 500

# ----------------- API Endpoints -----------------
@app.route("/api/health", methods=["GET"])
def health():
    try:
        if db_type == "oracle":
            res = execute_query("SELECT 1 AS DB_OK FROM DUAL")
            ok = len(res) > 0 and res[0].get("DB_OK") == 1
        else:
            res = execute_query("SELECT 1 AS DB_OK")
            ok = len(res) > 0 and res[0].get("DB_OK") == 1
        return jsonify({
            "status": "ok",
            "database": "connected" if ok else "unknown",
            "engine": f"Oracle Database XE (11g)" if db_type == "oracle" else "SQLite (Local DB)"
        })
    except Exception as err:
        return jsonify({"status": "error", "message": str(err)}), 503

@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    try:
        if db_type == "oracle":
            sql = """
            SELECT (SELECT COUNT(*) FROM MEMBER) AS TOTAL_MEMBERS,
                   (SELECT COUNT(*) FROM COACH) AS TOTAL_COACHES,
                   (SELECT COUNT(*) FROM COACH_ASSIGNMENT) AS ASSIGNED_MEMBERS,
                   ((SELECT COUNT(*) FROM MEMBER) - (SELECT COUNT(*) FROM COACH_ASSIGNMENT)) AS UNASSIGNED_MEMBERS
            FROM DUAL
            """
        else:
            sql = """
            SELECT (SELECT COUNT(*) FROM MEMBER) AS TOTAL_MEMBERS,
                   (SELECT COUNT(*) FROM COACH) AS TOTAL_COACHES,
                   (SELECT COUNT(*) FROM COACH_ASSIGNMENT) AS ASSIGNED_MEMBERS,
                   ((SELECT COUNT(*) FROM MEMBER) - (SELECT COUNT(*) FROM COACH_ASSIGNMENT)) AS UNASSIGNED_MEMBERS
            """
        rows = execute_query(sql)
        row = rows[0] if rows else {}
        return jsonify({
            "TOTAL_MEMBERS": int(row.get("TOTAL_MEMBERS", 0)),
            "TOTAL_COACHES": int(row.get("TOTAL_COACHES", 0)),
            "ASSIGNED_MEMBERS": int(row.get("ASSIGNED_MEMBERS", 0)),
            "UNASSIGNED_MEMBERS": int(row.get("UNASSIGNED_MEMBERS", 0))
        })
    except Exception as err:
        return jsonify({"error": str(err)}), 500

# ----------------- Members Endpoints -----------------
MEMBER_SELECT = """
SELECT m.CARD_NO, m.MEMBER_NAME, m.FITNESS_GOAL, m.PHONE, m.JOIN_DATE,
       a.COACH_ID, c.COACH_NAME
FROM MEMBER m
LEFT JOIN COACH_ASSIGNMENT a ON a.CARD_NO = m.CARD_NO
LEFT JOIN COACH c ON c.COACH_ID = a.COACH_ID
"""

@app.route("/api/members", methods=["GET"])
def list_members():
    try:
        search = request.args.get("search", "").strip()
        goal = request.args.get("goal", "").strip()
        coach_id = request.args.get("coachId", "").strip()

        conditions = ["1=1"]
        params = []

        if search:
            like_val = f"%{search.upper()}%"
            if db_type == "oracle":
                conditions.append(
                    "(UPPER(m.CARD_NO) LIKE ? OR UPPER(m.MEMBER_NAME) LIKE ? OR UPPER(m.FITNESS_GOAL) LIKE ? OR UPPER(c.COACH_NAME) LIKE ? OR TO_CHAR(a.COACH_ID) LIKE ?)"
                )
            else:
                conditions.append(
                    "(UPPER(m.CARD_NO) LIKE ? OR UPPER(m.MEMBER_NAME) LIKE ? OR UPPER(m.FITNESS_GOAL) LIKE ? OR UPPER(c.COACH_NAME) LIKE ? OR CAST(a.COACH_ID AS TEXT) LIKE ?)"
                )
            params.extend([like_val, like_val, like_val, like_val, like_val])

        if goal:
            conditions.append("UPPER(m.FITNESS_GOAL) = UPPER(?)")
            params.append(goal)

        if coach_id:
            conditions.append("a.COACH_ID = ?")
            params.append(int(coach_id))

        sql = f"{MEMBER_SELECT} WHERE {' AND '.join(conditions)} ORDER BY m.CARD_NO"
        members = execute_query(sql, params)
        return jsonify(members)
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route("/api/members/<card_no>", methods=["GET"])
def get_member(card_no):
    try:
        sql = f"{MEMBER_SELECT} WHERE m.CARD_NO = ?"
        members = execute_query(sql, [card_no])
        if not members:
            return jsonify({"error": "Member not found."}), 404
        return jsonify(members[0])
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route("/api/members", methods=["POST"])
def create_member():
    try:
        data = request.get_json(force=True) or {}
        card_no = (data.get("cardNo") or "").strip()
        member_name = (data.get("memberName") or "").strip()
        fitness_goal = (data.get("fitnessGoal") or "").strip()
        phone = (data.get("phone") or "").strip() or None

        if not card_no or not member_name or not fitness_goal:
            return jsonify({"error": "Card number, member name and fitness goal are required."}), 400
        if len(card_no) > 20 or len(member_name) > 100 or len(fitness_goal) > 40:
            return jsonify({"error": "One or more fields exceed the allowed length."}), 400

        allowed_goals = ['Weight Loss', 'Muscle Gain', 'Strength Training', 'General Fitness', 'Endurance', 'Fat Loss', 'Flexibility', 'Cardio Fitness']
        if fitness_goal not in allowed_goals:
            return jsonify({"error": f"Invalid fitness goal. Must be one of: {', '.join(allowed_goals)}"}), 400

        if db_type == "oracle":
            sql = "INSERT INTO MEMBER (CARD_NO, MEMBER_NAME, FITNESS_GOAL, PHONE, JOIN_DATE) VALUES (?, ?, ?, ?, SYSDATE)"
            params = [card_no, member_name, fitness_goal, phone]
        else:
            sql = "INSERT INTO MEMBER (CARD_NO, MEMBER_NAME, FITNESS_GOAL, PHONE, JOIN_DATE) VALUES (?, ?, ?, ?, DATE('now'))"
            params = [card_no, member_name, fitness_goal, phone]

        execute_update(sql, params)
        rendered = format_sql_with_params(sql, params)
        return jsonify({"message": "Member created.", "cardNo": card_no, "sql": rendered}), 201
    except Exception as err:
        msg = str(err)
        if "ORA-00001" in msg or "UNIQUE constraint failed" in msg:
            return jsonify({"error": "A member with that Card Number or Phone already exists."}), 409
        return jsonify({"error": msg}), 500

@app.route("/api/members/<card_no>", methods=["PUT"])
def update_member(card_no):
    try:
        data = request.get_json(force=True) or {}
        member_name = (data.get("memberName") or "").strip()
        fitness_goal = (data.get("fitnessGoal") or "").strip()
        phone = (data.get("phone") or "").strip() or None

        if not member_name or not fitness_goal:
            return jsonify({"error": "Member name and fitness goal are required."}), 400

        sql = "UPDATE MEMBER SET MEMBER_NAME = ?, FITNESS_GOAL = ?, PHONE = ? WHERE CARD_NO = ?"
        params = [member_name, fitness_goal, phone, card_no]
        count = execute_update(sql, params)
        if count == 0:
            return jsonify({"error": "Member not found."}), 404
        return jsonify({"message": "Member updated.", "sql": format_sql_with_params(sql, params)})
    except Exception as err:
        msg = str(err)
        if "ORA-00001" in msg or "UNIQUE constraint failed" in msg:
            return jsonify({"error": "A member with that phone number already exists."}), 409
        return jsonify({"error": msg}), 500

@app.route("/api/members/<card_no>", methods=["DELETE"])
def delete_member(card_no):
    try:
        sql = "DELETE FROM MEMBER WHERE CARD_NO = ?"
        count = execute_update(sql, [card_no])
        if count == 0:
            return jsonify({"error": "Member not found."}), 404
        return jsonify({"message": "Member deleted.", "sql": format_sql_with_params(sql, [card_no])})
    except Exception as err:
        return jsonify({"error": str(err)}), 500

# ----------------- Coaches Endpoints -----------------
@app.route("/api/coaches", methods=["GET"])
def list_coaches():
    try:
        search = request.args.get("search", "").strip()
        conditions = ["1=1"]
        params = []

        if search:
            like_val = f"%{search.upper()}%"
            if db_type == "oracle":
                conditions.append("(UPPER(c.COACH_NAME) LIKE ? OR UPPER(c.SPECIALIZATION) LIKE ? OR TO_CHAR(c.COACH_ID) LIKE ?)")
            else:
                conditions.append("(UPPER(c.COACH_NAME) LIKE ? OR UPPER(c.SPECIALIZATION) LIKE ? OR CAST(c.COACH_ID AS TEXT) LIKE ?)")
            params.extend([like_val, like_val, like_val])

        sql = f"""
        SELECT c.COACH_ID, c.COACH_NAME, c.SPECIALIZATION, c.EXPERIENCE_YEARS, c.CONTACT_NO,
               COUNT(a.CARD_NO) AS MEMBER_COUNT
        FROM COACH c
        LEFT JOIN COACH_ASSIGNMENT a ON a.COACH_ID = c.COACH_ID
        WHERE {' AND '.join(conditions)}
        GROUP BY c.COACH_ID, c.COACH_NAME, c.SPECIALIZATION, c.EXPERIENCE_YEARS, c.CONTACT_NO
        ORDER BY c.COACH_ID
        """
        coaches = execute_query(sql, params)
        for c in coaches:
            c["MEMBER_COUNT"] = int(c.get("MEMBER_COUNT") or 0)
        return jsonify(coaches)
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route("/api/coaches/<int:coach_id>", methods=["GET"])
def get_coach(coach_id):
    try:
        sql = """
        SELECT c.COACH_ID, c.COACH_NAME, c.SPECIALIZATION, c.EXPERIENCE_YEARS, c.CONTACT_NO,
               COUNT(a.CARD_NO) AS MEMBER_COUNT
        FROM COACH c
        LEFT JOIN COACH_ASSIGNMENT a ON a.COACH_ID = c.COACH_ID
        WHERE c.COACH_ID = ?
        GROUP BY c.COACH_ID, c.COACH_NAME, c.SPECIALIZATION, c.EXPERIENCE_YEARS, c.CONTACT_NO
        """
        coaches = execute_query(sql, [coach_id])
        if not coaches:
            return jsonify({"error": "Coach not found."}), 404
        coaches[0]["MEMBER_COUNT"] = int(coaches[0].get("MEMBER_COUNT") or 0)
        return jsonify(coaches[0])
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route("/api/coaches/<int:coach_id>/members", methods=["GET"])
def coach_members(coach_id):
    try:
        sql = """
        SELECT m.CARD_NO, m.MEMBER_NAME, m.FITNESS_GOAL, m.PHONE
        FROM MEMBER m
        JOIN COACH_ASSIGNMENT a ON a.CARD_NO = m.CARD_NO
        WHERE a.COACH_ID = ?
        ORDER BY m.MEMBER_NAME
        """
        members = execute_query(sql, [coach_id])
        return jsonify(members)
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route("/api/coaches", methods=["POST"])
def create_coach():
    try:
        data = request.get_json(force=True) or {}
        try:
            coach_id = int(data.get("coachId"))
        except (TypeError, ValueError):
            return jsonify({"error": "A positive integer coach ID is required."}), 400

        coach_name = (data.get("coachName") or "").strip()
        specialization = (data.get("specialization") or "General Fitness").strip()
        experience_years = int(data.get("experienceYears") or 0)
        contact_no = (data.get("contactNo") or "").strip() or None

        if coach_id <= 0 or not coach_name:
            return jsonify({"error": "A positive coach ID and coach name are required."}), 400
        if experience_years < 0 or experience_years > 60:
            return jsonify({"error": "Experience must be between 0 and 60 years."}), 400

        sql = """
        INSERT INTO COACH (COACH_ID, COACH_NAME, SPECIALIZATION, EXPERIENCE_YEARS, CONTACT_NO)
        VALUES (?, ?, ?, ?, ?)
        """
        params = [coach_id, coach_name, specialization, experience_years, contact_no]
        execute_update(sql, params)
        return jsonify({"message": "Coach created.", "coachId": coach_id, "sql": format_sql_with_params(sql, params)}), 201
    except Exception as err:
        msg = str(err)
        if "ORA-00001" in msg or "UNIQUE constraint failed" in msg:
            return jsonify({"error": "A coach with that ID or contact number already exists."}), 409
        return jsonify({"error": msg}), 500

@app.route("/api/coaches/<int:coach_id>", methods=["PUT"])
def update_coach(coach_id):
    try:
        data = request.get_json(force=True) or {}
        coach_name = (data.get("coachName") or "").strip()
        specialization = (data.get("specialization") or "General Fitness").strip()
        experience_years = int(data.get("experienceYears") or 0)
        contact_no = (data.get("contactNo") or "").strip() or None

        if not coach_name:
            return jsonify({"error": "Coach name is required."}), 400
        if experience_years < 0 or experience_years > 60:
            return jsonify({"error": "Experience must be between 0 and 60 years."}), 400

        sql = """
        UPDATE COACH SET COACH_NAME = ?, SPECIALIZATION = ?, EXPERIENCE_YEARS = ?, CONTACT_NO = ?
        WHERE COACH_ID = ?
        """
        params = [coach_name, specialization, experience_years, contact_no, coach_id]
        count = execute_update(sql, params)
        if count == 0:
            return jsonify({"error": "Coach not found."}), 404
        return jsonify({"message": "Coach updated.", "sql": format_sql_with_params(sql, params)})
    except Exception as err:
        msg = str(err)
        if "ORA-00001" in msg or "UNIQUE constraint failed" in msg:
            return jsonify({"error": "A coach with that contact number already exists."}), 409
        return jsonify({"error": msg}), 500

@app.route("/api/coaches/<int:coach_id>", methods=["DELETE"])
def delete_coach(coach_id):
    try:
        # Check active assignments
        check = execute_query("SELECT COUNT(*) AS CNT FROM COACH_ASSIGNMENT WHERE COACH_ID = ?", [coach_id])
        cnt = int(check[0].get("CNT", 0)) if check else 0
        if cnt > 0:
            return jsonify({"error": "This coach still has member assignments. Reassign or remove those assignments first."}), 409

        sql = "DELETE FROM COACH WHERE COACH_ID = ?"
        count = execute_update(sql, [coach_id])
        if count == 0:
            return jsonify({"error": "Coach not found."}), 404
        return jsonify({"message": "Coach deleted.", "sql": format_sql_with_params(sql, [coach_id])})
    except Exception as err:
        msg = str(err)
        if "ORA-02292" in msg or "FOREIGN KEY constraint failed" in msg:
            return jsonify({"error": "This coach still has member assignments. Reassign or remove those assignments first."}), 409
        return jsonify({"error": msg}), 500

# ----------------- Assignments Endpoints -----------------
@app.route("/api/assignments", methods=["GET"])
def list_assignments():
    try:
        sql = """
        SELECT a.CARD_NO, m.MEMBER_NAME, m.FITNESS_GOAL, a.COACH_ID, c.COACH_NAME, a.ASSIGNED_ON
        FROM COACH_ASSIGNMENT a
        JOIN MEMBER m ON m.CARD_NO = a.CARD_NO
        JOIN COACH c ON c.COACH_ID = a.COACH_ID
        ORDER BY c.COACH_ID, m.CARD_NO
        """
        rows = execute_query(sql)
        return jsonify(rows)
    except Exception as err:
        return jsonify({"error": str(err)}), 500

@app.route("/api/assignments", methods=["POST"])
def create_assignment():
    try:
        data = request.get_json(force=True) or {}
        card_no = (data.get("cardNo") or "").strip()
        try:
            coach_id = int(data.get("coachId"))
        except (TypeError, ValueError):
            return jsonify({"error": "Valid card number and coach ID are required."}), 400

        if not card_no or coach_id <= 0:
            return jsonify({"error": "Valid card number and coach ID are required."}), 400

        if db_type == "oracle":
            sql = "INSERT INTO COACH_ASSIGNMENT (CARD_NO, COACH_ID, ASSIGNED_ON) VALUES (?, ?, SYSDATE)"
        else:
            sql = "INSERT INTO COACH_ASSIGNMENT (CARD_NO, COACH_ID, ASSIGNED_ON) VALUES (?, ?, DATE('now'))"

        params = [card_no, coach_id]
        execute_update(sql, params)
        return jsonify({"message": "Coach assigned to member.", "sql": format_sql_with_params(sql, params)}), 201
    except Exception as err:
        msg = str(err)
        if "ORA-00001" in msg or "UNIQUE constraint failed" in msg:
            return jsonify({"error": "This member already has a coach assigned. Use PUT to reassign."}), 409
        if "ORA-02291" in msg or "FOREIGN KEY constraint failed" in msg:
            return jsonify({"error": "Invalid member or coach ID. Check that both records exist."}), 400
        return jsonify({"error": msg}), 500

@app.route("/api/assignments/<card_no>", methods=["PUT"])
def reassign_assignment(card_no):
    try:
        data = request.get_json(force=True) or {}
        try:
            coach_id = int(data.get("coachId"))
        except (TypeError, ValueError):
            return jsonify({"error": "A valid coach ID is required."}), 400

        if coach_id <= 0:
            return jsonify({"error": "A valid coach ID is required."}), 400

        if db_type == "oracle":
            sql = "UPDATE COACH_ASSIGNMENT SET COACH_ID = ?, ASSIGNED_ON = SYSDATE WHERE CARD_NO = ?"
        else:
            sql = "UPDATE COACH_ASSIGNMENT SET COACH_ID = ?, ASSIGNED_ON = DATE('now') WHERE CARD_NO = ?"

        params = [coach_id, card_no]
        count = execute_update(sql, params)
        if count == 0:
            return jsonify({"error": "No assignment exists for this member. Use POST to create one."}), 404
        return jsonify({"message": "Member reassigned successfully.", "sql": format_sql_with_params(sql, params)})
    except Exception as err:
        msg = str(err)
        if "ORA-02291" in msg or "FOREIGN KEY constraint failed" in msg:
            return jsonify({"error": "Invalid coach ID. Coach does not exist."}), 400
        return jsonify({"error": msg}), 500

@app.route("/api/assignments/<card_no>", methods=["DELETE"])
def remove_assignment(card_no):
    try:
        sql = "DELETE FROM COACH_ASSIGNMENT WHERE CARD_NO = ?"
        count = execute_update(sql, [card_no])
        if count == 0:
            return jsonify({"error": "Assignment not found."}), 404
        return jsonify({"message": "Assignment removed. Member remains registered.", "sql": format_sql_with_params(sql, [card_no])})
    except Exception as err:
        return jsonify({"error": str(err)}), 500

if __name__ == "__main__":
    print(f"================================================================")
    print(f" Gym Coach Matching System - Full-Stack Application")
    print(f" Database: {db_type.upper()} ({'Oracle XE 11g on localhost:1521/XE' if db_type == 'oracle' else 'SQLite'})")
    print(f" Frontend: Serving static files from {FRONTEND_DIR}")
    print(f" API Server running at: http://localhost:{PORT}")
    print(f"================================================================")
    app.run(host="0.0.0.0", port=PORT, debug=False)
