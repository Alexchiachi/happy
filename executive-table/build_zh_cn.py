"""由繁體課程頁產生簡體版 executive-table/zh-cn/index.html。

    pip install opencc-python-reimplemented
    python3 executive-table/build_zh_cn.py

只轉字形（tw2s），不用詞彙轉換：tw2sp 會把「高階主管」改成「高端主管」、
「線上」改成「在线」，意思會跑掉。需要大陸用語的少數詞在 WORDS 裡逐一列出。
改稿只改繁體頁，再跑一次這支腳本。

網址一律從繁體頁的 <link rel="canonical"> 推導（見 set_site_url.py），
這支腳本不寫死任何網域。
"""
import re
from pathlib import Path
from urllib.parse import quote

from opencc import OpenCC

SITE = Path(__file__).resolve().parent
SRC = SITE / "index.html"
DST = SITE / "zh-cn" / "index.html"

# 轉字形之後才套用，所以左邊是簡體字形
WORDS = [
    ("决策品质", "决策质量"),
    ("对话品质", "对话质量"),
    ("<b>费用与试算</b>", "<b>费用与测算</b>"),
    ("<h3>试算</h3>", "<h3>测算</h3>"),
    ("垃圾信件匣", "垃圾邮件箱"),
    ("网路或伺服器", "网络或服务器"),
]


def page_rules(base):
    zh = base + "zh-cn/"
    return [
        ('<html lang="zh-Hant">', '<html lang="zh-Hans">'),
        ('content="zh_TW"', 'content="zh_CN"'),
        ('"inLanguage": "zh-Hant"', '"inLanguage": "zh-Hans"'),
        ('document.documentElement.lang || "zh-Hant"', 'document.documentElement.lang || "zh-Hans"'),
        ('<link rel="canonical" href="' + base + '">', '<link rel="canonical" href="' + zh + '">'),
        ('<meta property="og:url" content="' + base + '">', '<meta property="og:url" content="' + zh + '">'),
        ('"url": "' + base + '"', '"url": "' + zh + '"'),
        (quote(base, safe=""), quote(zh, safe="")),
        # 簡體頁在下一層目錄
        ('"images/', '"../images/'),
        ('"downloads/', '"../downloads/'),
        ('<a class="nav-link lang" href="zh-cn/" hreflang="zh-Hans" lang="zh-Hans">简体</a>',
         '<a class="nav-link lang" href="../" hreflang="zh-Hant" lang="zh-Hant">繁體</a>'),
        ('<a href="zh-cn/" hreflang="zh-Hans" lang="zh-Hans">简体中文版</a>',
         '<a href="../" hreflang="zh-Hant" lang="zh-Hant">繁體中文版</a>'),
    ]


def main():
    src = SRC.read_text(encoding="utf-8")
    m = re.search(r'<link rel="canonical" href="([^"]+)">', src)
    if not m:
        raise SystemExit("繁體頁缺少 canonical，無法推導網址")
    base = m.group(1)
    html = OpenCC("tw2s").convert(src)
    for old, new in WORDS + page_rules(base):
        if old not in html:
            raise SystemExit("找不到要替換的字串，繁體頁可能改過：" + old)
        html = html.replace(old, new)
    # 大陸慣用彎引號
    html = html.replace("「", "“").replace("」", "”")
    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_text(html, encoding="utf-8")
    print("wrote", DST.relative_to(SITE.parent))


if __name__ == "__main__":
    main()
