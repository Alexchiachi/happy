# 幸福餐桌｜高階主管三階段課程

網站：https://executive-table.jianchiachi.workers.dev/

程式碼放在 GitHub（本資料夾），由 Cloudflare Workers 從 GitHub 自動部署。
同一份檔案也會繼續出現在 GitHub Pages 的 `https://alexchiachi.github.io/happy/executive-table/`。

## 資料夾內容

| 檔案 | 用途 | 會發布到網站 |
| --- | --- | --- |
| `index.html` | 繁體中文課程頁（唯一需要手動編輯的頁面） | 是 |
| `zh-cn/index.html` | 簡體版，由 `build_zh_cn.py` 產生，不要手改 | 是 |
| `images/` | 肖像（WebP＋JPEG）、分享預覽圖、網站圖示 | 是 |
| `downloads/sroi-report-2013-2016.pdf` | SROI 報告（英文，2.3 MB） | 是 |
| `404.html`、`robots.txt`、`sitemap.xml` | 找不到頁面、搜尋引擎設定 | 是 |
| `_headers` | Cloudflare 的快取與安全標頭 | 否（Cloudflare 讀取後套用） |
| `worker/` | 預約表單、大道至簡來信（都存進 D1、用 Gmail 寄 HTML 信）、幻燈片照片、管理頁 | 否（部署為 Worker 程式） |
| `build_zh_cn.py` | 由繁體頁產生簡體頁 | 否 |
| `set_site_url.py` | 一次更換網站正式網址 | 否 |
| `.assetsignore` | 列出不發布的檔案 | 否 |
| `CLAUDE.md` | 給 AI 的交接說明 | 否 |

部署設定在倉庫根目錄的 `wrangler.jsonc`：靜態檔案直接由 Cloudflare 提供，只有 `/api/*`、`/admin`
與 `/photos/*` 會進到 `worker/` 的程式。找不到的網址顯示 `404.html`。

## 預約表單怎麼運作

```
訪客送出表單 → POST /api/inquiry → 存進 D1 資料庫
                                 → 用你的 Gmail 寄出兩封 HTML 信：
                                    ・新預約通知 → 你的 Gmail（回覆鍵直接回給預約者）
                                    ・收件確認   → 預約者（對方回信會回到你的 Gmail）
你 → /admin（輸入管理頁密碼）→ 看清單、改處理狀態、匯出 CSV
```

- 有防機器人欄位、欄位檢查，同一個來源 10 分鐘內最多送 5 次。
- 不保存訪客 IP，只存無法還原的雜湊值。
- 寄信失敗不影響資料寫入；管理頁每筆都會標示寄信結果。

## 大道至簡品牌站的來信

品牌站（`https://alexchiachi.github.io/happy/connect.html`，繁簡兩版）的「連繫」表單也送到這支 Worker，
取代原本的 Google Apps Script：

```
訪客寫信 → POST /api/letter → 存進 D1（letters 表）
                            → 通知信 → dadaoissimple@gmail.com（回覆鍵直接回給寫信的人）
                            → 收信確認 → 寫信的人（簡體頁送出的收到簡體信；對方回信會回到 dadaoissimple@gmail.com）
你 → /admin →「大道至簡來信」分頁：看內容、改狀態（新進／已回覆／已結案）、匯出 CSV
```

- 通知信箱、寄件人名稱、確認信裡的網站連結在 `wrangler.jsonc` 的 `LETTER_NOTIFY_EMAIL`、`LETTER_FROM_NAME`、`BRAND_SITE_URL`。
- 預設用上面那組 Gmail（`GMAIL_APP_PASSWORD`）寄出，寄件人名稱是「大道至簡 · Dao is simple」。
  想讓信直接從 dadaoissimple@gmail.com 寄出：用那個帳號照下方步驟建立應用程式密碼，存成 Secret `LETTER_GMAIL_APP_PASSWORD`。
- 一樣有防機器人欄位、同一來源 10 分鐘內最多 5 封、只存 IP 雜湊。

## 幻燈片照片「幸福餐桌」

課程頁「為什麼需要、適合誰」與「三個階段」之間有一段幻燈片，照片由管理頁上傳，不用改程式：

1. 打開 `/admin`，輸入管理頁密碼，切到「**幻燈片照片**」分頁。
2. 把照片拖進虛線框（或點它選擇），可一次多張。手機、相機原檔都可以，瀏覽器會先縮成
   最長邊 1600px 的 WebP（每張約 200–400 KB）再上傳。iPhone 的 HEIC 若讀不到，先轉成 JPG。
3. 每張寫一句說明（例如「南投・秋天的長桌」），離開欄位就會存。
4. 用 ↑ ↓ 調整順序；勾掉「顯示」就從網頁撤下（照片保留）；「刪除」會永久刪掉。

- 照片存在 D1（和預約資料同一個資料庫），不需要另外開 R2；網頁上的照片由 Cloudflare 邊緣快取一年。
- 沒有任何顯示中的照片時，這一段整個不會出現。
- 播放：捲到這一段就自動輪播，每張約 6 秒淡入淡出、極輕微推近；手機可左右滑，換張後繼續播放；
  右下角暫停鍵可停下／繼續。系統開啟「減少動態效果」時照樣輪播，只是不推近。

