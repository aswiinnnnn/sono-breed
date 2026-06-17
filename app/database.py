import sqlite3
import json
import math
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "sonogram.db"

# Global in-memory cache for finished scans stats
STATS_CACHE = {
    "total_scans": 0,
    "pregnant_count": 0,
    "non_pregnant_count": 0,
    "pregnancy_rate": 0.0,
    "avg_scan_time": 0.0
}

def get_connection():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sheep_id TEXT NOT NULL,
            detected_stage TEXT NOT NULL DEFAULT 'Non-Pregnant',
            final_diagnosis TEXT NOT NULL DEFAULT 'Non-Pregnant',
            features_detected TEXT,
            status TEXT DEFAULT 'scanning',
            duration REAL DEFAULT 0.0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_scans_sheep_id ON scans(sheep_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_scans_status_created_at ON scans(status, created_at DESC)")
    conn.commit()
    conn.close()
    rebuild_stats_cache()

def rebuild_stats_cache():
    global STATS_CACHE
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT final_diagnosis, duration FROM scans WHERE status = 'finished'")
    rows = cursor.fetchall()
    conn.close()
    
    total = len(rows)
    pregnant = sum(1 for r in rows if (r[0] or "").startswith("Pregnant"))
    non_pregnant = sum(1 for r in rows if r[0] == "Non-Pregnant")
    total_dur = sum(r[1] or 0.0 for r in rows)
    
    STATS_CACHE.clear()
    STATS_CACHE.update({
        "total_scans": total,
        "pregnant_count": pregnant,
        "non_pregnant_count": non_pregnant,
        "pregnancy_rate": round((pregnant / total * 100.0), 1) if total > 0 else 0.0,
        "avg_scan_time": round((total_dur / total), 1) if total > 0 else 0.0
    })

def create_scan(sheep_id: str) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO scans (sheep_id, status) VALUES (?, 'scanning')", (sheep_id,))
    scan_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return scan_id

def finish_scan(scan_id: int, detected_stage: str, final_diagnosis: str, features_detected: list, duration: float) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT status FROM scans WHERE id = ?", (scan_id,))
    row = cursor.fetchone()
    if not row or row[0] == "finished":
        conn.close()
        return True # Idempotency check
        
    cursor.execute(
        "UPDATE scans SET detected_stage=?, final_diagnosis=?, features_detected=?, duration=?, status='finished' WHERE id=?",
        (detected_stage, final_diagnosis, json.dumps(features_detected), duration, scan_id)
    )
    conn.commit()
    conn.close()
    
    # Increment cache
    global STATS_CACHE
    total = STATS_CACHE["total_scans"]
    avg = STATS_CACHE["avg_scan_time"]
    
    new_total = total + 1
    new_avg = ((avg * total) + duration) / new_total
    
    STATS_CACHE["total_scans"] = new_total
    STATS_CACHE["avg_scan_time"] = round(new_avg, 1)
    if final_diagnosis.startswith("Pregnant"):
        STATS_CACHE["pregnant_count"] += 1
    elif final_diagnosis == "Non-Pregnant":
        STATS_CACHE["non_pregnant_count"] += 1
        
    preg = STATS_CACHE["pregnant_count"]
    STATS_CACHE["pregnancy_rate"] = round((preg / new_total * 100.0), 1)
    return True

def get_scan(scan_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM scans WHERE id = ?", (scan_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_paginated_scans(page: int = 1, limit: int = 20, start_date: str = None, end_date: str = None):
    offset = (page - 1) * limit
    conn = get_connection()
    cursor = conn.cursor()
    
    query_count = "SELECT COUNT(*) FROM scans"
    query_select = "SELECT * FROM scans"
    params = []
    where_clauses = []
    
    # Convert DB UTC timestamps to system's local time for accurate comparisons
    if start_date:
        where_clauses.append("datetime(created_at, 'localtime') >= ?")
        params.append(f"{start_date} 00:00:00")
    if end_date:
        where_clauses.append("datetime(created_at, 'localtime') <= ?")
        params.append(f"{end_date} 23:59:59")
        
    if where_clauses:
        clause = " WHERE " + " AND ".join(where_clauses)
        query_count += clause
        query_select += clause

    cursor.execute(query_count, params)
    total_count = cursor.fetchone()[0]
    
    query_select += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    select_params = params + [limit, offset]
    cursor.execute(query_select, select_params)
    rows = cursor.fetchall()
    conn.close()
    
    records = []
    for r in rows:
        d = dict(r)
        d["features_detected"] = json.loads(d["features_detected"]) if d.get("features_detected") else []
        records.append(d)
        
    total_pages = math.ceil(total_count / limit) if limit > 0 else 0
    return records, total_count, total_pages

def delete_scan(scan_id: int) -> bool:
    scan = get_scan(scan_id)
    if not scan:
        return False
        
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM scans WHERE id = ?", (scan_id,))
    conn.commit()
    conn.close()
    
    # Decrement cache if finished
    if scan["status"] == "finished":
        global STATS_CACHE
        total = STATS_CACHE["total_scans"]
        if total <= 1:
            rebuild_stats_cache()
        else:
            avg = STATS_CACHE["avg_scan_time"]
            new_total = total - 1
            new_avg = ((avg * total) - (scan["duration"] or 0.0)) / new_total
            
            STATS_CACHE["total_scans"] = new_total
            STATS_CACHE["avg_scan_time"] = round(new_avg, 1)
            
            diag = scan["final_diagnosis"] or ""
            if diag.startswith("Pregnant"):
                STATS_CACHE["pregnant_count"] = max(0, STATS_CACHE["pregnant_count"] - 1)
            elif diag == "Non-Pregnant":
                STATS_CACHE["non_pregnant_count"] = max(0, STATS_CACHE["non_pregnant_count"] - 1)
                
            preg = STATS_CACHE["pregnant_count"]
            STATS_CACHE["pregnancy_rate"] = round((preg / new_total * 100.0), 1)
    return True
