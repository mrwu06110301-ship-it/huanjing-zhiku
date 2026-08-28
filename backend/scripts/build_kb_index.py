"""知识库索引构建脚本 — AI 助手 RAG 索引管道（FTS5 关键词索引 + 增量自学习）

用法（服务器）:
  cd /home/admin/huanjing-zhiku/backend
  venv/bin/python scripts/build_kb_index.py --dry-run   # 只统计切片数
  venv/bin/python scripts/build_kb_index.py             # 增量更新（默认）
  venv/bin/python scripts/build_kb_index.py --full      # 全量重建（清空重跑，~50 分钟）

切片方案:
  1. 文章(含论坛): 正文按段落切片（~500字/块，50字重叠）
  2. 标准: 元数据块（标准号+名称+分类）+ PDF 全文按页切片（~600字/块）
  3. 视频/工具: 标题+描述整条一块
  4. 索引: SQLite FTS5 虚拟表（unicode61 分词），BM25 排序，零 API 成本

增量自学习机制（供 cron 每周定时执行）:
  - 文本源(文章/视频/工具/标准元数据): 采集廉价，逐条比对 content_hash，未变跳过写入
  - 标准 PDF: kb_pdf_files 表记录文件指纹(mtime+size)，指纹未变跳过解析（省 50 分钟的大头）
  - 变更源: 先整体删除该源全部旧切片（kb_chunks+kb_fts）再插入，避免源缩短后残留
  - 孤儿清理: 源表已删除/取消公开的条目，切片同步清除
  - 安全锁: kb_build_lock 防并发构建（2 小时过期自愈）
"""

import argparse
import hashlib
import re
import sqlite3
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from pypdf import PdfReader

BACKEND_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BACKEND_DIR / "hjzk.db"
UPLOADS_DIR = BACKEND_DIR / "uploads"

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
MAX_PDF_PAGES = 120


# ---------------- 基础函数 ----------------
def split_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    text = re.sub(r"[ \t]+", " ", text).strip()
    if len(text) <= size:
        return [text] if text else []
    paras = [p.strip() for p in re.split(r"\n+", text) if p.strip()]
    chunks, buf = [], ""
    for p in paras:
        if len(buf) + len(p) + 1 <= size:
            buf = f"{buf}\n{p}".strip()
            continue
        if buf:
            chunks.append(buf)
        while len(p) > size:
            chunks.append(p[:size])
            p = p[size - overlap:]
        buf = p
    if buf:
        chunks.append(buf)
    return chunks


def norm_std_title(title: str) -> str:
    return re.sub(r"\s+", " ", title).strip()


def sanitize(text: str) -> str:
    """清理代理对等非法字符（部分 PDF 提取文本含 \ud835 类代理项）"""
    return text.encode("utf-8", errors="ignore").decode("utf-8", errors="ignore")


def md5s(s: str) -> str:
    return hashlib.md5(sanitize(s).encode("utf-8", errors="ignore")).hexdigest()


def parse_one_pdf(args: tuple) -> tuple[int, str, list[dict]]:
    """子进程：解析单个 PDF（独立进程，Windows/Linux 均安全）"""
    sid, t, file_url = args
    pdf_path = UPLOADS_DIR / Path(file_url).name
    out: list[dict] = []
    if not pdf_path.exists():
        return sid, t, out
    try:
        reader = PdfReader(str(pdf_path))
        npages = min(len(reader.pages), MAX_PDF_PAGES)
        for pi in range(npages):
            try:
                ptext = (reader.pages[pi].extract_text() or "").strip()
            except Exception:
                continue
            ptext = sanitize(ptext)
            if len(ptext) < 30:
                continue
            for ci, c in enumerate(split_text(ptext, size=600, overlap=60)):
                out.append(
                    {"source_type": "standard_pdf", "source_id": sid,
                     # 页号×1000 + 页内序号：每页可容 1000 片（60万字），杜绝跨页 idx 碰撞
                     "chunk_idx": 10000 + pi * 1000 + ci,
                     "title": f"{t}（第{pi + 1}页）", "content": c,
                     "url": "/standards"}
                )
    except Exception as e:
        print(f"  ! pdf fail id={sid}: {e}", flush=True)
    return sid, t, out


