#!/usr/bin/env python3
"""daoissimple · WordPress 內容維運小工具

把網站上的頁面／文章拉到本機成為檔案，改完再推回去。
讓 Claude Code 只透過這支腳本碰網站——每個動作都看得見、擋得住、回得去。

用法：
  ./wp.py whoami                  確認連線與身分
  ./wp.py list [pages|posts]      列出所有頁面／文章
  ./wp.py pull pages 12           把第 12 頁拉到 content/
  ./wp.py pull-all [pages|posts]  全部拉下來（等於一份內容快照）
  ./wp.py diff pages 12           比對本機檔案與線上版本
  ./wp.py draft pages 12 --yes    推成草稿，線上版本不動（建議先走這條）
  ./wp.py push pages 12 --yes     推上線（--yes 是刻意的煞車）

只用 Python 標準函式庫，不需要安裝任何東西。
"""

import base64
import difflib
import html
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT / "content"
BACKUP = CONTENT / "_backup"
TYPES = ("pages", "posts")


def die(msg):
    print("錯誤 " + msg, file=sys.stderr)
    raise SystemExit(1)


def info(msg):
    print(msg, file=sys.stderr)


def load_env():
    env_file = ROOT / ".env"
    if not env_file.exists():
        die("找不到 .env。請先：cp .env.example .env，然後把三個值填好。")
    conf = {}
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        conf[key.strip()] = value.strip().strip("'\"")
    for key in ("WP_SITE", "WP_USER", "WP_APP_PASSWORD"):
        if not conf.get(key):
            die(".env 缺少 " + key)
    # .env.example 的佔位字串留著沒改是最常見的第一次出錯原因，直接講明白。
    placeholders = {"你的使用者名稱", "xxxx xxxx xxxx xxxx xxxx xxxx"}
    unfilled = [k for k, v in conf.items() if v in placeholders]
    if unfilled:
        die(".env 裡的 " + "、".join(unfilled) + " 還是範本的預設值，請填入真正的值。")
    conf["WP_SITE"] = conf["WP_SITE"].rstrip("/")
    return conf


ENV = load_env()
API = ENV["WP_SITE"] + "/wp-json/wp/v2"


def api(method, path, body=None):
    """所有對外請求都收斂在這裡：一個地方就看得完網站會被怎麼碰。"""
    token = base64.b64encode(
        (ENV["WP_USER"] + ":" + ENV["WP_APP_PASSWORD"]).encode("utf-8")
    ).decode("ascii")
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", "Basic " + token)
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", "daoissimple-wp-tool/1")
    if data:
        req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:400]
        if exc.code == 401:
            die("401 未授權。應用程式密碼可能打錯或已被撤銷。詳細：" + detail)
        if exc.code == 403:
            die("403 沒有權限。這個帳號的角色可能不能編輯這筆內容。詳細：" + detail)
        if exc.code == 404:
            die("404 找不到。確認 ID 正確，且 REST API 沒有被安全外掛擋掉。詳細：" + detail)
        die("HTTP " + str(exc.code) + "：" + detail)
    except urllib.error.URLError as exc:
        die("連不上 " + ENV["WP_SITE"] + "（" + str(exc.reason) + "）")


def check_type(kind):
    if kind not in TYPES:
        die("型別只能是 pages 或 posts，收到「" + kind + "」。")
    return kind


def title_of(item):
    field = item.get("title") or {}
    return html.unescape(field.get("raw") or field.get("rendered") or "")


def stem_of(kind, item):
    return "{}-{}-{}".format(kind, item["id"], item.get("slug") or "untitled")


def find_local(kind, post_id):
    matches = sorted(CONTENT.glob("{}-{}-*.html".format(kind, post_id)))
    return matches[0] if matches else None


def cmd_whoami(argv):
    me = api("GET", "/users/me?context=edit")
    print("連線成功")
    print("  站台：" + ENV["WP_SITE"])
    print("  身分：{} ({})".format(me.get("name"), me.get("slug")))
    print("  角色：" + (", ".join(me.get("roles") or []) or "未回報"))


