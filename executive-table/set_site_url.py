"""把課程網站的正式網址一次換掉。

    python3 executive-table/set_site_url.py https://executive-table.你的子網域.workers.dev/

分享預覽、canonical、hreflang、結構化資料、sitemap、robots 與表單送出網址
都需要絕對網址（信件裡的連結由 Worker 依實際網址產生，不需要改）。它們全部以同一個基準網址開頭，目前的基準網址
取自 index.html 的 <link rel="canonical">，這支腳本把它換成新的，並重新產生
簡體版。
"""
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote
import re

SITE = Path(__file__).resolve().parent
FILES = [
    SITE / "index.html",
    SITE / "404.html",
    SITE / "robots.txt",
    SITE / "sitemap.xml",
]


def main():
    if len(sys.argv) != 2 or not sys.argv[1].startswith("https://"):
        raise SystemExit("用法：python3 executive-table/set_site_url.py https://新網址/")
    new = sys.argv[1].rstrip("/") + "/"
    m = re.search(r'<link rel="canonical" href="([^"]+)">', (SITE / "index.html").read_text(encoding="utf-8"))
    old = m.group(1)
    if old == new:
        print("網址已經是", new)
        return
    for f in FILES:
        text = f.read_text(encoding="utf-8")
        updated = text.replace(old, new).replace(quote(old, safe=""), quote(new, safe=""))
        if updated != text:
            f.write_text(updated, encoding="utf-8")
            print("updated", f.relative_to(SITE.parent))
    subprocess.run([sys.executable, str(SITE / "build_zh_cn.py")], check=True)
    print(old, "->", new)


if __name__ == "__main__":
    main()