# ---------------- 数据源收集 ----------------
def collect_chunks(db: sqlite3.Connection, with_pdf: bool = True, workers: int = 2) -> tuple[list[dict], set]:
    """返回 (chunks, live_keys)。live_keys 为当前公开有效源的 (source_type, source_id) 集合。"""
    cur = db.cursor()
    chunks: list[dict] = []
    live_keys: set = set()

    # 文章（含论坛文章）
    for aid, title, content in cur.execute(
        "SELECT id, title, content FROM articles WHERE is_public = 1"
    ):
        live_keys.add(("article", aid))
        for idx, c in enumerate(split_text(content)):
            chunks.append({"source_type": "article", "source_id": aid, "chunk_idx": idx,
                           "title": title, "content": c, "url": f"/article/{aid}"})

    # PDF 指纹表（增量核心：指纹未变的 PDF 不再解析）
    if with_pdf:
        cur.execute(
            """CREATE TABLE IF NOT EXISTS kb_pdf_files (
                source_id INTEGER PRIMARY KEY, file_url TEXT, fingerprint TEXT,
                updated_at TEXT DEFAULT (datetime('now','localtime'))
            )"""
        )
        db.commit()

    # 标准（元数据 + PDF）——必须 fetchall 物化后再遍历：内层指纹查询若复用同一 cursor 会截断外层遍历
    pdf_jobs: list[tuple[int, str, str, str]] = []  # (sid, title, file_url, fingerprint)
    std_rows = cur.execute(
        """SELECT s.id, s.title, COALESCE(s.description,''),
                  COALESCE(c.name,''), COALESCE(s.file_url,'')
           FROM standards s LEFT JOIN categories c ON c.id = s.category_id
           WHERE s.is_public = 1"""
    ).fetchall()
    for sid, title, desc, cat, file_url in std_rows:
        live_keys.add(("standard_meta", sid))
        live_keys.add(("standard_pdf", sid))
        t = norm_std_title(title)
        chunks.append({
            "source_type": "standard_meta", "source_id": sid, "chunk_idx": 0,
            "title": t, "content": f"标准号/名称：{t}\n分类：{cat}\n文件：{desc}",
            "url": "/standards",
        })
        if with_pdf and file_url and file_url.startswith("/uploads/"):
            pdf_path = UPLOADS_DIR / Path(file_url).name
            if not pdf_path.exists():
                continue
            st = pdf_path.stat()
            fp = f"{int(st.st_mtime)}:{st.st_size}"
            row = db.execute(
                "SELECT fingerprint FROM kb_pdf_files WHERE source_id=?", (sid,)
            ).fetchone()
            if row and row[0] == fp:
                # 自愈：指纹未变但切片数不完整（历史崩溃残留）时也要重新解析。
                # 期望切片数未知，用启发式：standard_pdf 切片 ≥ 页数下限不可靠，
                # 改为验证该源在 kb_fts 与 kb_chunks 行数一致且 > 0
                ok = db.execute(
                    """SELECT
                         (SELECT COUNT(*) FROM kb_chunks WHERE source_type='standard_pdf' AND source_id=?)
                         = (SELECT COUNT(*) FROM kb_fts WHERE rowid_map LIKE 'standard_pdf:' || ? || ':%')
                       AND EXISTS (SELECT 1 FROM kb_chunks WHERE source_type='standard_pdf' AND source_id=?)""",
                    (sid, sid, sid),
                ).fetchone()[0]
                if ok:
                    continue  # 文件未变且索引完整，跳过解析
            pdf_jobs.append((sid, t, file_url, fp))

    if pdf_jobs:
        print(f"需解析 {len(pdf_jobs)} 个新增/变更 PDF（workers={workers}）...", flush=True)
        done = 0
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futs = {pool.submit(parse_one_pdf, (j[0], j[1], j[2])): j for j in pdf_jobs}
            for fut in as_completed(futs):
                sid, _, sub = fut.result()
                chunks.extend(sub)
                j = futs[fut]
                db.execute(
                    """INSERT INTO kb_pdf_files (source_id, file_url, fingerprint)
                       VALUES (?,?,?)
                       ON CONFLICT(source_id) DO UPDATE SET
                         file_url=excluded.file_url, fingerprint=excluded.fingerprint,
                         updated_at=datetime('now','localtime')""",
                    (sid, j[2], j[3]),
                )
                done += 1
                if done % 50 == 0:
                    print(f"  pdf done: {done}/{len(pdf_jobs)}", flush=True)
        db.commit()
    elif with_pdf:
        print("PDF 全部未变，跳过解析", flush=True)

    # 视频
    for vid, title, desc in cur.execute(
        "SELECT id, title, COALESCE(description,'') FROM videos WHERE is_public = 1"
    ):
        live_keys.add(("video", vid))
        if title or desc:
            chunks.append({"source_type": "video", "source_id": vid, "chunk_idx": 0,
                           "title": title, "content": f"视频：{title}\n{desc}"[:800],
                           "url": f"/videos/{vid}"})

    # 工具
    for tid, name, desc, slug in cur.execute("SELECT id, name, COALESCE(description,''), slug FROM tools"):
        live_keys.add(("tool", tid))
        chunks.append({"source_type": "tool", "source_id": tid, "chunk_idx": 0,
                       "title": name, "content": f"计算工具：{name}\n{desc}"[:800],
                       "url": f"/tools/{slug}"})

    return chunks, live_keys


