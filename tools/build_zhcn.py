#!/usr/bin/env python3
"""
從繁體版產生簡體版（zh-cn/），並在兩邊互相掛上語言切換與 hreflang。

為什麼用「各語系獨立檔案」而不是 JS 切換：
內容網站要能被搜尋引擎分別收錄、要能把某一語言的網址直接寄給客戶、
分享到社群時預覽也要是該語言。JS 字典切換做不到這三件事。

轉換用 OpenCC 的 tw2sp 設定：不只是繁簡字轉換，還會把台灣用語換成
大陸用語（網路→网络、影片→视频、專案→项目、紮染→扎染）。

用法（在專案根目錄）：
    python3 tools/build_zhcn.py

每次改完繁體版就重跑一次，zh-cn/ 會整個重建。
之後要加英文、日文，照同一個結構開 en/、ja/ 即可。
"""
import pathlib
import re
import shutil
import sys

try:
    from opencc import OpenCC
except ImportError:
    sys.exit("需要 opencc：pip install opencc-python-reimplemented")

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "zh-cn"
BASE = "https://alexchiachi.github.io/happy/"
CC = OpenCC("tw2sp")

# 同一個 repo 裡的其他獨立專案，各自有版型與 i18n，不歸這支腳本管。
# inner-flow（內耗熵值檢測）自己就有一套五語系切換。
SKIP_DIRS = ("book", "epubqa", "whitepaper", "node_modules", "zh-cn",
             "eternitychildbooking", "inner-flow", "docs", "tools", "tests",
             "images", "google")

# 舊網址的轉址殼，不做簡體版
SKIP_FILES = {"inner-flow.html"}

# 這些東西只有根目錄那一份，兩種語系共用。簡體頁在 zh-cn/ 底下，
# 所以路徑都要多退一層，否則會去找 zh-cn/ 底下不存在的檔案。
SHARED = ("styles.css", "scripts.js", "images/", "inner-flow/", "inner-flow.html")

# 不歸本站管、但仍要出現在 sitemap 裡的獨立專案入口
EXTRA_URLS = ("inner-flow",)

# 有些內容不是「換字」而是「本來就該不一樣」——最典型的是幣別與報價。
# key 是頁面路徑，value 是一串（繁體原文 → 簡體版要顯示的字）。
# 在 OpenCC 轉換之前套用，所以左邊寫繁體版檔案裡的原文。
# 找不到就直接中止：報價漏掉不會有人發現，但改錯價是真的會出事。
OVERRIDES = {
    "services.html": [
        ("NT$ 500,000 起", "RMB 150,000 起"),   # 預約訂製四項
        ("NT$ 50,000 起", "RMB 15,000 起"),     # 幸福諮詢顧問
    ],
}


def pages():
    for p in sorted(ROOT.rglob("*.html")):
        if any(d in p.parts for d in SKIP_DIRS):
            continue
        if p.name in SKIP_FILES or p.name == "_template.html":
            continue
        yield p


def lang_switch_li(rel_to_other, label, hreflang):
    return ('<li class="lang-switch"><a href="%s" hreflang="%s" lang="%s">%s</a></li>'
            % (rel_to_other, hreflang, hreflang, label))


def strip_lang_switch(html):
    return re.sub(r'\s*<li class="lang-switch">.*?</li>', "", html, flags=re.S)


def strip_alternates(html):
    return re.sub(r'\s*<link rel="alternate"[^>]*>', "", html)


def alternates(rel):
    """兩種語言互指，x-default 指繁體。"""
    return ('\n  <link rel="alternate" hreflang="zh-Hant" href="%s%s">'
            '\n  <link rel="alternate" hreflang="zh-Hans" href="%szh-cn/%s">'
            '\n  <link rel="alternate" hreflang="x-default" href="%s%s">'
            % (BASE, rel, BASE, rel, BASE, rel))


def sitemap(rels):
    """每個網址各出現一次，並在自己底下列出所有語言版本（Google 要求雙向都寫）。"""
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
           ' xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for rel in rels:
        for loc in (BASE + rel, BASE + "zh-cn/" + rel):
            out.append("  <url>")
            out.append("    <loc>%s</loc>" % loc)
            out.append('    <xhtml:link rel="alternate" hreflang="zh-Hant" href="%s%s"/>' % (BASE, rel))
            out.append('    <xhtml:link rel="alternate" hreflang="zh-Hans" href="%szh-cn/%s"/>' % (BASE, rel))
            out.append('    <xhtml:link rel="alternate" hreflang="x-default" href="%s%s"/>' % (BASE, rel))
            out.append("  </url>")
    # 獨立專案自己管內容，這裡只留一筆入口讓它繼續被收錄。
    # 轉址殼（SKIP_FILES）刻意不列——它是 noindex。
    for name in EXTRA_URLS:
        if (ROOT / name / "index.html").exists():
            out.append("  <url>\n    <loc>%s%s/</loc>\n  </url>" % (BASE, name))
    out.append("</urlset>")
    return "\n".join(out) + "\n"


