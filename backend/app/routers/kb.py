"""AI 知识库管理路由（仅管理员）

- GET  /api/admin/kb/status   知识库状态：切片数/文件数/构建锁/定时计划
- GET  /api/admin/kb/history  历史更新记录（kb_build_runs 表）
- POST /api/admin/kb/rebuild  手动触发增量更新（后台子进程，非阻塞）
- GET  /api/admin/kb/running  查询当前是否有构建在跑（前端轮询用）
"""

import sqlite3
import subprocess
import sys
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies.auth import require_admin

router = APIRouter(prefix="/api/admin/kb", tags=["AI知识库管理"])

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BACKEND_DIR / "hjzk.db"
SCRIPT = BACKEND_DIR / "scripts" / "build_kb_index.py"

LOCK_EXPIRY_SECONDS = 7200  # 与 build_kb_index.py 一致：2 小时过期自愈

# 定时计划（服务器 crontab: 55 23 * * 6），展示用静态信息
SCHEDULE_INFO = {
    "description": "每周六 23:55 自动增量更新",
    "cron": "55 23 * * 6",
    "command": "venv/bin/python scripts/build_kb_index.py --workers 2",
    "log_file": "/tmp/kbweekly.log",
}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=15)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_runs_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS kb_build_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            mode TEXT DEFAULT '增量',
            trigger_type TEXT DEFAULT 'cron',
            status TEXT DEFAULT 'running',
            chunks_changed INTEGER,
            total_chunks INTEGER,
            message TEXT
        )"""
    )
    conn.commit()


@router.get("/status")
async def kb_status(_: object = Depends(require_admin)):
    """知识库状态概览"""
    conn = _connect()
    try:
        _ensure_runs_table(conn)
        chunks = conn.execute("SELECT COUNT(*) FROM kb_chunks").fetchone()[0]
        try:
            fts = conn.execute("SELECT COUNT(*) FROM kb_fts").fetchone()[0]
        except sqlite3.OperationalError:
            fts = 0
        try:
            pdfs = conn.execute("SELECT COUNT(*) FROM kb_pdf_files").fetchone()[0]
        except sqlite3.OperationalError:
            pdfs = 0

        # 构建锁状态（含 2 小时过期自愈，与脚本逻辑一致）
        lock_held = False
        lock_since: str | None = None
        try:
            row = conn.execute("SELECT held_since FROM kb_build_lock WHERE id=1").fetchone()
            if row and row[0]:
                try:
                    ts = time.mktime(time.strptime(row[0], "%Y-%m-%d %H:%M:%S"))
                except ValueError:
                    ts = 0
                if ts and time.time() - ts < LOCK_EXPIRY_SECONDS:
                    lock_held = True
                    lock_since = row[0]
        except sqlite3.OperationalError:
            pass

        # 最近一次完成 / 进行中的记录
        last_run = conn.execute(
            "SELECT * FROM kb_build_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()

        return {
            "chunks": chunks,
            "fts": fts,
            "pdf_files": pdfs,
            "lock_held": lock_held,
            "lock_since": lock_since,
            "schedule": SCHEDULE_INFO,
            "last_run": dict(last_run) if last_run else None,
        }
    finally:
        conn.close()


@router.get("/history")
async def kb_history(_: object = Depends(require_admin)):
    """历史更新记录（最近 50 条）"""
    conn = _connect()
    try:
        _ensure_runs_table(conn)
        rows = conn.execute(
            """SELECT id, started_at, finished_at, mode, trigger_type,
                      status, chunks_changed, total_chunks, message
               FROM kb_build_runs ORDER BY id DESC LIMIT 50"""
        ).fetchall()
        return {"data": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.post("/rebuild")
async def kb_rebuild(_: object = Depends(require_admin)):
    """手动触发增量更新（后台子进程，立即返回）

    并发保护：脚本自身有 kb_build_lock（2 小时过期自愈），
    这里前置检查锁 + 正在 running 的记录，双重防重复触发。
    """
    conn = _connect()
    try:
        _ensure_runs_table(conn)
        # 前置检查 1：构建锁
        try:
            row = conn.execute("SELECT held_since FROM kb_build_lock WHERE id=1").fetchone()
            if row and row[0]:
                try:
                    ts = time.mktime(time.strptime(row[0], "%Y-%m-%d %H:%M:%S"))
                except ValueError:
                    ts = 0
                if ts and time.time() - ts < LOCK_EXPIRY_SECONDS:
                    raise HTTPException(409, f"另一构建进行中（{row[0]} 起锁），请稍后再试")
        except sqlite3.OperationalError:
            pass
        # 前置检查 2：running 状态的历史记录
        running = conn.execute(
            "SELECT id, started_at FROM kb_build_runs WHERE status='running' LIMIT 1"
        ).fetchone()
        if running:
            raise HTTPException(409, f"已有更新任务在运行（{running[1]} 启动），请等待完成")
    finally:
        conn.close()

    py = str(BACKEND_DIR / "venv" / "bin" / "python")
    if not Path(py).exists():
        py = sys.executable  # 本地开发环境兜底
    proc = subprocess.Popen(
        [py, str(SCRIPT), "--workers", "2", "--trigger", "manual"],
        cwd=str(BACKEND_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return {"message": "已触发知识库更新", "pid": proc.pid}


@router.get("/running")
async def kb_running(_: object = Depends(require_admin)):
    """查询是否有构建进行中（前端触发后轮询用）"""
    conn = _connect()
    try:
        _ensure_runs_table(conn)
        row = conn.execute(
            "SELECT id, started_at, mode FROM kb_build_runs WHERE status='running' ORDER BY id DESC LIMIT 1"
        ).fetchone()
        lock_held = False
        try:
            lr = conn.execute("SELECT held_since FROM kb_build_lock WHERE id=1").fetchone()
            if lr and lr[0]:
                try:
                    ts = time.mktime(time.strptime(lr[0], "%Y-%m-%d %H:%M:%S"))
                except ValueError:
                    ts = 0
                if ts and time.time() - ts < LOCK_EXPIRY_SECONDS:
                    lock_held = True
        except sqlite3.OperationalError:
            pass
        return {"running": bool(row or lock_held), "started_at": row[1] if row else None}
    finally:
        conn.close()