# ---------------- FTS5 索引 ----------------
def _ensure_tables(cur: sqlite3.Cursor, rebuild: bool) -> None:
    if rebuild:
        cur.execute("DROP TABLE IF EXISTS kb_fts")
        cur.execute("DROP TABLE IF EXISTS kb_chunks")
    cur.execute(
        """CREATE TABLE IF NOT EXISTS kb_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_type TEXT NOT NULL, source_id INTEGER NOT NULL, chunk_idx INTEGER NOT NULL,
            title TEXT, content TEXT, url TEXT,
            content_hash TEXT, updated_at TEXT DEFAULT (datetime('now','localtime')),
            UNIQUE(source_type, source_id, chunk_idx)
        )"""
    )
    try:
        cur.execute("SELECT * FROM kb_fts LIMIT 1")
    except sqlite3.OperationalError:
        cur.execute(
            """CREATE VIRTUAL TABLE kb_fts USING fts5(
                title, content, rowid_map UNINDEXED,
                tokenize='unicode61'
            )"""
        )


def build_fts(db: sqlite3.Connection, chunks: list[dict], rebuild: bool, live_keys: set) -> dict:
    cur = db.cursor()
    _ensure_tables(cur, rebuild)
    db.commit()

    def chash(c: dict) -> str:
        return md5s(f"{c['title']}|{c['content']}")

    existing = {
        (r[0], r[1], r[2]): r[3]
        for r in cur.execute("SELECT source_type, source_id, chunk_idx, content_hash FROM kb_chunks")
    }

    todo = [c for c in chunks if chash(c) != existing.get((c["source_type"], c["source_id"], c["chunk_idx"]))]
    stats = {"total": len(chunks), "changed": len(todo), "skipped": len(chunks) - len(todo)}
    print(f"新增/变更 {stats['changed']}，跳过 {stats['skipped']}", flush=True)

    # 需要整体重建的源（含"源缩短后旧高索引切片残留"场景）
    dirty_srcs = {(c["source_type"], c["source_id"]) for c in todo}

    # 清理孤儿源（源表已删除/取消公开）——必须在删除脏源旧行之前做（否则查不到）
    orphan = 0
    if live_keys and not rebuild:
        for stype, sid in cur.execute("SELECT DISTINCT source_type, source_id FROM kb_chunks").fetchall():
            if (stype, sid) not in live_keys:
                dirty_srcs.add((stype, sid))
                orphan += 1
        if orphan:
            print(f"清理孤儿源 {orphan} 个", flush=True)

    # 删除脏源/孤儿源的全部旧行
    for stype, sid in dirty_srcs:
        cur.execute(
            "DELETE FROM kb_fts WHERE rowid_map LIKE ?",
            (f"{stype}:{sid}:%",),
        )
        cur.execute(
            "DELETE FROM kb_chunks WHERE source_type=? AND source_id=?",
            (stype, sid),
        )
        # 同源标准（meta+pdf 共享 sid）：任一类型变脏即清两表旧行，防旧切片残留
        if stype in ("standard_meta", "standard_pdf"):
            cur.execute(
                "DELETE FROM kb_fts WHERE rowid_map LIKE ?",
                (f"standard_pdf:{sid}:%",),
            )
            cur.execute(
                "DELETE FROM kb_fts WHERE rowid_map LIKE ?",
                (f"standard_meta:{sid}:%",),
            )
            cur.execute(
                "DELETE FROM kb_chunks WHERE source_type IN ('standard_meta','standard_pdf') AND source_id=?",
                (sid,),
            )

    # 插入新切片
    for i, c in enumerate(todo):
        c["title"] = sanitize(c["title"])
        c["content"] = sanitize(c["content"])
        cur.execute(
            """INSERT INTO kb_chunks (source_type, source_id, chunk_idx, title, content, url, content_hash)
               VALUES (?,?,?,?,?,?,?)""",
            (c["source_type"], c["source_id"], c["chunk_idx"], c["title"],
             c["content"], c["url"], chash(c)),
        )
        cur.execute(
            "INSERT INTO kb_fts (title, content, rowid_map) VALUES (?,?,?)",
            (c["title"], c["content"], f"{c['source_type']}:{c['source_id']}:{c['chunk_idx']}:{cur.lastrowid}"),
        )
        if (i + 1) % 2000 == 0:
            db.commit()
            print(f"  indexed {i + 1}/{len(todo)}", flush=True)
    db.commit()
    return stats


