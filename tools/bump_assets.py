#!/usr/bin/env python3
"""
把 styles.css / scripts.js 的內容雜湊，寫進所有 HTML 的引用網址後面。

為什麼要這樣做：
瀏覽器（尤其手機）會把 CSS 和 JS 快取很久。改了樣式推上線之後，
舊訪客拿到的是「新的 HTML + 舊的 CSS」——新的 class 沒有對應規則，
版面就會壞掉，而且他們不會知道要清快取。

檔名後面加上 ?v=<內容雜湊> 之後，只要檔案內容變了，網址就變了，
瀏覽器一定會重新抓。內容沒變則網址不變，快取照常生效。

用法：改完 styles.css 或 scripts.js 之後，在專案根目錄執行

    python3 tools/bump_assets.py

然後照常 git add / commit / push。
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ("styles.css", "scripts.js")


def digest(path: pathlib.Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()[:8]


def main() -> int:
    versions = {}
    for name in ASSETS:
        f = ROOT / name
        if not f.exists():
            print(f"找不到 {name}", file=sys.stderr)
            return 1
        versions[name] = digest(f)

    changed = []
    for html in sorted(ROOT.rglob("*.html")):
        # 這些目錄不是網站頁面
        if any(p in html.parts for p in ("book", "epubqa", "whitepaper", "node_modules")):
            continue
        src = html.read_text(encoding="utf-8")
        out = src
        for name, ver in versions.items():
            # 比對 href/src 裡的檔名，可帶 ../ 前綴，可能已有舊的 ?v=
            out = re.sub(
                r'((?:href|src)=")((?:\.\./)*)' + re.escape(name) + r'(?:\?v=[0-9a-f]+)?(")',
                lambda m: f'{m.group(1)}{m.group(2)}{name}?v={ver}{m.group(3)}',
                out,
            )
        if out != src:
            html.write_text(out, encoding="utf-8")
            changed.append(html.relative_to(ROOT))

    print("版本：" + "  ".join(f"{k}?v={v}" for k, v in versions.items()))
    print(f"更新了 {len(changed)} 個 HTML 檔")
    for c in changed:
        print("   ", c)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
