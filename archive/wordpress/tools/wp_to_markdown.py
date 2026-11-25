#!/usr/bin/env python3
"""把 WordPress SQL 匯出檔中的已發布文章/頁面轉成 Markdown 檔（僅用標準函式庫）。

用法：
    python3 wp_to_markdown.py localhost.sql -o markdown

會自動找出 `<prefix>_posts` 資料表（例如 wp_posts、9Bv_posts），
只保留 post_status = 'publish' 且 post_type 為 post / page 的資料，
每篇輸出為 <輸出資料夾>/<post|page>/<slug>.md。
"""
import argparse
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote

# ---------------------------------------------------------------- SQL 解析

INSERT_RE = re.compile(r"INSERT INTO `(\w*posts)` \(([^)]*)\) VALUES\s*")
MYSQL_ESCAPES = {"0": "\0", "b": "\b", "n": "\n", "r": "\r", "t": "\t", "Z": "\x1a"}


def parse_values(sql, pos):
    """從 VALUES 之後解析 (...),(...); 回傳 (rows, 結束位置)。"""
    rows, n = [], len(sql)
    while pos < n:
        while sql[pos] in " \t\r\n,":
            pos += 1
        if sql[pos] == ";":
            return rows, pos + 1
        assert sql[pos] == "(", f"預期 '(' 但在 {pos} 看到 {sql[pos]!r}"
        pos += 1
        row = []
        while True:
            while sql[pos] in " \t\r\n":
                pos += 1
            if sql[pos] == "'":
                pos += 1
                buf = []
                while True:
                    c = sql[pos]
                    if c == "\\":
                        nxt = sql[pos + 1]
                        buf.append(MYSQL_ESCAPES.get(nxt, nxt))
                        pos += 2
                    elif c == "'":
                        if sql[pos + 1] == "'":  # '' 代表一個單引號
                            buf.append("'")
                            pos += 2
                        else:
                            pos += 1
                            break
                    else:
                        buf.append(c)
                        pos += 1
                row.append("".join(buf))
            else:
                m = re.compile(r"[^,)]*").match(sql, pos)
                token = m.group().strip()
                row.append(None if token.upper() == "NULL" else token)
                pos = m.end()
            while sql[pos] in " \t\r\n":
                pos += 1
            if sql[pos] == ",":
                pos += 1
            elif sql[pos] == ")":
                pos += 1
                break
        rows.append(row)
    return rows, pos


def read_posts(sql_text):
    posts = []
    for m in INSERT_RE.finditer(sql_text):
        cols = [c.strip().strip("`") for c in m.group(2).split(",")]
        rows, _ = parse_values(sql_text, m.end())
        posts.extend(dict(zip(cols, r)) for r in rows)
    return posts

# ---------------------------------------------------------------- HTML → Markdown

BLOCK_TAGS = {"p", "div", "section", "article", "figure", "header", "footer",
              "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
              "blockquote", "pre", "table", "tr", "hr", "figcaption"}
SKIP_TAGS = {"script", "style", "noscript", "iframe", "svg", "form", "button"}