## 工作流程

```
在分支上修改 → 開 PR → Cloudflare 自動產生預覽網址 → 合併到 main → 自動發布正式網址
```

改內容時：

1. 只改 `index.html`（繁體）。
2. 執行 `python3 executive-table/build_zh_cn.py` 重新產生簡體版
   （第一次需先 `pip install opencc-python-reimplemented`）。
3. 開 PR，在 Cloudflare 的預覽網址確認，再合併。

## 第一次在 Cloudflare 建立專案

1. 登入 Cloudflare → **Workers & Pages** → **Create** → **Import a repository**。
2. 連接 GitHub，選 `Alexchiachi/happy`。
3. 設定：
   - Project name：`executive-table`（要和 `wrangler.jsonc` 的 `name` 相同）
   - 預約資料庫（D1）會在第一次部署時依 `wrangler.jsonc` 自動建立，不用手動建。
     若部署紀錄出現要求 `database_id` 的錯誤，到 **Storage & Databases → D1** 建立
     `executive-table-inquiries`，把它的 ID 填進 `wrangler.jsonc` 的 `d1_databases` 再推一次。
   - Build command：留空
   - Deploy command：`npx wrangler deploy`
   - Non-production branch deploy command：`npx wrangler versions upload`（每個 PR 產生預覽網址）
   - Root directory：留空（倉庫根目錄）
   - Production branch：`main`
4. 部署完成後，Cloudflare 會給一個網址，格式是
   `https://executive-table.<你的帳號子網域>.workers.dev/`。

## 設定寄信與管理頁（第一次部署後做一次，約 5 分鐘）

在 Cloudflare → **Workers & Pages** → `executive-table` → **Settings → Variables and Secrets**
新增以下三個 **Secret**（存檔後立即生效，不用重新部署）：

| 名稱 | 值 |
| --- | --- |
| `NOTIFY_EMAIL` | 你的 Gmail，例如 `jianchiachi@gmail.com`（收通知，也是寄件人） |
| `GMAIL_APP_PASSWORD` | Gmail 應用程式密碼（16 個字母，做法見下方） |
| `ADMIN_PASSWORD` | 管理頁密碼，至少 12 個字元，自己設定 |

### 建立 Gmail 應用程式密碼

1. 用這個 Gmail 登入 https://myaccount.google.com/security ，確認「兩步驟驗證」已開啟
   （沒開的話先開，應用程式密碼只在開啟後才能建立）。
2. 打開 https://myaccount.google.com/apppasswords 。
3. 名稱輸入 `幸福餐桌網站`，按「建立」。
4. 畫面會顯示 16 個字母（四組四個），複製起來貼到 `GMAIL_APP_PASSWORD`。空格有沒有都可以。

Gmail 一天約可寄 500 封；一筆預約寄 2 封。要停用時，回到同一頁刪掉這組密碼即可，不影響你的 Gmail 密碼。

### 管理頁

打開 `https://executive-table.jianchiachi.workers.dev/admin`，瀏覽器會跳出帳號密碼視窗：
帳號隨意填（例如 `admin`），密碼填 `ADMIN_PASSWORD`。

### 進階選項（不需要）

- **改用 Resend 寄信**：想用 daoissimple.com 底下的地址當寄件人時才需要。到 resend.com 驗證
  `mail.daoissimple.com`，把 API 金鑰存成 Secret `RESEND_API_KEY`，並刪除 `GMAIL_APP_PASSWORD`
  （兩個都有時優先用 Gmail）。寄件人是 `wrangler.jsonc` 的 `MAIL_FROM`。
- **改用 Cloudflare Access 保護管理頁**：想讓同事各自用信箱登入時才需要。在 Zero Trust 建立
  Self-hosted 應用程式（Path `admin` 與 `api/admin`），再新增變數 `ACCESS_TEAM_DOMAIN` 與 `ACCESS_AUD`。
  有設定時優先於管理頁密碼。

## 換網址（例如之後改用自有網域）

分享預覽、canonical、sitemap、robots 與表單送出網址都是絕對網址，要一起換：

```bash
python3 executive-table/set_site_url.py https://table.daoissimple.com/
```

它會換掉所有絕對網址並重新產生簡體版。信件裡的連結由 Worker 依實際網址產生，不用改。
同時記得：Cloudflare 專案 **Settings → Domains & Routes** 加上網域；Access 應用程式加上新網域；
若 GitHub Pages 上的舊頁面仍要能送出表單，`wrangler.jsonc` 的 `ALLOWED_ORIGINS` 保留 `https://alexchiachi.github.io`。

## 驗證設定（選用）

```bash
npx wrangler deploy --dry-run   # 檢查設定，不會真的部署
npx wrangler dev                # 在 http://localhost:8787 預覽，含本機 D1；沒設 GMAIL_APP_PASSWORD 時信件會標示「未寄出」
```
