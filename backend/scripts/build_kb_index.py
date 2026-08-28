"""知识库索引构建脚本 — AI 助手 RAG 索引管道（免费方案：关键词倒排索引）

用法（服务器）:
  cd /home/admin/huanjing-zhiku/backend
  venv/bin/python scripts/build_kb_index.py --dry-run   # 只统计切片数
  venv/bin/python scripts/build_kb_index.py             # 正式建索引

方案:
  1. 文章: 正文按段落切片（~500字/块，50字重叠）
  2. 标准: 元数据块（标准号+名称+分类）+ PDF 全文按页切片
  3. 视频/工具: 标题+描述整条一块
  4. 索引: 不调任何 API——SQLite FTS5 虚拟表（中文按 jieba/二元分词），
     检索时 BM25 排序，零 API 成本
断点续传: content_hash 变化的才重建
"""

import argparse
import hashlib
import json
import re
import sqlite3
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


# ---------------- 切片函数 ----------------
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


def parse_one_pdf(args: tuple) -> tuple[int, str, list[dict]]:
    """子进程：解析单个 PDF"""
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
                     "chunk_idx": 10000 + pi * 10 + ci,
                     "title": f"{t}（第{pi + 1}页）", "content": c,
                     "url": "/standards"}
                )
    except Exception as e:
        print(f"  ! pdf fail id={sid}: {e}", flush=True)
    return sid, t, out


# ---------------- 数据源收集 ----------------
def collect_chunks(db: sqlite3.Connection, with_pdf: bool = True, workers: int = 2) -> list[dict]:
    cur = db.cursor()
    chunks: list[dict] = []

    # 文章
    for aid, title, content in cur.execute(
        "SELECT id, title, content FROM articles WHERE is_public = 1"
    ):
        for idx, c in enumerate(split_text(content)):
            chunks.append({"source_type": "article", "source_id": aid, "chunk_idx": idx,
                           "title": title, "content": c, "url": f"/article/{aid}"})

    # 标准
    pdf_jobs = []
    for sid, title, desc, cat, file_url in cur.execute(
        """SELECT s.id, s.title, COALESCE(s.description,''),
                  COALESCE(c.name,''), COALESCE(s.file_url,'')
           FROM standards s LEFT JOIN categories c ON c.id = s.category_id
           WHERE s.is_public = 1"""
    ):
        t = norm_std_title(title)
        chunks.append({
            "source_type": "standard_meta", "source_id": sid, "chunk_idx": 0,
            "title": t, "content": f"标准号/名称：{t}\n分类：{cat}\n文件：{desc}",
            "url": "/standards",
        })
        if with_pdf and file_url and file_url.startswith("/uploads/"):
            pdf_jobs.append((sid, t, file_url))

    if pdf_jobs:
        print(f"并行解析 {len(pdf_jobs)} 个 PDF（workers={workers}）...", flush=True)
        done = 0
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futs = [pool.submit(parse_one_pdf, j) for j in pdf_jobs]
            for fut in as_completed(futs):
                _, _, sub = fut.result()
                chunks.extend(sub)
                done += 1
                if done % 100 == 0:
                    print(f"  pdf done: {done}/{len(pdf_jobs)}", flush=True)

    # 视频
    for vid, title, desc in cur.execute(
        "SELECT id, title, COALESCE(description,'') FROM videos WHERE is_public = 1"
    ):
        if title or desc:
            chunks.append({"source_type": "video", "source_id": vid, "chunk_idx": 0,
                           "title": title, "content": f"视频：{title}\n{desc}"[:800],
                           "url": f"/videos/{vid}"})

    # 工具
    for tid, name, desc, slug in cur.execute("SELECT id, name, COALESCE(description,''), slug FROM tools"):
        chunks.append({"source_type": "tool", "source_id": tid, "chunk_idx": 0,
                       "title": name, "content": f"计算工具：{name}\n{desc}"[:800],
                       "url": f"/tools/{slug}"})
    return chunks


# ---------------- FTS5 索引 ----------------
def build_fts(db: sqlite3.Connection, chunks: list[dict], rebuild: bool) -> None:
    cur = db.cursor()
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
    db.commit()

    existing = {
        (r[0], r[1], r[2]): r[3]
        for r in cur.execute("SELECT source_type, source_id, chunk_idx, content_hash FROM kb_chunks")
    }

    def chash(c: dict) -> str:
        clean = sanitize(f"{c['title']}|{c['content']}")
        return hashlib.md5(clean.encode("utf-8", errors="ignore")).hexdigest()

    todo = [c for c in chunks if chash(c) != existing.get((c["source_type"], c["source_id"], c["chunk_idx"]))]
    print(f"新增/变更 {len(todo)}，跳过 {len(chunks) - len(todo)}", flush=True)
    if not todo and not rebuild:
        print("索引已是最新")
        return

    # FTS5 表（unicode61 对中文按字切分，二元组查询足够好用）
    try:
        cur.execute("SELECT * FROM kb_fts LIMIT 1")
    except sqlite3.OperationalError:
        cur.execute(
            """CREATE VIRTUAL TABLE kb_fts USING fts5(
                title, content, rowid_map UNINDEXED,
                tokenize='unicode61'
            )"""
        )
    else:
        # 同步删除已变更的旧行
        for c in todo:
            cur.execute(
                "DELETE FROM kb_fts WHERE rowid_map = ?",
                (f"{c['source_type']}:{c['source_id']}:{c['chunk_idx']}",),
            )

    for i, c in enumerate(todo):
        c["title"] = sanitize(c["title"])
        c["content"] = sanitize(c["content"])
        cur.execute(
            """INSERT INTO kb_chunks (source_type, source_id, chunk_idx, title, content, url, content_hash)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(source_type, source_id, chunk_idx) DO UPDATE SET
                 title=excluded.title, content=excluded.content, url=excluded.url,
                 content_hash=excluded.content_hash, updated_at=datetime('now','localtime')""",
            (c["source_type"], c["source_id"], c["chunk_idx"], c["title"],
             c["content"], c["url"], chash(c)),
        )
        cur.execute(
            "SELECT id FROM kb_chunks WHERE source_type=? AND source_id=? AND chunk_idx=?",
            (c["source_type"], c["source_id"], c["chunk_idx"]),
        )
        row_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO kb_fts (title, content, rowid_map) VALUES (?,?,?)",
            (c["title"], c["content"], f"{c['source_type']}:{c['source_id']}:{c['chunk_idx']}:{row_id}"),
        )
        if (i + 1) % 2000 == 0:
            db.commit()
            print(f"  indexed {i + 1}/{len(todo)}", flush=True)
    db.commit()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-pdf", action="store_true")
    ap.add_argument("--workers", type=int, default=2)
    args = ap.parse_args()

    db = sqlite3.connect(DB_PATH)
    print("[1/2] 收集切片...", flush=True)
    chunks = collect_chunks(db, with_pdf=not args.no_pdf, workers=args.workers)
    from collections import Counter
    print(f"共 {len(chunks)} 切片:", dict(Counter(c['source_type'] for c in chunks)), flush=True)
    if args.dry_run:
        return
    print("[2/2] 构建 FTS 索引...", flush=True)
    build_fts(db, chunks, rebuild=False)
    n = db.execute("SELECT COUNT(*) FROM kb_chunks").fetchone()[0]
    print(f"完成: kb_chunks 共 {n} 条")


if __name__ == "__main__":
    main()
