# 給 AI 的說明

- 一律用繁體中文回答使用者。
- 「幸福餐桌｜高階主管三階段課程」網站（`executive-table/`，部署在 Cloudflare Workers）的完整交接說明在
  [`executive-table/CLAUDE.md`](executive-table/CLAUDE.md)，處理這個網站前先讀它。
- 品牌站的視覺規範（色票、字體、元件、語氣、該做與不該做）在 [`DESIGN.md`](DESIGN.md)，做新頁面或改樣式前先讀它。
- 雲南好物選購頁（`shop/`）的素材流程與架構在 [`shop/README.md`](shop/README.md)。
- 雲南安寧幸福之家說明與預約頁（`anning/`）在 [`anning/README.md`](anning/README.md)。
- LINE 官方帳號**刻意分成兩個**，不要統一：品牌站（`connect.html`）用 `@473nnjul`；
  雲南好物與安寧幸福之家（`shop/`、`anning/`、確認信）用 `@617aipgs`。

## 專案技能（`.claude/skills/`，來源記在 `skills-lock.json`）

**優先順序：`DESIGN.md` ＞ 各技能的通用建議。** 通用技能常建議圓角、陰影、粗體標題、大膽配色、React 寫法，
跟大道至簡相衝時一律照 `DESIGN.md`。更新技能用 `npx skills update -p`，不要手改技能檔。

| 要做的事 | 用哪個技能 | 用在大道至簡時要注意 |
| --- | --- | --- |
| 視覺方向、改版 | `frontend-design`、`redesign-existing-projects`、`apple-design`、`visual-audit` | 只取「克制、留白、層級」的部分；外觀照 `DESIGN.md` |
| 無障礙 | `accessibility` | 全站已有 skip-link、對比註解、`prefers-*`；改色先算對比 |
| 速度 | `performance`、`core-web-vitals` | 瓶頸多半是 Noto Serif TC（中文字檔大）與照片。`shop/`、`anning/` 已改用子集字型（`tools/subset_fonts.py`）與 AVIF／WebP（`tools/make_web_images.py`）；沙盒連不到 Google Fonts，本機 Lighthouse 會低估字型成本，測試時讓 Chromium 走 `$HTTPS_PROXY` |
| 搜尋 | `seo` | hreflang、sitemap 由 `tools/build_zhcn.py` 產生，不要手改；`shop/`、`anning/` 刻意 `noindex` |
| 安全與相容 | `best-practices` | 若加 CSP，要放行 Google Fonts 與 Cloudflare Web Analytics |
| 上線前總檢查 | `web-quality-audit` | 附唯讀腳本 `scripts/analyze.sh`（需要 `jq`） |
| 後端（Worker） | `workers-best-practices`、`wrangler` | Worker 在 `executive-table/worker/`，先讀 `executive-table/CLAUDE.md` |
| 表單、預約、訂單的輸入安全 | `security-and-hardening` | 對應 `orders.js`、`stays.js`、`letters.js`：驗證、限流、不信任前端金額 |

沒有收：React／Next.js／Vercel 部署類技能（本站是純 HTML＋CSS＋原生 JS、部署在 GitHub Pages 與 Cloudflare）。

## 兩個倉庫（2026-09 起）

| 倉庫 | 公開？ | 放什麼 |
| --- | --- | --- |
| `Alexchiachi/happy` | 公開 | 所有對外網頁：大道至簡品牌站、`shop/`、`anning/`、`inner-flow/`、`eternitychildbooking/`（永恆之子整椎中心預約系統，仍在收預約）、`executive-table/`（含 Worker，Cloudflare 從這裡自動部署）、網站工具 |
| `Alexchiachi/happychiachi` | **私人** | 電子書書稿（`book/`）、天麻白皮書、天麻計畫 README、`docs/` 內部文件、`epubqa/` 與測試、「幸福生活哲學」寫作技能，以及 2026-09 以前的完整歷史 |

- `happy` 是 2026-09-24 用全新歷史重建的；舊歷史只在 `happychiachi`。**不要把私人倉庫的檔案或歷史推進 `happy`。**
- 書稿、白皮書、內部文件一律放 `happychiachi`，不要放進 `happy`。
- GitHub Pages 用白名單發布（`.github/workflows/pages.yml`），新增對外頁面時要加進清單。
