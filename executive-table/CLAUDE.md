# 給 AI 的交接說明：幸福餐桌｜高階主管三階段課程網站

新 session 請先讀完這份，再動手。README.md 是給人看的操作手冊，這份是給 AI 的脈絡：
這個網站怎麼來的、為什麼長這樣、哪些決定已經定案、改東西時要守的規矩。

## 1. 一句話

簡家旗的一人公司「幸福餐桌」的課程銷售頁＋極簡後台。
靜態 HTML 放在 GitHub（`alexchiachi/happy` 的 `executive-table/`），由 Cloudflare Workers 從 GitHub 自動部署；
表單、寄信、照片、管理頁全部在同一支 Worker 裡，沒有其他服務。
這支 Worker 也負責收**大道至簡品牌站**（倉庫根目錄的 `connect.html`，GitHub Pages）的「連繫」來信，
以及品牌站**雲南好物選購頁**（`shop/`）的訂單。

- 正式網址：https://executive-table.jianchiachi.workers.dev/ （簡體：`/zh-cn/`，管理頁：`/admin`）
- 舊網址仍在：https://alexchiachi.github.io/happy/executive-table/ （GitHub Pages 白名單發布，表單一樣送到 Worker）
- 內容來源：Claude Docs 文件「幸福餐桌｜高階主管三階段課程提案」（doc id `149f1b93-aa2e-4995-b4c3-f859411bee82`）。
  網頁改用字時，使用者常會要求原始文件也同步改。

## 2. 使用者與溝通方式

- 使用者：簡家旗（jianchiachi@gmail.com，GitHub `Alexchiachi`）。一人公司，不是工程師，會自己在 Cloudflare 後台貼設定。
- **一律用繁體中文回答。**
- 要「最簡單的方式」：能不用第二個服務就不用，能不用付費就不用。步驟要一步一步、寫出在哪個畫面按哪個鈕。
- 通常直接說「改成 X」。照做後，把**同一個詞出現的其他地方列出來問要不要一起改**，不要自作主張全換
  （例：「田裡的餐桌」→「幸福餐桌」時，組織名「稻田裡的餐桌」必須保留，見第 6 節）。
- 使用者看得到正式網址，我們（雲端容器）連不到 `*.workers.dev`，所以上線後的實測請使用者做。

## 3. 品牌與用字（已定案，不要再改回）

| 項目 | 定案寫法 |
| --- | --- |
| 地點 | **南投**（不寫「南投水里」；書稿裡的水里是使用者選擇保留，不動） |
| 學歷 | **台大工管**背景（不是財金） |
| 角色 | 2012 年**共同發起**「稻田裡的餐桌」計畫，如今**進化為「幸福餐桌」**；信件署名「幸福餐桌 主理人 · 南投」 |
| 場次 | 統一「**超過 200 場**」「200+ 場幸福餐桌」（不再用「田間餐桌」） |
| 認證 | 2017 年**亞洲第一家通過 SVI SROI 認證的農業社會企業**（認證對象是「稻田裡的餐桌」，這句保留舊名）；每投入 NT$1 創造 NT$4.4 社會價值（2013–2016） |
| 幻燈片標題 | 「幸福餐桌」／副標「十四年來，超過 200 場幸福餐桌的片刻。」 |
| 價格 | 線上一小時每人 NT$15,000（可全額折抵）；小班每人 NT$380,000；包班 NT$3,000,000 |
| 首期日期 | 待定（頁面寫「首期工作坊日期與報名截止日待定」） |
| 刻意保留舊名的地方 | 網頁頁尾「幸福餐桌，稻田裡的餐桌，南投」；JSON-LD provider name；肖像 alt「稻田裡的餐桌共同發起人」；2017 認證句、SROI 報告句、「2012 共同發起稻田裡的餐桌」數字欄 |
| 聯絡 | LINE `@473nnjul`、Facebook `dream2walker`（仿使用者另一個倉庫 Dao 的做法） |

## 4. 演進過程（為什麼會是現在這個架構）