class MarkdownConverter(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []          # 輸出片段
        self.lists = []        # 巢狀清單堆疊：['ul'|'ol', 計數]
        self.quote = 0         # blockquote 深度
        self.pre = 0
        self.skip = 0
        self.links = []        # 目前開啟中的 <a> 的 href
        self.row = None        # 表格目前列
        self.cell = None
        self.table_rows = None

    # -- 輸出工具
    def write(self, s):
        if self.cell is not None:
            self.cell.append(s)
        else:
            self.out.append(s)

    def newline(self, count=1):
        if self.cell is not None:
            self.cell.append(" ")
            return
        prefix = "> " * self.quote
        self.out.append(("\n" + prefix.rstrip()) * (count - 1) + "\n" + prefix)

    # -- 解析事件
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in SKIP_TAGS:
            self.skip += 1
            return
        if self.skip:
            return
        if tag in BLOCK_TAGS and tag not in ("li", "tr"):
            self.newline(2)
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.write("#" * int(tag[1]) + " ")
        elif tag == "br":
            self.write("\\")   # CommonMark 硬換行
            self.newline()
        elif tag == "hr":
            self.write("---")
            self.newline(2)
        elif tag in ("strong", "b"):
            self.write("**")
        elif tag in ("em", "i"):
            self.write("*")
        elif tag in ("del", "s"):
            self.write("~~")
        elif tag == "code" and not self.pre:
            self.write("`")
        elif tag == "pre":
            self.pre += 1
            self.write("```")
            self.newline()
        elif tag == "blockquote":
            self.quote += 1
            self.newline()
        elif tag in ("ul", "ol"):
            self.lists.append([tag, 0])
        elif tag == "li":
            self.newline()
            indent = "  " * (len(self.lists) - 1)
            if self.lists and self.lists[-1][0] == "ol":
                self.lists[-1][1] += 1
                self.write(f"{indent}{self.lists[-1][1]}. ")
            else:
                self.write(f"{indent}- ")
        elif tag == "a":
            self.links.append(attrs.get("href"))
            if attrs.get("href"):
                self.write("[")
        elif tag == "img":
            src = attrs.get("src")
            if src:
                self.write(f"![{attrs.get('alt') or ''}]({src})")
        elif tag in ("video", "audio", "source") and attrs.get("src"):
            self.write(f"[{tag if tag != 'source' else 'media'}]({attrs['src']})")
        elif tag == "table":
            self.table_rows = []
        elif tag == "tr" and self.table_rows is not None:
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag in ("strong", "b"):
            self.write("**")
        elif tag in ("em", "i"):
            self.write("*")
        elif tag in ("del", "s"):
            self.write("~~")
        elif tag == "code" and not self.pre:
            self.write("`")
        elif tag == "pre":
            self.pre = max(0, self.pre - 1)
            self.newline()
            self.write("```")
        elif tag == "blockquote":
            self.quote = max(0, self.quote - 1)
        elif tag in ("ul", "ol") and self.lists:
            self.lists.pop()
        elif tag == "a" and self.links:
            href = self.links.pop()
            if href:
                self.write(f"]({href})")
        elif tag in ("td", "th") and self.cell is not None:
            self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip().replace("|", "\\|"))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.table_rows.append(self.row)
            self.row = None
        elif tag == "table" and self.table_rows is not None:
            rows, self.table_rows = self.table_rows, None
            if rows:
                width = max(len(r) for r in rows)
                rows = [r + [""] * (width - len(r)) for r in rows]
                lines = ["| " + " | ".join(rows[0]) + " |",
                         "|" + " --- |" * width]
                lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
                self.newline(2)
                self.write("\n".join(lines))
        if tag in BLOCK_TAGS:
            self.newline(2)

    def handle_data(self, data):
        if self.skip:
            return
        if self.pre:
            self.write(data)
            return
        text = re.sub(r"\s+", " ", data)
        last = (self.cell or self.out or [""])[-1]
        if last.endswith(("\n", "> ", "- ", ". ", "# ")) or not last:
            text = text.lstrip()                  # 行首不留空白
        self.write(text)

    def markdown(self):
        lines, prev_blank = [], False
        for line in "".join(self.out).split("\n"):
            line = line.rstrip()
            if line.strip("> ") == "\\":            # 只剩硬換行的行視為空行
                line = line[:-1].rstrip()
            blank = line.strip("> ") == ""
            if not (blank and prev_blank):          # 合併連續空行
                lines.append(line)
            prev_blank = blank
        md = "\n".join(lines)
        md = re.sub(r"\*\*\s*\*\*|(?<!\*)\*\s*\*(?!\*)", "", md)   # 空的粗體/斜體
        md = re.sub(r"(?<!!)\[\s*\]\([^)]*\)", "", md)                  # 空連結
        md = re.sub(r"\\(\n[> ]*(\n|$))", r"\1", md)                 # 段落結尾多餘的硬換行
        md = re.sub(r"(\[|^#+ )[ \\\n]+|[ \\\n]+(?=\]\()", r"\1", md, flags=re.M)  # 連結/標題內的換行
        return md.strip().rstrip("\\").strip() + "\n"


def wpautop(text):
    """傳統編輯器的內容用空行分段，需先補上 <p>/<br>。"""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    return "\n".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paras)


def clean_content(raw):
    content = re.sub(r"<!--.*?-->", "", raw, flags=re.S)                # WordPress 區塊註解
    content = re.sub(r"\[/?[a-zA-Z_][\w-]*(?:\s[^\]]*)?/?\]", "", content)  # 短代碼 [xxx]
    if "<!-- wp:" not in raw:
        content = wpautop(content)
    conv = MarkdownConverter()
    conv.feed(content)
    conv.close()
    return conv.markdown()

# ---------------------------------------------------------------- 輸出


def yaml_str(s):
    return json.dumps(s, ensure_ascii=False)  # JSON 字串即合法的 YAML 雙引號字串


def safe_filename(name):
    return re.sub(r'[\\/:*?"<>|\s]+', "-", name).strip("-.") or "untitled"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sql", help="WordPress 匯出的 .sql 檔")
    ap.add_argument("-o", "--out", default="markdown", help="輸出資料夾（預設 ./markdown）")
    args = ap.parse_args()

    sql_text = Path(args.sql).read_text(encoding="utf-8", errors="replace")
    posts = [p for p in read_posts(sql_text)
             if p.get("post_status") == "publish" and p.get("post_type") in ("post", "page")]
    if not posts:
        sys.exit("找不到符合條件的文章（post_status=publish、post_type=post/page）。")

    out_root = Path(args.out)
    used = set()
    for p in posts:
        title = html.unescape(p["post_title"] or "")
        slug = unquote(p["post_name"] or "") or str(p["ID"])
        fname = safe_filename(slug)
        key = (p["post_type"], fname)
        if key in used:                       # 同名時加上 ID 避免覆蓋
            fname = f"{fname}-{p['ID']}"
        used.add((p["post_type"], fname))

        front = "\n".join([
            "---",
            f"title: {yaml_str(title)}",
            f"date: {yaml_str(p['post_date'])}",
            f"slug: {yaml_str(slug)}",
            "---",
        ])
        path = out_root / p["post_type"] / f"{fname}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(front + "\n\n" + clean_content(p["post_content"] or ""), encoding="utf-8")

    counts = {t: sum(p["post_type"] == t for p in posts) for t in ("post", "page")}
    print(f"完成：{counts['post']} 篇文章、{counts['page']} 個頁面 → {out_root.resolve()}")


if __name__ == "__main__":
    main()