# ---------------- 主流程 ----------------
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--full", action="store_true", help="全量重建（清空重跑）")
    ap.add_argument("--no-pdf", action="store_true")
    ap.add_argument("--workers", type=int, default=2)
    args = ap.parse_args()

    db = sqlite3.connect(DB_PATH, timeout=60)
    cur = db.cursor()

    # 安全锁：防并发构建（2 小时过期自愈）
    cur.execute(
        """CREATE TABLE IF NOT EXISTS kb_build_lock (
            id INTEGER PRIMARY KEY CHECK (id = 1), held_since TEXT)"""
    )
    row = cur.execute("SELECT held_since FROM kb_build_lock WHERE id=1").fetchone()
    if row and row[0]:
        try:
            ts = time.mktime(time.strptime(row[0], "%Y-%m-%d %H:%M:%S"))
        except ValueError:
            ts = 0
        if ts and time.time() - ts < 7200:
            print(f"另一构建进行中（{row[0]} 起锁），退出")
            sys.exit(1)
    cur.execute("INSERT OR REPLACE INTO kb_build_lock (id, held_since) VALUES (1, datetime('now','localtime'))")
    db.commit()

    try:
        mode = "全量重建" if args.full else "增量"
        print(f"[1/2] 收集切片（{mode}模式，{time.strftime('%F %T')}）...", flush=True)
        chunks, live_keys = collect_chunks(db, with_pdf=not args.no_pdf, workers=args.workers)
        from collections import Counter
        print(f"本次采集 {len(chunks)} 切片:", dict(Counter(c['source_type'] for c in chunks)), flush=True)
        if args.dry_run:
            return
        print("[2/2] 构建 FTS 索引...", flush=True)
        stats = build_fts(db, chunks, rebuild=args.full, live_keys=live_keys)
        n = db.execute("SELECT COUNT(*) FROM kb_chunks").fetchone()[0]
        f = db.execute("SELECT COUNT(*) FROM kb_fts").fetchone()[0]
        print(f"完成（{time.strftime('%F %T')}）: kb_chunks={n}, kb_fts={f}, "
              f"本次写入 {stats['changed']} 条", flush=True)
    finally:
        db.execute("UPDATE kb_build_lock SET held_since=NULL WHERE id=1")
        db.commit()
        db.close()


if __name__ == "__main__":
    main()
