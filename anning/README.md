# 雲南安寧幸福之家（anning/）

大道至簡品牌站底下的說明＋預約頁。網址 https://alexchiachi.github.io/happy/anning/
預約接到同一支 Worker（`executive-table/worker/stays.js`）。頁面目前設 `noindex`，房子照片到齊、正式開放時再拿掉。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `stay.json` | **唯一的設定表**：名稱、天數、最多人數、體驗期、開放月份、方案價格、想要的旅居方式、付款與聯絡資訊、封面輪播。網頁與 Worker 共用 |
| `index.html` | 頁面文案（理念、招待方式、我們的家、安寧介紹、療心卡、預約表單）。文案直接寫在這裡 |
| `anning.css` | 本頁專用樣式；共用樣式（色票、頂列、開場、表單、完成畫面）直接載入 `../shop/shop.css` |
| `anning.js` | 月份與人數、預估金額、送出（`STAY_ENDPOINT` 指向 Worker） |
| `images/` | `healing-card.jpg`（療心卡，1200×675）、`wechat-qr.jpg`（Rena chien 的微信 QR Code，縮圖後仍可掃描） |

## 內容來源

- 文案：Google 文件「雲南/ 安寧-太平新城幸福之家」（id `1vnEuBAFTE0eraD0751d6lRoWZ12t5oANguLP03CEMWc`，2026-09-25）。
  文件裡有兩個版本的同一段介紹，網頁合併成一份；原文的「里」「面」等用字改成台灣用字（裡、麵）。
- 微信 QR Code、療心卡：Google 表單「雲南 安寧 佛系幸福之家」（id `1E6H-AZhCaSMOI8a2KF-rduT1AtwL2S_ONzaF8xsqErU`）的列印 PDF。
  表單本身讀不到（容器擋 docs.google.com、Drive 工具不支援表單），要讀表單請使用者印預覽頁成 PDF，或把文字貼進 Google 文件。
- 舊的「雲南旅居報名表」（恆大社區、三種房型、每人計價、訂金）已經**不用**，以上面那份文件為準。
- 封面輪播暫用 `shop/images/` 的雲南風景照（小紅書照片），不是幸福之家實景；`coverNote` 有寫明。

## 預約流程

一次只接一組客人，日期要先對過才收錢，所以跟雲南好物不同：

1. 客人選月份（`stay.json` 的 `months`，`open:false` 就不開放）、希望入住日（選填）、人數、套房數，送出。**不付款。**
   預估金額 = 套房數 × `plan.price`；每間 `perRoom` 人，最多 `stay.maxGuests` 人、`plan.maxRooms` 間。
2. Worker 存 D1 `stays` 表，預約編號 `HS` + 台北日期 + 流水號（例 `HS20261003-004`），
   寄通知到 `SHOP_NOTIFY_EMAIL`（jianchiachi、renachien1），寄預約確認給客人（附微信 QR Code）。
3. 用微信或 LINE 跟客人對日期 → `/admin` 的「幸福之家預約」分頁填「入住日期」、需要時改金額 → 改「已確認」：
   客人收到付款資訊（LINE Pay／匯款，跟雲南好物同一個帳戶）。
4. 收到款項改「已付款」：客人收到收款確認。之後「已完成」或「取消」。
5. 同一個月已有其他預約時，通知信與後台會標出來（一次只接一組）。

## 改 `stay.json` 的規矩

- 方案 `plan.id`、月份 `key` 上線後不要改（舊預約會對不上）。新增月份就加一列；不再開放的月份設 `"open": false`，不要刪。
- 換季調價：改 `plan.price`、`period.name`、`period.note`。已送出的預約金額不會跟著變。
- 改完推上 `main`：GitHub Pages（頁面）與 Cloudflare（Worker 重算金額）都會自動更新。

## 還缺的素材

- 房子的照片（客廳、廚房、房間、窗台、社區周邊）：放到雲端硬碟，Claude 會裁切壓縮後換掉「照片準備中」的色塊。
  建議開一個資料夾「雲南安寧幸福之家｜網站素材」。
- 有自己的安寧實景照片之後，換掉封面輪播，並刪掉 `coverNote`。
