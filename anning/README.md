# 雲南安寧幸福之家（anning/）

大道至簡品牌站底下的說明＋預約頁。網址 https://alexchiachi.github.io/happy/anning/
預約接到同一支 Worker（`executive-table/worker/stays.js`）。頁面目前設 `noindex`，房子照片到齊、正式開放時再拿掉。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `stay.json` | **唯一的設定表**：名稱、天數、最多人數、體驗期、開放月份、房型與價格、想要的旅居方式、付款與聯絡資訊、封面輪播。網頁與 Worker 共用 |
| `index.html` | 頁面文案（理念、招待方式、我們的家、安寧介紹、療心卡、預約表單）。文案直接寫在這裡 |
| 字型 | 跟 `shop/` 共用 `shop/fonts/` 的 Noto Serif TC 子集；改文案或 `stay.json` 後跑 `python3 tools/subset_fonts.py`（見 `shop/README.md`） |
| `anning.css` | 本頁專用樣式；共用樣式（色票、頂列、開場、表單、完成畫面）直接載入 `../shop/shop.css` |
| `anning.js` | 房型卡片、入住日期範圍、人數、合計、送出（`STAY_ENDPOINT` 指向 Worker） |
| `images/` | `cover-*.jpg`（封面實景，3:4、900×1200，另有 `.avif`）、`home-*.jpg`（「我們的家」三格，另有 `.webp`）、`healing-card.jpg`（療心卡，1200×675）、`wechat-qr.jpg`（Rena chien 的微信 QR Code，縮圖後仍可掃描） |

## 加微信

微信個人 QR Code 的連結（`u.wechat.com/...`）只能在微信 App 裡掃，用瀏覽器點開只會顯示「請在微信中打開」，
所以網頁與信件**不放微信連結**。改用：頁尾前的「加微信」段落（`#wechat`）與完成畫面提供
「複製微信號」（`contact.wechatId` 有填才出現）、「儲存 QR Code 圖片」、手機上的「打開微信」（`weixin://`），
並依裝置顯示步驟（手機：存圖 → 掃一掃 → 相簿選圖；電腦：用手機掃畫面）。信件寫微信號並連到 `#wechat`。

## 內容來源

- 文案：Google 文件「雲南/ 安寧-太平新城幸福之家」（id `1vnEuBAFTE0eraD0751d6lRoWZ12t5oANguLP03CEMWc`，2026-09-25）。
  文件裡有兩個版本的同一段介紹，網頁合併成一份；原文的「里」「面」等用字改成台灣用字（裡、麵）。
- 微信 QR Code、療心卡：Google 表單「雲南 安寧 佛系幸福之家」（id `1E6H-AZhCaSMOI8a2KF-rduT1AtwL2S_ONzaF8xsqErU`）的列印 PDF。
  表單本身讀不到（容器擋 docs.google.com、Drive 工具不支援表單），要讀表單請使用者印預覽頁成 PDF，或把文字貼進 Google 文件。
- 房型與價格：使用者 2026-09-25 提供的表單截圖「選擇旅居方案」——雙人套房 $8,888（兩人）、雙人雅房 $6,666（兩人）、
  單人雅房 $3,666（一人），都是 7 天 6 夜；開放 2026 年 10–12 月。
- 定位：**旅居方案，是短期租賃居住，不是旅行社行程**。文案不要寫接送、門票、領隊、保險這類跟團內容。
- 舊的「雲南旅居報名表」（恆大社區、每人計價、訂金、行程勾選）已經**不用**。
- 照片：雲端硬碟「雲南安寧幸福之家｜網站素材」（id `1HKQAj6sbx_dLJhJMdi06pSffU5DJYx5v`），2026-09-27 Rena 上傳 10 張房子實景（HEIC）。
  封面用 IMG_5877（客廳）、5874（臥室看山）、5870（另一間臥室）；「我們的家」用 5881（客廳）、5880（廚房）、5873（臥室）。
  2026-09-29 開場輪播在房子三張之後加上 4 張生活小區照（使用者直接貼在對話裡，1932×2576）：
  `cover-community-mountain`（林蔭大道看山）、`-lake`（高處看山與湖）、`-path`（步道草坪）、`-towers`（花園與大樓）。
  雲端硬碟裡同一批的 DNG／PNG 每張超過 10 MB，Drive 工具下載不了；照片太大時，請使用者直接貼進對話最省事。
  換照片後跑 `python3 tools/make_web_images.py`（`cover-*` 出 `.avif`、其他出 `.webp`），
  封面第一張同時寫在 `index.html` 與 `stay.json`，兩邊要一致。
- 兩組輪播（`anning.js` 的 `initCover` 共用）：開場 `data-cover="home"` 是房子實景（`stay.json` 的 `cover`）；
  「安寧」區塊 `data-cover="trip"` 是雲南風景（`tripPhotos`，借用 `shop/images/cover-*`，網路照片，`tripNote` 有侵權聲明）。
  客人來旅居也會出門玩，所以風景照放在介紹景點的段落，不放開場。

## 預約流程

一次只接一組客人，日期要先對過才收錢，所以跟雲南好物不同：

1. 客人選房型（三種各一間，可複選）、入住日期（必填，須在 `months` 裡 `open` 的月份內、不早於今天）、同行人數，送出。**不付款。**
   金額 = 所選房型價格加總；人數不超過所選房型的 `people` 加總，也不超過 `stay.maxGuests`（5 位）。
2. Worker 存 D1 `stays` 表，預約編號 `HS` + 台北日期 + 流水號（例 `HS20261003-004`），
   寄通知到 `SHOP_NOTIFY_EMAIL`（jianchiachi、renachien1），寄預約確認給客人（附微信 QR Code）。
3. 用微信或 LINE 跟客人對日期 → `/admin` 的「幸福之家預約」分頁填「入住日期」、需要時改金額 → 改「已確認」：
   客人收到付款資訊（LINE Pay／匯款，跟雲南好物同一個帳戶）。
4. 收到款項改「已付款」：客人收到收款確認。之後「已完成」或「取消」。
5. 同一個月已有其他預約時，通知信與後台會標出來（一次只接一組）。

## 與雲南好物互推

頁尾前的 `.sibling` 卡片連到 `../shop/`，完成畫面也有一行；`shop/` 那邊對稱放一份。樣式在 `shop/shop.css`。
卡片文字寫的是固定事實（7 天 6 夜、一次只接一組；普洱、野生菌、玫瑰點心、藏香），改方案或商品下架時一起檢查。
只放在網頁上，**確認信不放**（個資說明寫「不做行銷」）。

## 改 `stay.json` 的規矩

- 房型 `id`、月份 `key` 上線後不要改（舊預約會對不上）。新增月份就加一列；不再開放的月份設 `"open": false`，不要刪；
  暫停某個房型設 `"active": false`。
- 換季調價：改各房型的 `price`、`period.name`、`period.note`。已送出的預約金額不會跟著變。
- 改完推上 `main`：GitHub Pages（頁面）與 Cloudflare（Worker 重算金額）都會自動更新。
  Worker 的自動部署靠 `.github/workflows/worker.yml` 的 `paths`，`anning/stay.json` 必須在清單裡（2026-09-25 補上）。

## 還缺的素材

- 房子的實景照已經上了（2026-09-27），社區周邊也上了（2026-09-29）。還可以補：窗台、安寧街景，以及三種房型各一張（雙人套房、雙人雅房、單人雅房），
  之後可以放進房型卡片。
