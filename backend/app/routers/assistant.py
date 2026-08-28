"""AI 助手路由 — RAG 检索增强问答（SSE 流式，免费方案）

- 检索: SQLite FTS5 关键词全文检索（BM25 排序），零 API 成本
- 生成: zhipuai glm-4-flash（免费模型）；余额充值后可切 glm-5.3
- 输出: SSE，事件流 [来源] → [答案分片] → done
"""

import json
import os
import re
import sqlite3
from pathlib import Path

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/assistant", tags=["AI助手"])

ZHIPU_BASE = os.getenv("ZHIPU_BASE_URL", "https://open.bigmodel.cn/api/coding/paas/v4")
CHAT_MODEL = os.getenv("ZHIPU_CHAT_MODEL", "glm-5.3-Flash")
TOP_K = 6

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BACKEND_DIR / "hjzk.db"

STOPWORDS = {"的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一", "上",
             "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
             "自己", "这", "那", "什么", "怎么", "如何", "哪些", "请", "问", "一下",
             "吗", "呢", "吧", "啊", "的", "与", "及", "或", "对", "对于", "关于"}


def _tokenize(q: str) -> list[str]:
    """简易中文分词：连续英文/数字串 + 中文 2-gram + 去停用词"""
    q = q.strip()
    tokens = re.findall(r"[A-Za-z0-9./-]+", q)
    # 英文标准号如 GB/T 16107、HJ 1385 直接保留
    cn = re.sub(r"[A-Za-z0-9./\s-]+", " ", q)
    cn = re.sub(r"\s+", "", cn)
    grams = [cn[i:i + 2] for i in range(len(cn) - 1)]
    grams = [g for g in grams if g not in STOPWORDS and not all(ch in STOPWORDS for ch in g)]
    return tokens + grams


class ChatRequest(BaseModel):
    question: str
    history: list[dict] | None = None


def _sse(data: dict) -> str:
    return "data: " + json.dumps(data, ensure_ascii=False) + "\n\n"


def _search_chunks(question: str) -> list[dict]:
    """FTS5 全文检索 TOP_K，MATCH 查询失败或无结果时回退 LIKE"""
    tokens = _tokenize(question)
    if not tokens:
        return []
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        rows: list = []
        # 优先整句短语匹配（准确度最高），失败再逐词 OR
        phrase = question.replace('"', " ").strip()
        match_exprs = []
        if len(phrase) >= 2:
            match_exprs.append(f'"{phrase}"')
        # 标准号类 token 单独提升
        std_tokens = [t for t in tokens if re.search(r"\d", t) and len(t) >= 3]
        if std_tokens:
            match_exprs.append(" OR ".join(f'"{t}"' for t in std_tokens[:6]))
        match_exprs.append(" OR ".join(f'"{t}"' for t in tokens[:10]))

        for expr in match_exprs:
            try:
                rows = conn.execute(
                    """SELECT rowid_map, title, content,
                              bm25(kb_fts, 3.0, 1.0, 0) AS rank
                       FROM kb_fts WHERE kb_fts MATCH ?
                       ORDER BY rank LIMIT ?""",
                    (expr, TOP_K),
                ).fetchall()
            except sqlite3.OperationalError:
                rows = []
            if rows:
                break

        # LIKE 兜底：取标题含关键词的元数据块
        if not rows:
            clean_q = re.sub(r"[?？!！。，,\s]+", "", question)[:20]
            like = "%" + clean_q + "%"
            if len(like) > 4:
                rows = conn.execute(
                    """SELECT source_type || ':' || source_id || ':' || chunk_idx || ':' || id AS rowid_map,
                              title, content, 0 AS rank
                       FROM kb_chunks
                       WHERE title LIKE ? OR content LIKE ?
                       LIMIT ?""",
                    (like, like, TOP_K),
                ).fetchall()

        out = []
        for r in rows:
            parts = r["rowid_map"].split(":")
            out.append({
                "source_type": parts[0],
                "source_id": int(parts[1]),
                "title": r["title"],
                "content": r["content"],
                "url": "/standards",
            })
        return out[:TOP_K]
    finally:
        conn.close()


def _resolve_urls(chunks: list[dict]) -> None:
    """按 source 补全跳转 url"""
    if not chunks:
        return
    conn = sqlite3.connect(str(DB_PATH))
    try:
        cur = conn.cursor()
        for c in chunks:
            st, sid = c["source_type"], c["source_id"]
            if st == "article":
                c["url"] = f"/article/{sid}"
            elif st == "video":
                c["url"] = f"/videos/{sid}"
            elif st == "tool":
                row = cur.execute("SELECT slug FROM tools WHERE id=?", (sid,)).fetchone()
                c["url"] = f"/tools/{row[0]}" if row else "/tools"
            else:  # standard_meta / standard_pdf
                c["url"] = "/standards"
    finally:
        conn.close()


