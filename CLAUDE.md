# 給 AI 的說明

- 一律用繁體中文回答使用者。
- 「幸福餐桌｜高階主管三階段課程」網站（`executive-table/`，部署在 Cloudflare Workers）的完整交接說明在
  [`executive-table/CLAUDE.md`](executive-table/CLAUDE.md)，處理這個網站前先讀它。
- 雲南好物選購頁（`shop/`）的素材流程與架構在 [`shop/README.md`](shop/README.md)。
- 雲南安寧幸福之家說明與預約頁（`anning/`）在 [`anning/README.md`](anning/README.md)。

## 兩個倉庫（2026-09 起）

| 倉庫 | 公開？ | 放什麼 |
| --- | --- | --- |
| `Alexchiachi/happy` | 公開 | 所有對外網頁：大道至簡品牌站、`shop/`、`anning/`、`inner-flow/`、`eternitychildbooking/`（永恆之子整椎中心預約系統，仍在收預約）、`executive-table/`（含 Worker，Cloudflare 從這裡自動部署）、網站工具 |
| `Alexchiachi/happychiachi` | **私人** | 電子書書稿（`book/`）、天麻白皮書、天麻計畫 README、`docs/` 內部文件、`epubqa/` 與測試、「幸福生活哲學」寫作技能，以及 2026-09 以前的完整歷史 |

- `happy` 是 2026-09-24 用全新歷史重建的；舊歷史只在 `happychiachi`。**不要把私人倉庫的檔案或歷史推進 `happy`。**
- 書稿、白皮書、內部文件一律放 `happychiachi`，不要放進 `happy`。
- GitHub Pages 用白名單發布（`.github/workflows/pages.yml`），新增對外頁面時要加進清單。
