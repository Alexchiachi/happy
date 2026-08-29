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
  ./wp.py new posts "標題" --yes   建立一篇新草稿
  ./wp.py push pages 12 --yes     存檔並發布（--yes 是刻意的煞車）
  ./wp.py draft pages 12 --yes    存成草稿（只適用於尚未發布的東西）

已發布的頁面沒有「草稿版」可言——WordPress 沒這功能。要確認改了什麼，
用 diff；推上去之後若不滿意，用後台的「修訂版本」還原。

只用 Python 標準函式庫，不需要安裝任何東西。
"""

import base64
import difflib
import html
import json
import os
import re
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


_ENV = {}


def env():
    """延後到真正要連線時才讀 .env，這樣 --help 不用先設定就能看。"""
    if not _ENV:
        _ENV.update(load_env())
    return _ENV


def api(method, path, body=None):
    """所有對外請求都收斂在這裡：一個地方就看得完網站會被怎麼碰。"""
    ENV = env()
    API = ENV["WP_SITE"] + "/wp-json/wp/v2"
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
    # 中文標題產生的 slug 是百分號編碼的，當檔名沒法看，一律退回 untitled。
    slug = item.get("slug") or ""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*", slug):
        slug = "untitled"
    return "{}-{}-{}".format(kind, item["id"], slug)


def meta_of(local_file):
    """讀 .html 旁邊那份 .json。標題和摘要放在那裡。"""
    path = local_file.with_suffix(".json")
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        die("讀不懂 {}（{}）。JSON 壞了，多半是少了逗號或引號。".format(path.name, exc))


def find_local(kind, post_id):
    matches = sorted(CONTENT.glob("{}-{}-*.html".format(kind, post_id)))
    return matches[0] if matches else None


def cmd_whoami(argv):
    me = api("GET", "/users/me?context=edit")
    print("連線成功")
    print("  站台：" + env()["WP_SITE"])
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
    meta = {
        "_說明": "title 和 excerpt 可以改，push 時會一起送上去。"
                 "底線開頭的欄位只是參考，改了不會生效。",
        "title": (item.get("title") or {}).get("raw", ""),
        "excerpt": (item.get("excerpt") or {}).get("raw", ""),
        "_id": item["id"],
        "_slug": item.get("slug"),
        "_status": item.get("status"),
        "_link": item.get("link"),
        "_modified": item.get("modified"),
    }
    (CONTENT / (stem + ".json")).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print("已拉下 content/{}.html  ← 內文".format(stem))
    print("        content/{}.json  ← 標題與摘要".format(stem))


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
    item, remote = online_body(kind, post_id)
    meta = meta_of(local_file)

    changed = False
    for field, label in (("title", "標題"), ("excerpt", "摘要")):
        if field not in meta:
            continue
        was = (item.get(field) or {}).get("raw", "")
        now = meta.get(field) or ""
        if was != now:
            changed = True
            print("{}：".format(label))
            print("  線上　{}".format(was or "（空白）"))
            print("  本機　{}".format(now or "（空白）"))
            print()

    local = local_file.read_text(encoding="utf-8")
    delta = list(
        difflib.unified_diff(
            remote.splitlines(True), local.splitlines(True), "線上版本", "本機版本"
        )
    )
    if delta:
        changed = True
        sys.stdout.writelines(delta)
        if not delta[-1].endswith("\n"):
            print()

    if not changed:
        print("一模一樣，沒有待推送的改動。")


def do_push(argv, status):
    if len(argv) < 2:
        die("用法：./wp.py push <pages|posts> <id> --yes")
    kind, post_id = check_type(argv[0]), argv[1]
    if "--yes" not in argv[2:]:
        die("這會改動線上網站。確定的話請在最後加上 --yes。")
    local_file = find_local(kind, post_id)
    if not local_file:
        die("本機沒有 {} {} 的檔案，先跑：./wp.py pull {} {}".format(kind, post_id, kind, post_id))

    # 先把本機檔案讀完、確認沒問題，再碰網路。壞掉的 .json 不該先害我們
    # 存下一份沒用的快照。
    meta = meta_of(local_file)
    payload = {"content": local_file.read_text(encoding="utf-8"), "status": status}
    for field in ("title", "excerpt"):
        if field in meta:
            payload[field] = meta[field] or ""

    item, _ = online_body(kind, post_id)

    # WordPress 沒有「已發布頁面的草稿版本」這種東西。把一個已發布的頁面設成
    # draft，是直接把它從網站上撤下來，不是做一份預覽版。
    if status == "draft" and item.get("status") == "publish" and "--unpublish" not in argv:
        die(
            "{} {} 目前是「已發布」。draft 會把它從網站上撤下來，不是做預覽版——\n"
            "      WordPress 沒有「已發布頁面的草稿版」這種功能。\n"
            "      想先確認改了什麼：./wp.py diff {} {}\n"
            "      真的要下架：在最後再加上 --unpublish".format(kind, post_id, kind, post_id)
        )

    # 推送前先把線上現況存一份。沒有 staging 站的時候，這是最後一道防線。
    BACKUP.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    snapshot = BACKUP / "{}-{}-{}.json".format(kind, post_id, stamp)
    snapshot.write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding="utf-8")
    info("推送前的線上版本已存到 content/_backup/" + snapshot.name)

    # slug 刻意不推。改了網址，所有既有連結、書籤、搜尋結果就全部指向 404。
    # 真要改請到後台手動改，並且自己決定要不要設轉址。
    if meta.get("_slug") and meta["_slug"] != item.get("slug"):
        info("注意：_slug 被改過，但網址不會跟著變更——改網址會讓舊連結全部失效。")
        info("      真的要改請到 WordPress 後台改，並記得設定轉址。")
    result = api("POST", "/{}/{}".format(kind, post_id), payload)
    print("已推送。狀態：{}   網址：{}".format(result.get("status"), result.get("link")))
    print("WordPress 後台的「修訂版本」也留了一份，可以在那裡一鍵還原。")


def cmd_new(argv):
    if len(argv) < 2:
        die('用法：./wp.py new <pages|posts> "標題" --yes')
    kind, title = check_type(argv[0]), argv[1]
    if "--yes" not in argv[2:]:
        die("這會在網站上建立一筆新草稿。確定的話請在最後加上 --yes。")
    item = api("POST", "/" + kind, {"title": title, "status": "draft", "content": ""})
    print("已建立草稿 #{}：{}".format(item["id"], title))
    cmd_pull([kind, str(item["id"])])
    print()
    print("草稿不會出現在網站上。寫完內容後：")
    print("  ./wp.py diff {} {}          看看要送出什麼".format(kind, item["id"]))
    print("  ./wp.py push {} {} --yes    才會真的上線".format(kind, item["id"]))


def cmd_push(argv):
    do_push(argv, "publish")


def cmd_draft(argv):
    do_push(argv, "draft")


COMMANDS = {
    "whoami": cmd_whoami,
    "list": cmd_list,
    "pull": cmd_pull,
    "pull-all": cmd_pull_all,
    "diff": cmd_diff,
    "new": cmd_new,
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