def cmd_list(argv):
    kind = check_type(argv[0] if argv else "pages")
    rows = api(
        "GET",
        "/{}?per_page=100&status=any&orderby=modified&order=desc"
        "&context=edit&_fields=id,status,slug,title,modified".format(kind),
    )
    if not rows:
        print("（沒有資料）")
        return
    print("{:>5}  {:<9} {:<11} {}".format("ID", "狀態", "最後修改", "標題"))
    print("-" * 64)
    for row in rows:
        print(
            "{:>5}  {:<9} {:<11} {}".format(
                row["id"],
                row.get("status", ""),
                (row.get("modified") or "")[:10],
                title_of(row),
            )
        )
    print()
    print("共 {} 筆。這支腳本一次最多列 100 筆。".format(len(rows)))


def cmd_pull(argv):
    if len(argv) < 2:
        die("用法：./wp.py pull <pages|posts> <id>")
    kind, post_id = check_type(argv[0]), argv[1]
    item = api("GET", "/{}/{}?context=edit".format(kind, post_id))
    CONTENT.mkdir(parents=True, exist_ok=True)
    stem = stem_of(kind, item)
    body = (item.get("content") or {}).get("raw") or ""
    (CONTENT / (stem + ".html")).write_text(body, encoding="utf-8")
    meta = {k: item.get(k) for k in ("id", "slug", "status", "link", "modified")}
    meta["title"] = (item.get("title") or {}).get("raw", "")
    (CONTENT / (stem + ".json")).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("已拉下 content/{}.html  ← 這是你要改的內容".format(stem))
    print("        content/{}.json  ← 標題與狀態，不要手改".format(stem))


def cmd_pull_all(argv):
    kind = check_type(argv[0] if argv else "pages")
    rows = api("GET", "/{}?per_page=100&status=any&context=edit&_fields=id".format(kind))
    if not rows:
        info("沒有任何 " + kind + "。")
        return
    for row in rows:
        cmd_pull([kind, str(row["id"])])
    info("全部拉完，content/ 現在是一份內容快照。")


def online_body(kind, post_id):
    item = api("GET", "/{}/{}?context=edit".format(kind, post_id))
    return item, ((item.get("content") or {}).get("raw") or "")


def cmd_diff(argv):
    if len(argv) < 2:
        die("用法：./wp.py diff <pages|posts> <id>")
    kind, post_id = check_type(argv[0]), argv[1]
    local_file = find_local(kind, post_id)
    if not local_file:
        die("本機沒有 {} {}，先跑：./wp.py pull {} {}".format(kind, post_id, kind, post_id))
    _, remote = online_body(kind, post_id)
    local = local_file.read_text(encoding="utf-8")
    delta = list(
        difflib.unified_diff(
            remote.splitlines(True), local.splitlines(True), "線上版本", "本機版本"
        )
    )
    if not delta:
        print("一模一樣，沒有待推送的改動。")
        return
    sys.stdout.writelines(delta)


def do_push(argv, status_override):
    if len(argv) < 2:
        die("用法：./wp.py push <pages|posts> <id> --yes")
    kind, post_id = check_type(argv[0]), argv[1]
    if "--yes" not in argv[2:]:
        die("這會改動線上網站。確定的話請在最後加上 --yes。")
    local_file = find_local(kind, post_id)
    if not local_file:
        die("本機沒有 {} {} 的檔案，先跑：./wp.py pull {} {}".format(kind, post_id, kind, post_id))

    # 推送前先把線上現況存一份。沒有 staging 站的時候，這是最後一道防線。
    item, _ = online_body(kind, post_id)
    BACKUP.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    snapshot = BACKUP / "{}-{}-{}.json".format(kind, post_id, stamp)
    snapshot.write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding="utf-8")
    info("推送前的線上版本已存到 content/_backup/" + snapshot.name)

    payload = {"content": local_file.read_text(encoding="utf-8")}
    if status_override:
        payload["status"] = status_override
    result = api("POST", "/{}/{}".format(kind, post_id), payload)
    print("已推送。狀態：{}   網址：{}".format(result.get("status"), result.get("link")))
    print("WordPress 後台的「修訂版本」也留了一份，可以在那裡一鍵還原。")


def cmd_push(argv):
    do_push(argv, None)


def cmd_draft(argv):
    do_push(argv, "draft")


COMMANDS = {
    "whoami": cmd_whoami,
    "list": cmd_list,
    "pull": cmd_pull,
    "pull-all": cmd_pull_all,
    "diff": cmd_diff,
    "push": cmd_push,
    "draft": cmd_draft,
}


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return
    handler = COMMANDS.get(argv[0])
    if not handler:
        die("不認得的指令「{}」。跑 ./wp.py --help 看用法。".format(argv[0]))
    handler(argv[1:])


if __name__ == "__main__":
    main()
