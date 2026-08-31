#!/usr/bin/env bash
# 重新編譯 inner-flow.html 內嵌的 Tailwind CSS。
#
# 只要改動了 inner-flow.html 裡的 Tailwind class（或下方的主題設定），
# 就跑一次這支腳本，它會重新掃描檔案、編譯出最小化的 CSS，
# 並寫回 <style id="tailwind-build"> 區塊。需要 Node.js（npx）。
#
#   ./tools/build-inner-flow-css.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAGE="$ROOT/inner-flow.html"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 主題設定需與頁面設計一致：米白 / 炭黑 / 風土暖棕 / 鼠尾草綠
cat > "$WORK/tailwind.config.js" <<EOF
module.exports = {
  content: ['$PAGE'],
  theme: {
    extend: {
      colors: { paper: '#F7F5F0', ink: '#2A2723', clay: '#A67C52', sage: '#7A8B7B' },
      fontFamily: {
        serif: ['"Noto Serif TC"', 'Songti TC', 'serif'],
        sans: ['"Noto Sans TC"', 'system-ui', 'sans-serif'],
      },
    },
  },
};
EOF

printf '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n' > "$WORK/in.css"
npx --yes tailwindcss@3.4.16 -c "$WORK/tailwind.config.js" -i "$WORK/in.css" -o "$WORK/out.css" --minify

python3 - "$PAGE" "$WORK/out.css" <<'PY'
import re, sys
page, css = sys.argv[1], sys.argv[2]
html = open(page, encoding='utf-8').read()
built = open(css, encoding='utf-8').read().strip()
pattern = re.compile(r'(<style id="tailwind-build">).*?(</style>)', re.S)
if not pattern.search(html):
    sys.exit('找不到 <style id="tailwind-build"> 區塊')
open(page, 'w', encoding='utf-8').write(pattern.sub(lambda m: m.group(1) + built + m.group(2), html, count=1))
print('已更新 %s（CSS %d bytes）' % (page, len(built)))
PY