1. **單頁網頁**：從 Claude Docs 提案文件做成一頁式課程頁，推上 GitHub Pages。
2. **表單 → Google 試算表**：先用 Apps Script 收資料、寄 HTML 信。**已淘汰**（舊試算表請使用者自行刪除）。
3. **多輪設計**：apple-design → 極簡 → GitHub 上找的 frontend-design 等技能（在 `.claude/skills/`）。
   結果：米色紙感、襯線字、大量留白、手機漢堡選單、底部 dock、hero 的長桌 SVG（小班／包班切換）。
4. **SEO 與可發現性**：canonical、OG 分享圖、JSON-LD（Course＋FAQ）、sitemap、robots、簡體版（hreflang）、
   `track()` 事件鉤子（GA4／Plausible 代碼已預留在 `<head>` 註解中，尚未啟用）。
5. **信任內容**：主持人段落搬到價格之前；加 SROI 報告 PDF（`downloads/`，從使用者 Google Drive 下載）。
6. **搬到 Cloudflare Workers**（使用者的 DNS 本來就在 Cloudflare）：GitHub 管程式碼，Cloudflare 從 GitHub 自動部署；
   先用免費的 `workers.dev` 網址，之後可換自有網域（`set_site_url.py`）。
7. **表單改由 Cloudflare 自己收**：D1 資料庫＋管理頁，取代 Google 試算表。
8. **寄信**：先做 Resend，但使用者要寄件人是自己的 Gmail —— Resend 做不到（要驗證網域、DMARC 會擋 gmail.com）。
   改成 **Worker 直接用 Gmail SMTP（應用程式密碼）寄信**，寄件人就是 jianchiachi@gmail.com，免第三方。
   使用者已實測通知信與確認信都正常。Resend 程式碼保留為選用備案。
9. **管理頁登入**：先做 Cloudflare Access，對一人公司太複雜，改成 **Basic Auth + `ADMIN_PASSWORD`**；Access 保留為選用。
10. **幻燈片**：照片由使用者在 `/admin` 上傳（瀏覽器先縮成 1600px WebP），存 D1（不開 R2），邊緣快取一年。
    之後要求「一定要自動播放」：移除滑鼠移入／聚焦暫停（手機點一下會永久停住）、減少動態效果時也輪播，另加暫停鍵。
11. **用字更新**：「田裡的餐桌／田間餐桌」全面改為「幸福餐桌」，信件署名改「主理人」（見第 3 節）。
12. **品牌站連繫表單搬進同一支 Worker**：取代 Google Apps Script。新增 `/api/letter`、D1 `letters` 表、
    管理頁「大道至簡來信」分頁；通知寄 dadaoissimple@gmail.com，並寄繁／簡收信確認給對方。
    （預約系統 `eternitychildbooking/` 是替別人做的，使用者決定**不**搬。）
13. **倉庫拆成公開／私人**（2026-09-24）：`happy` 以全新歷史重建、只放對外網頁；書稿、白皮書、內部文件與舊歷史在私人的
    `happychiachi`（見根目錄 `CLAUDE.md`）。GitHub Pages 改白名單發布。Cloudflare 自動部署改接新的 `happy`。
14. **雲南好物訂單**：`/api/order`、D1 `orders` 表、管理頁「雲南訂單」分頁。商品與運費在 `shop/products.json`，
    Worker 直接 import 這份 JSON 重算金額（客人只送商品 id／規格／數量）。新訂單通知寄給 jianchiachi@gmail.com 與
    renachien1@gmail.com（`SHOP_NOTIFY_EMAIL`），客人收到訂單確認＋付款資訊。付款仍是 LINE Pay／匯款＋後台手動改狀態。
    之後加上：送禮（收件人、卡片、不附價格明細）、後台填物流與追蹤號碼、改「已付款」「已出貨」時寄信通知客人。
    `orders` 表後加的欄位在 `ensureOrderSchema` 裡用 `ALTER TABLE ... ADD COLUMN` 補（重複欄位的錯誤略過）。

思考原則（一人公司）：**少一個服務就少一個會壞、要付費、要記密碼的地方**。
資料、照片、寄信、登入都收在一支 Worker＋一個 D1；所有秘密只放在 Cloudflare 後台；使用者只需要會用 `/admin`。

## 5. 架構

