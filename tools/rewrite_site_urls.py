#!/usr/bin/env python3
"""把組好的 _site/ 裡的網址從 GitHub Pages 改寫成新網域的根路徑。

只改 _site/ 裡的副本，倉庫原始檔一律不動：這樣現在的 GitHub Pages
網站完全不受影響，切換那天也不必同步改一大批檔案。

兩條規則，都只針對網址，不碰正文：

  1. 絕對網址   https://alexchiachi.github.io/happy/…  →  https://daoissimple.com/…
  2. 屬性值路徑 href="/happy/…"（src、content、action 同理）  →  href="/…"

executive-table/ 不改：那個網站有自己的 Worker 與網址，切換是 5.9 當天的事。
"""

import argparse
import pathlib
import re
import sys

OLD_ORIGIN = 'https://alexchiachi.github.io/happy/'

# 只改寫這些副檔名；圖片與字型等二進位檔不碰
EXTENSIONS = {'.html', '.xml', '.txt', '.json', '.webmanifest', '.css', '.js'}

# 這些路徑（相對於 _site/）整個跳過
SKIP_DIRS = {'executive-table'}

# 屬性值開頭的 /happy/，單雙引號都要處理
ATTR_PATH = re.compile(r'''\b(href|src|content|action|data-src|poster)=(["'])/happy/''')


def rewrite(text: str, new_origin: str) -> str:
    text = text.replace(OLD_ORIGIN, new_origin)
    text = ATTR_PATH.sub(r'\1=\2/', text)
    return text


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('site', help='組好的 _site/ 目錄')
    ap.add_argument('--origin', required=True,
                    help='新的網站根網址，結尾要有斜線，例如 https://daoissimple.com/')
    args = ap.parse_args()

    if not args.origin.endswith('/'):
        print('--origin 結尾要有斜線', file=sys.stderr)
        return 2

    site = pathlib.Path(args.site)
    if not site.is_dir():
        print(f'找不到目錄：{site}', file=sys.stderr)
        return 2

    changed = 0
    for path in sorted(site.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
            continue
        if set(path.relative_to(site).parts) & SKIP_DIRS:
            continue

        before = path.read_text(encoding='utf-8')
        after = rewrite(before, args.origin)
        if after != before:
            path.write_text(after, encoding='utf-8')
            changed += 1

    print(f'網址改寫完成：{changed} 個檔案')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
