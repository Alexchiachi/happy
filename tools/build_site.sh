#!/usr/bin/env bash
#
# 組出要發布的網站到 _site/。
#
#   tools/build_site.sh pages        給 GitHub Pages 用，內容與搬家前完全相同
#   tools/build_site.sh cloudflare   給 Cloudflare 用，額外改寫網址並放入 _redirects
#
# 這份白名單是唯一的一份：.github/workflows/pages.yml 與之後的 Cloudflare
# 部署流程都呼叫這個腳本，不要在別處另外維護一份清單。
# 新增要公開的頁面或資料夾時，加進下面的「白名單」區段。
#
# 書稿、白皮書、內部文件、工具程式一律不上網站。
#
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  pages|cloudflare) ;;
  *)
    echo "用法：tools/build_site.sh pages|cloudflare" >&2
    exit 2
    ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${OUT_DIR:-$ROOT/_site}"

# Cloudflare 模式要換成的網站根網址
CLOUDFLARE_ORIGIN="${CLOUDFLARE_ORIGIN:-https://daoissimple.com/}"

cd "$ROOT"
rm -rf "$OUT"
mkdir -p "$OUT"

# ───────────────────────── 白名單 ─────────────────────────

# 大道至簡品牌站
cp .nojekyll index.html about.html journal.html yunnan.html taiwan.html \
   services.html windy-place.html executive.html cases.html connect.html privacy.html 404.html \
   robots.txt sitemap.xml styles.css scripts.js "$OUT/"
cp -r images journal zh-cn shop anning cloudshop "$OUT/"

# 幸福餐桌專欄：只發布網頁（README 記照片來源，不上網站）
mkdir "$OUT/happytable"
cp happytable/*.html "$OUT/happytable/"

# 其他對外使用中的網頁：內耗熵值檢測、課程頁舊網址、永恆之子整椎中心預約系統
cp -r inner-flow executive-table eternitychildbooking "$OUT/"
cp inner-flow.html "$OUT/"

# ──────────────────── Cloudflare 專屬處理 ────────────────────

if [ "$MODE" = cloudflare ]; then
  python3 "$ROOT/tools/rewrite_site_urls.py" "$OUT" --origin "$CLOUDFLARE_ORIGIN"
  cp "$ROOT/_redirects" "$OUT/_redirects"
fi

echo "已組出 $MODE 模式的網站：$OUT"