def _build_prompt(question: str, chunks: list[dict]) -> str:
    labels = {"article": "文章", "standard_meta": "标准", "standard_pdf": "标准全文",
              "video": "视频", "tool": "工具"}
    parts = ["【" + str(i) + "】（" + labels.get(c['source_type'], '资料') + "）" + c['title'] + "\n" + c['content'][:700]
             for i, c in enumerate(chunks, 1)]
    ctx = "\n\n".join(parts)
    return f"""你是「产品小吴知识库」的 AI 助手，专注环境监测领域（气体检测、烟尘采样、水质监测、标准规范、检测仪器）。

【站点模块】你可引导用户使用：技术文章（论坛：数智化/案例分享/技术分享/产品经理/行业动态）、标准库（1242+ 国家/环境/职业卫生/EPA 标准全文检索与在线预览）、视频（技术畅享/探讨交流/产品经理）、在线计算工具（大气稳定度、烟道布点、采样模型、单位换算、紫外差分等 6 个）。

【职责边界 — 必须遵守】
1. 只解答环境监测领域知识问题、介绍站内内容、提供学习引导。用户说"帮我设计一个软件/写代码/写方案/做其他工作"等超出知识问答范围的请求，礼貌拒绝并说明你只提供环境监测知识服务
2. 涉及具体仪器操作、安全规范，提醒用户以官方说明书和现行标准原文为准
3. 不编造标准号、数据；不确定就说不确定
4. 不提供医疗、法律、投资建议；不讨论政治敏感话题
5. 知识库没有相关内容时，用专业知识简要回答，开头注明"（知识库暂无相关内容，以下为专业解答）"

知识库内容：
{ctx if ctx else "（无检索结果）"}

用户问题：{question}"""


@router.post("/chat")
async def chat(req: ChatRequest):
    key = os.getenv("ZHIPU_API_KEY", "")
    if not key:
        return {"detail": "AI 助手未配置"}

    chunks = _search_chunks(req.question)
    _resolve_urls(chunks)

    async def gen():
        sources = [{"title": c["title"], "url": c["url"], "source_type": c["source_type"],
                    "source_id": c["source_id"]} for c in chunks[:4]]
        yield _sse({"type": "sources", "sources": sources})

        messages = [{"role": "system", "content": "你是「产品小吴知识库」AI 助手，专注环境监测领域知识问答（标准规范、采样技术、仪器原理、站内内容引导）。拒绝超出知识服务范围的请求（写代码、设计软件、写商业方案等），礼貌引导回环境监测知识。用中文，markdown 格式输出。"}]
        if req.history:
            messages.extend(req.history[-6:])
        messages.append({"role": "user", "content": _build_prompt(req.question, chunks)})

        try:
            async with httpx.AsyncClient(timeout=180) as client:
                async with client.stream(
                    "POST", f"{ZHIPU_BASE}/chat/completions",
                    headers={"Authorization": f"Bearer {key}"},
                    json={"model": CHAT_MODEL, "messages": messages, "stream": True,
                          "max_tokens": 1500},
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        payload = line[5:].strip()
                        if payload == "[DONE]":
                            break
                        try:
                            delta = json.loads(payload)["choices"][0]["delta"]
                            # 推理模型: reasoning_content 是思考过程（可推送前端显示"思考中"），content 才是答案
                            reasoning = delta.get("reasoning_content") or ""
                            if reasoning:
                                yield _sse({"type": "reasoning", "text": reasoning[:200]})
                                continue
                            piece = delta.get("content") or ""
                            if piece:
                                yield _sse({"type": "delta", "text": piece})
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
        except Exception as e:
            yield _sse({"type": "error", "message": f"生成失败: {e}"})
        yield _sse({"type": "done"})

    return StreamingResponse(
        gen(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/status")
async def status():
    configured = bool(os.getenv("ZHIPU_API_KEY", ""))
    n = 0
    if configured:
        try:
            conn = sqlite3.connect(str(DB_PATH))
            n = conn.execute("SELECT COUNT(*) FROM kb_chunks").fetchone()[0]
            conn.close()
        except Exception:
            pass
    return {"enabled": configured, "chunks": n, "model": CHAT_MODEL}
