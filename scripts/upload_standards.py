# -*- coding: utf-8 -*-
"""批量上传标准文件到产品小吴知识库 (yigan.tech)

用法: python upload_standards.py [--limit N] [--only 1|2|3]
流程: 登录 → 按分类创建/获取 category → 逐个上传 PDF → 创建 standard 记录
"""
import json
import re
import sys
import time
import urllib.request
import urllib.error
import uuid
from pathlib import Path

BASE = "https://yigan.tech"
USERNAME = "admin"
PASSWORD = "admin123"

# 文件夹 → 分类定义
FOLDERS = {
    "1": {
        "dir": Path(r"E:\01.行业动态\02.标准动态\01.环境标准"),
        "cat_name": "环境标准",
        "cat_slug": "env-standard",
        "tag": "环境标准",
    },
    "2": {
        "dir": Path(r"E:\01.行业动态\02.标准动态\02.职业卫生标准"),
        "cat_name": "职业卫生标准",
        "cat_slug": "occupational-health",
        "tag": "职业卫生",
    },
    "3": {
        "dir": Path(r"E:\01.行业动态\02.标准动态\03.EPA标准"),
        "cat_name": "EPA标准",
        "cat_slug": "epa-standard",
        "tag": "EPA",
    },
}

PDF_EXTS = {".pdf"}
# 进度文件（断点续传）
PROGRESS_FILE = Path(__file__).parent / "upload_progress.json"


def api(method: str, path: str, token: str | None = None, body: dict | None = None):
    """JSON API 请求"""
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def upload_file(token: str, file_path: Path) -> str:
    """multipart 上传文件，返回 URL"""
    boundary = uuid.uuid4().hex
    with open(file_path, "rb") as f:
        file_bytes = f.read()

    lines = []
    lines.append(f"--{boundary}".encode())
    lines.append(
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"'.encode()
    )
    lines.append(b"Content-Type: application/pdf")
    lines.append(b"")
    lines.append(file_bytes)
    lines.append(f"--{boundary}--".encode())

    body = b"\r\n".join(lines)
    req = urllib.request.Request(f"{BASE}/api/upload/file", data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=300) as resp:
        out = json.loads(resp.read())
    return out["url"]


def login() -> str:
    out = api("POST", "/api/users/login", body={"username": USERNAME, "password": PASSWORD})
    return out["access_token"]


def get_or_create_category(token: str, name: str, slug: str) -> int:
    cats = api("GET", "/api/categories?module=standard")
    if isinstance(cats, list):
        for c in cats:
            if c.get("name") == name:
                return c["id"]
    out = api(
        "POST",
        "/api/categories",
        token=token,
        body={"name": name, "slug": slug, "module": "standard"},
    )
    return out["id"]


def parse_title(filename: str) -> tuple[str, str]:
    """从文件名解析标准号和标准名
    例: 'GB 12348-2008 工业企业厂界环境噪声排放标准.pdf'
        → ('GB 12348-2008', '工业企业厂界环境噪声排放标准')
    例: 'method_1.pdf' → ('', 'Method 1')
    """
    stem = Path(filename).stem
    m = re.match(r"^((?:GB|GBZ|GB/T|GBZ/T|HJ|HJ/T|JJG|WS|CJ|CJ/T|NY|AQ)\S*\s*\S*?)\s+(.+)$", stem)
    if m:
        code, name = m.group(1).strip(), m.group(2).strip()
        title = f"{code} {name}" if code else name
        return code, title
    # EPA method 等英文文件
    pretty = re.sub(r"[_\-]+", " ", stem).strip()
    pretty = " ".join(w.capitalize() for w in pretty.split())
    return "", f"EPA {pretty}" if pretty.lower().startswith("method") else pretty


def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
    return {"done": {}}


def save_progress(p: dict):
    PROGRESS_FILE.write_text(json.dumps(p, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    limit = None
    only = None
    args = sys.argv[1:]
    if "--limit" in args:
        limit = int(args[args.index("--limit") + 1])
    if "--only" in args:
        only = args[args.index("--only") + 1]

    print("登录...", flush=True)
    token = login()
    print("登录成功", flush=True)

    # 分类
    cat_ids = {}
    for key, cfg in FOLDERS.items():
        cat_ids[key] = get_or_create_category(token, cfg["cat_name"], cfg["cat_slug"])
        print(f"分类 [{cfg['cat_name']}] id={cat_ids[key]}", flush=True)

    progress = load_progress()
    done = progress["done"]
    uploaded = 0
    failed = []

    for key, cfg in FOLDERS.items():
        if only and key != only:
            continue
        folder = cfg["dir"]
        if not folder.exists():
            print(f"[跳过] 目录不存在: {folder}", flush=True)
            continue

        files = sorted(
            [f for f in folder.rglob("*") if f.is_file() and f.suffix.lower() in PDF_EXTS]
        )
        print(f"\n===== [{cfg['cat_name']}] 共 {len(files)} 个 PDF =====", flush=True)

        for f in files:
            rel = str(f)
            if rel in done:
                continue
            if limit and uploaded >= limit:
                print(f"已达 --limit {limit}，停止", flush=True)
                return

            code, title = parse_title(f.name)
            # title 截断到 200
            title = title[:200]
            print(f"[{uploaded+1}] {f.name}", flush=True)
            try:
                url = upload_file(token, f)
                api(
                    "POST",
                    "/api/standards",
                    token=token,
                    body={
                        "title": title,
                        "description": f.name,
                        "std_type": "document",
                        "category_id": cat_ids[key],
                        "tags": [cfg["tag"]] + ([code] if code else []),
                        "file_url": url,
                        "is_public": True,
                    },
                )
                done[rel] = url
                uploaded += 1
                print(f"    ✓ {url}", flush=True)
            except urllib.error.HTTPError as e:
                failed.append(rel)
                print(f"    ✗ HTTP {e.code}: {e.read()[:100]}", flush=True)
            except Exception as e:
                failed.append(rel)
                print(f"    ✗ {type(e).__name__}: {e}", flush=True)

            # 每 10 个保存进度
            if uploaded % 10 == 0:
                save_progress(progress)

    save_progress(progress)
    print(f"\n===== 完成: 上传 {uploaded} 个, 失败 {len(failed)} 个 =====", flush=True)
    for f_ in failed:
        print(f"  失败: {f_}", flush=True)


if __name__ == "__main__":
    main()