```
瀏覽器 ──> Cloudflare Worker "executive-table"（倉庫根目錄 wrangler.jsonc）
            ├─ 靜態檔：executive-table/（排除 .assetsignore 列的檔案）
            └─ run_worker_first：/api/*、/admin、/admin/*、/photos/* → executive-table/worker/index.js
                 ├─ POST /api/inquiry     存 D1 inquiries → Gmail SMTP 寄 2 封 HTML 信（通知主理人、確認給預約者）
                 ├─ POST /api/letter      大道至簡品牌站來信 → D1 letters → 通知 dadaoissimple@gmail.com＋收信確認
                 ├─ POST /api/order       雲南好物訂單 → 依 shop/products.json 重算 → D1 orders → 通知 SHOP_NOTIFY_EMAIL＋訂單確認
                 ├─ GET  /api/photos      公開照片清單；GET /photos/<id>-<ver>.<ext> 照片本身
                 ├─ GET  /admin           管理頁（分頁：幸福餐桌預約／大道至簡來信／雲南訂單／幻燈片照片）
                 └─ /api/admin/*          管理 API（Basic Auth；照片寫入另檢查同源）
            D1：executive-table-inquiries（表 inquiries、letters、orders、photos，程式自動建表）
```

| 檔案 | 內容 |
| --- | --- |
| `index.html` | **唯一手改的頁面**（HTML＋CSS＋JS 全在一檔，無框架、無建置）。`INQUIRY_ENDPOINT` 指向 Worker |
| `zh-cn/index.html` | `python3 executive-table/build_zh_cn.py` 產生（OpenCC tw2s＋手動詞彙修正），**不要手改** |
| `worker/index.js` | 路由、表單驗證、限流（10 分鐘 5 次，IP 只存雜湊）、CORS、管理登入、CSV |
| `worker/letters.js` | 品牌站來信：收信、兩封信的模板（繁／簡）、管理 API、CSV |
| `worker/orders.js` | 雲南好物訂單：`import` 根目錄 `shop/products.json` 重算金額、截止日檢查、同檔同電話標記、信件模板、管理 API、CSV |
| `worker/mail.js`、`worker/util.js` | 共用：寄信（Gmail 優先，選用 Resend；可指定另一組 Gmail）、IP 雜湊、時間格式、JSON 回應 |
| `worker/smtp.js` | `cloudflare:sockets` 連 `smtp.gmail.com:465`，AUTH PLAIN、RFC 2047、dot-stuffing |
| `worker/emails.js` | 兩封信的 HTML／純文字模板（署名、頁尾在這裡） |
| `worker/photos.js` | 照片 D1 存取、magic bytes 檢查、快取 |
| `worker/admin.js` | 管理頁 HTML（分頁：預約／來信／雲南訂單／幻燈片照片） |
| `worker/access.js` | 選用的 Cloudflare Access JWT 驗證 |
| `_headers`、`404.html`、`robots.txt`、`sitemap.xml` | 快取與安全標頭、錯誤頁、SEO |
| `set_site_url.py` | 換正式網址（全站絕對網址＋重建簡體版） |

Cloudflare 後台的 Secrets（使用者已設好，**不要寫進倉庫**）：`NOTIFY_EMAIL`、`GMAIL_APP_PASSWORD`、`ADMIN_PASSWORD`。
選用：`RESEND_API_KEY`、`ACCESS_TEAM_DOMAIN`、`ACCESS_AUD`、`LETTER_GMAIL_APP_PASSWORD`（讓來信相關的信改由 dadaoissimple@gmail.com 寄出）。
`wrangler.jsonc` vars：`MAIL_FROM_NAME`、`MAIL_FROM`、`ALLOWED_ORIGINS`、`LETTER_NOTIFY_EMAIL`、`LETTER_FROM_NAME`、`BRAND_SITE_URL`、
`SHOP_NOTIFY_EMAIL`（逗號分隔，每個信箱各寄一封）、`SHOP_FROM_NAME`。`wrangler.jsonc` 有 `keep_vars: true`。

## 6. 改東西的固定流程

1. 開發分支：依 session 指定的分支；先 `git fetch origin main && git checkout -B <分支> origin/main`。
2. 只改 `index.html`；改完一定跑 `python3 executive-table/build_zh_cn.py`
   （需要 `pip install opencc-python-reimplemented`）。改 Worker 後跑 `node --check`。
3. **文字替換用精準字串，不要全域取代。** 典型陷阱：「田裡的餐桌」包含在「稻田裡的餐桌」裡。
   替換前 `grep -n` 看所有出現處，替換後再 grep 一次確認。
