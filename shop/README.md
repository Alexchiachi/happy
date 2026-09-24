# 雲南好物選購頁（shop/）

大道至簡品牌站底下的獨立選購頁：本檔預購五樣＋常備好物五樣。網址 https://alexchiachi.github.io/happy/shop/
訂單已接上 Worker（`executive-table/worker/orders.js`）。頁面目前仍設 `noindex`，照片、文案、付款資訊到齊正式開賣時再拿掉。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `products.json` | **唯一的商品表**：檔期（名稱、截止日、出貨日）、運費、付款資訊、10 樣商品。網頁與 Worker 共用 |
| `index.html`、`shop.css`、`shop.js` | 頁面、樣式、購物車與送出（`ORDER_ENDPOINT` 指向 Worker） |
| `images/` | 商品照（4:5、800×1000 JPG） |

改 `products.json` 的規矩：
- 商品 `id`、規格 `key` 上線後不要改（舊訂單會對不上）；要下架設 `"active": false`。
- `shelf`：`season`（本檔預購，截止日後 Worker 拒收）或 `always`（常備）。
- 換檔期：改 `season` 的 `name`、`deadline`（含 `+08:00`）、`deadlineText`、`ship`，再換 `season` 商品。
- 付款資訊（`payment.bank`、`payment.linepay`、選填 `payment.linepayImage` 圖片路徑）會出現在完成畫面與確認信。
- 改完推上 `main`：GitHub Pages（頁面）與 Cloudflare（Worker 重算金額）都會自動更新。

## 素材流程（使用者只負責丟素材）

使用者**只把照片和文字放進 Google 雲端硬碟**，不處理任何格式。
下載、裁切、壓縮、文案整理、放上網頁，都由 Claude 處理。

雲端硬碟資料夾「雲南好物｜網站素材」（id `1UoDZsJcAU3iO0TWBYwjK6ggwmafvKAUp`）：

| 內容 | 放什麼 |
| --- | --- |
| `雲南好物｜商品資料表`（試算表，id `1E_Q_W9VSS-rRtzp42xdTfug4VTa1YFXo23KvARKw8d4`） | 每樣商品一列：區塊（常備／本檔）、狀態（上架／下架）、品名、規格與價格（一行一種，`名稱｜價格`）、介紹、產地、內容量、保存、賞味期限、限量；下方是檔期與付款設定 |
| `00 共用` | 封面照、LINE Pay 收款碼、其他共用圖 |
| `01`–`05` | 常備好物，一樣商品一個資料夾 |
| `11`–`15` | 本檔預購，一樣商品一個資料夾 |

使用者說「素材更新了」時：

1. 用 Google Drive 工具讀資料表、列出各資料夾的新照片並下載（任何格式都收，iPhone 的 HEIC 用 `pillow-heif` 轉）。
2. 挑照片：資料夾裡檔名有「封面」的當商品卡封面，沒有就挑構圖最適合直式 4:5 的那張。
   - 燒了中文字、價格或簡體行銷字的廣告圖，只裁出照片區域。
   - 有 AI 生成浮水印的圖不要用（例：舊型錄的香格里拉藏香圖右下角有 Gemini 浮水印）。
3. 處理照片：裁成 **4:5**、800×1000、JPG 品質約 80、每張 250KB 以內，存進 `shop/images/`，
   檔名全小寫英文加連字號（例：`rose-tea.jpg`）。原檔不進倉庫。
4. 文案：以資料表為準。語氣照品牌站（短句、具體、溫和）；資料表沒寫的事實不要自己補。
   **不寫療效**（止血、降血壓、調理某種病等），食品和中藥材都一樣。
5. 更新 `shop/products.json`，
   本機截圖檢查電腦版和手機版，再提交推送。
6. 回報時列出：哪些商品換了照片、哪些欄位還缺（例：藏香支數、牛軋糖內容量）。

## 架構

照 `executive-table/worker/letters.js`（品牌站連繫表單）的同一套做法，不新增服務：

- 頁面：GitHub Pages（`/happy/shop/`）
- 訂單：同一支 Worker `/api/order` → 依 `products.json` 重算金額、檢查截止日 → D1 `orders` 表
  → Gmail 寄通知（`SHOP_NOTIFY_EMAIL`：jianchiachi@gmail.com、renachien1@gmail.com，各一封）與客人的訂單確認
  → `/admin` 的「雲南訂單」分頁（待付款 → 已付款 → 已出貨／取消，可匯出 CSV）
- 運費：滿 `shipping.free` 免運；未滿宅配 `home`、超商 `cvs`，面交免運
- 同一檔、同一支電話重複下單：不自動合併，在通知信與後台標出「同檔已有訂單」，由人工合併寄送、調整運費
- 訂單編號：`YN` + 台北日期 + 流水號（例 `YN20261024-007`）
