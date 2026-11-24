#!/usr/bin/env python3
"""把組好的 _site/ 裡的網址從 GitHub Pages 改寫成新網域的根路徑。

只改 _site/ 裡的副本，倉庫原始檔一律不動：這樣現在的 GitHub Pages
網站完全不受影響，切換那天也不必同步改一大批檔案。

三組規則，都只針對網址：

  1. 網域與子路徑  alexchiachi.github.io/happy/…  →  daoissimple.com/…
     （連同 https:// 前綴的與純文字顯示的網址一起換掉）

  2. 屬性值路徑    href="/happy/…"（src、content、action 同理）  →  href="/…"

  3. 去掉 .html    站內連結、canonical、hreflang、og:url、sitemap 的網址
     a.html → a      ；  x/index.html → x/  ；  index.html → ./
     這樣就不會每次點擊都被 html_handling 的 auto-trailing-slash 多轉一次。

executive-table/ 不改：那個網站有自己的 Worker 與網址，切換是 5.9 當天的事。
"""

import argparse
import pathlib
import re
import sys

OLD_HOST_PATH = 'alexchiachi.github.io/happy/'

# 只改寫這些副檔名；圖片與字型等二進位檔不碰
EXTENSIONS = {'.html', '.xml', '.txt', '.json', '.webmanifest', '.css', '.js'}

# 這些路徑（相對於 _site/）整個跳過
SKIP_DIRS = {'executive-table'}

# 屬性值開頭的 /happy/，單雙引號都要處理
ATTR_PATH = re.compile(r'''\b(href|src|content|action|data-src|poster)=(["'])/happy/''')

# href/src/content 的屬性值
ATTR_VALUE = re.compile(r'''\b(href|src|content)=(["'])([^"']*)\2''')

# 不是站內路徑的值
NON_LOCAL = re.compile(r'^(?:[a-z][a-z0-9+.-]*:|//|#)', re.I)


def drop_html(target: str, origin_host: str) -> str:
    """把一個連結目標去掉 .html。保留 ?query 與 #fragment。"""
    # 切出 path 與後綴
    m = re.match(r'^([^?#]*)([?#].*)?$', target, re.S)
    path, rest = m.group(1), m.group(2) or ''
    if not path.endswith('.html'):
        return target

    if path.endswith('index.html'):
        path = path[: -len('index.html')]
        if path == '':
            # 單獨的 index.html：用 ./ 指回同一層
            path = './'
    else:
        path = path[: -len('.html')]
    return path + rest


def rewrite(text: str, new_origin: str, origin_host: str) -> str:
    # ── 規則 1：網域與子路徑 ──
    text = text.replace(OLD_HOST_PATH, new_origin.split('//', 1)[-1])

    # ── 規則 2：屬性值開頭的 /happy/ ──
    text = ATTR_PATH.sub(r'\1=\2/', text)

    # ── 規則 3a：絕對網址去掉 .html（canonical、og:url、hreflang、sitemap、JSON-LD）──
    abs_url = re.compile(r'(https?://' + re.escape(origin_host) + r'/)([^\s"\'<>]*\.html)')

    def _abs(m: 're.Match[str]') -> str:
        tail = drop_html(m.group(2), origin_host)
        return m.group(1) + ('' if tail == './' else tail)

    text = abs_url.sub(_abs, text)

    # ── 規則 3b：站內相對／根絕對連結去掉 .html ──
    def _attr(m: 're.Match[str]') -> str:
        name, quote, value = m.group(1), m.group(2), m.group(3)
        if NON_LOCAL.match(value) or not value:
            return m.group(0)
        return f'{name}={quote}{drop_html(value, origin_host)}{quote}'

    text = ATTR_VALUE.sub(_attr, text)
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

    origin_host = args.origin.split('//', 1)[-1].rstrip('/')

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
        after = rewrite(before, args.origin, origin_host)
        if after != before:
            path.write_text(after, encoding='utf-8')
            changed += 1

    print(f'網址改寫完成：{changed} 個檔案')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