4. 驗證：
   - 版面／互動：Playwright（Chromium 在 `/opt/pw-browsers/chromium`，`NODE_PATH=$(npm root -g)`）。
     攔截 `**/*`，把頁面掛在假 https 網域上提供本機檔案，並假造 `/api/photos` 等回應；需要計時的用 `page.clock`。
   - Worker：`npx wrangler dev --local --var SMTP_HOST:127.0.0.1 --var SMTP_PORT:2525 --var SMTP_SECURE:off --var GMAIL_APP_PASSWORD:x --var NOTIFY_EMAIL:x@example.com --var ADMIN_PASSWORD:<12字以上>`，
     本機起一個假 SMTP 伺服器（asyncio 寫幾十行即可）接信；`--persist-to` 指到暫存目錄，測完刪掉 `.wrangler/`。
     `npx wrangler deploy --dry-run --outdir <暫存>` 可確認打包（含 `shop/products.json`）成功。
   - 容器連不到 `workers.dev`，正式站請使用者實測。
5. commit（訊息用繁體中文，加 session 要求的署名行）→ push → 用 GitHub MCP 開 PR → squash 合併
   → 把分支重設到新的 `origin/main`。使用者習慣直接合併，Cloudflare 合併後一兩分鐘自動上線（PR 也會有預覽網址）。
6. 回覆使用者：改了什麼、哪些同名處刻意沒改（問要不要改）、請他上線後確認哪裡。

## 7. 其他注意

- **品牌站（倉庫根目錄）有自己的建置工具**：改 `scripts.js`／`styles.css` 後跑 `python3 tools/bump_assets.py`（更新 `?v=` 快取雜湊），
  改繁體頁後跑 `python3 tools/build_zhcn.py`（重建根目錄 `zh-cn/`）。這支腳本已設定略過 `executive-table/`，
  並保留 `zh-cn/executive-table/index.html`（課程頁舊簡體網址的轉址殼），不要移除這兩個設定。
- 新增到 `executive-table/` 的維護用檔案（像這份 `CLAUDE.md`）要加進 `.assetsignore`，否則會被公開發布。
- **Cloudflare 自動部署是用倉庫的內部 ID 綁定的，不是名字。** 2026-09-24 倉庫改名重建後，Cloudflare 畫面仍顯示
  `Alexchiachi/happy`，實際卻綁著舊倉庫（已改名 `happychiachi`），合併 PR 都沒有觸發部署，線上 Worker 停在舊版
  （症狀：`/admin` 沒有新分頁、品牌站送出訂單顯示連不上）。Build 設定頁會出現紅字
  「Error fetching GitHub User or Organization details」。解法：Settings → Build → Disconnect，再 Connect 到新的
  `Alexchiachi/happy`（分支 `main`、Deploy command `npx wrangler deploy`、Root directory `/`），之後推一次 `main` 觸發部署。
  合併後若 GitHub 上完全沒有 Cloudflare 的 check／預覽網址，先懷疑這個。
  重新連接後仍未觸發，因此改由 **GitHub Actions 部署 Worker**（`.github/workflows/worker.yml`，`npx wrangler@4 deploy`，
  需要 GitHub Secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`）。部署紀錄在 GitHub Actions，可用 GitHub MCP 讀 log、
  用 workflow_dispatch 手動重跑。D1 綁定只寫 `database_name`：wrangler 會沿用線上 Worker 既有的綁定或依名稱找到現有資料庫，
  Token 需含 D1 權限。
- 表單下方的隱私說明寫「沒有安裝分析或追蹤工具」；啟用 GA4／Plausible 時要一起改那句。
- 幻燈片沒有顯示中的照片時整段隱藏；照片只能由 `/admin` 上傳，不要把照片檔放進倉庫。
- claude.ai 上還有一份早期的 Artifact 副本（https://claude.ai/artifact/14em5ks6rCrSvoxhVLupyh），正式站以 Cloudflare 為準。
- 待使用者自行處理：SROI 報告裡內嵌的 Drive 連結權限收緊、刪除舊 Google 試算表。
- 之後可能的方向：換自有網域（如 `table.daoissimple.com`，DNS 已在 Cloudflare）、啟用流量統計、公布首期日期。