def main():
    if OUT.exists():
        shutil.rmtree(OUT)

    n_zh, n_cn = 0, 0
    rels = []
    for src in pages():
        rel = src.relative_to(ROOT).as_posix()
        rels.append(rel)
        depth = rel.count("/")            # 0 = 根目錄頁, 1 = journal/ 內頁
        up = "../" * depth

        html = src.read_text(encoding="utf-8")
        html = strip_lang_switch(html)
        html = strip_alternates(html)

        # ── 繁體版：加 hreflang 與「简体」切換 ──────────────────
        zh = html.replace('<link rel="canonical"',
                          alternates(rel).lstrip("\n") + '\n  <link rel="canonical"', 1)
        zh = zh.replace("</ul>\n  </nav>",
                        "  " + lang_switch_li(up + "zh-cn/" + rel, "简体", "zh-Hans")
                        + "\n  </ul>\n  </nav>", 1)
        if "lang-switch" not in zh:      # 縮排不同的頁面用較寬鬆的比對
            zh = re.sub(r"(\n\s*)</ul>",
                        lambda m: m.group(1) + "  "
                        + lang_switch_li(up + "zh-cn/" + rel, "简体", "zh-Hans")
                        + m.group(1) + "</ul>", zh, count=1)
        src.write_text(zh, encoding="utf-8")
        n_zh += 1

        # ── 簡體版 ────────────────────────────────────────────
        cn = html
        # 語言標記
        cn = cn.replace('<html lang="zh-Hant">', '<html lang="zh-Hans">')
        cn = cn.replace('content="zh_TW"', 'content="zh_CN"')
        # canonical / og:url 指向自己的簡體網址
        cn = cn.replace(BASE + rel, BASE + "zh-cn/" + rel)
        # hreflang（與繁體版同一組）
        cn = cn.replace('<link rel="canonical"',
                        alternates(rel).lstrip("\n") + '\n  <link rel="canonical"', 1)
        # 共用資源與獨立專案都在根目錄，路徑要多退一層
        shared_re = "|".join(re.escape(s) for s in SHARED)
        cn = re.sub(r'(href|src)="((?:\.\./)*)(%s)' % shared_re,
                    lambda m: '%s="../%s%s' % (m.group(1), m.group(2), m.group(3)), cn)
        # 內嵌樣式裡的 url(images/…)（--img 首圖）也要一起退一層
        cn = re.sub(r'url\((["\']?)((?:\.\./)*)images/',
                    lambda m: 'url(%s../%simages/' % (m.group(1), m.group(2)), cn)
        # 語言切換指回繁體
        cn = cn.replace("</ul>\n  </nav>",
                        "  " + lang_switch_li("../" + up + rel, "繁體", "zh-Hant")
                        + "\n  </ul>\n  </nav>", 1)
        if "lang-switch" not in cn:
            cn = re.sub(r"(\n\s*)</ul>",
                        lambda m: m.group(1) + "  "
                        + lang_switch_li("../" + up + rel, "繁體", "zh-Hant")
                        + m.group(1) + "</ul>", cn, count=1)

        # 語系專屬的內容差異（幣別、報價）
        for old, new in OVERRIDES.get(rel, []):
            if old not in cn:
                sys.exit("OVERRIDES 對不上：%s 裡找不到「%s」。\n"
                         "繁體版改過之後，tools/build_zhcn.py 的 OVERRIDES 也要跟著改。" % (rel, old))
            cn = cn.replace(old, new)

        # 轉換文字。OpenCC 只動中日韓字元，class 名稱、網址、檔名都是 ASCII，不受影響。
        cn = CC.convert(cn)
        # 切換鈕上的「繁體」被轉成「繁体」是對的（給簡體讀者看），保留。

        dst = OUT / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(cn, encoding="utf-8")
        n_cn += 1

    (ROOT / "sitemap.xml").write_text(sitemap(rels), encoding="utf-8")
    (ROOT / "robots.txt").write_text(
        "User-agent: *\nAllow: /\n\nSitemap: %ssitemap.xml\n" % BASE, encoding="utf-8")

    print("繁體版更新（加上 hreflang 與語言切換）：%d 頁" % n_zh)
    print("簡體版產生 zh-cn/：%d 頁" % n_cn)
    print("sitemap.xml / robots.txt 已更新")


if __name__ == "__main__":
    main()
