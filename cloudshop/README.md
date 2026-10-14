# 無人商店雲端小舖（cloudshop/）

嘉禮慕華無人商店的線上小舖：先在網路上挑好、付款，再到店自取或寄送。網址 https://alexchiachi.github.io/happy/cloudshop/
架構與使用者介面照雲南好物（`shop/`），視覺換成嘉禮慕華品牌圖的墨綠＋米白、線描花草。頁面目前設 `noindex`。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `products.json` | **唯一的商品表**：本週預訂（名稱、截止日、取貨日）、門市資料、運費、付款資訊、商品。`demo: true` 時頁首會顯示「設計稿」提示 |
| `index.html`、`cloudshop.css`、`cloudshop.js` | 頁面、樣式、購物車與送出 |
| `images/brand.jpg`（＋`.webp`） | 開場的品牌圖（使用者提供的嘉禮慕華字標），商品照之後也放這裡（4:5、800×1000，跑 `tools/make_web_images.py`） |

中文字型共用 `shop/fonts/`（本頁已加進 `tools/subset_fonts.py`）；改了文案或商品後在專案根目錄跑 `python3 tools/subset_fonts.py`。

## 跟雲南好物不同的地方

- 兩個貨架：`shelf: "week"`（本週預訂，`week.deadline` 之後不能再選）與 `shelf: "always"`（店內常備）。
- 取貨方式：到店自取（免運，在取貨櫃輸入訂單編號末四碼）、宅配、7-11、全家。滿 `shipping.free` 免運。
- **還沒接後台**：送出後在前端產生訂單編號（`CS` + 日期 + 4 位亂數），完成畫面請客人「用 LINE 傳送訂單」
  （`line.me/R/oaMessage/` 帶入訂單內容）並顯示付款資訊。客人沒按傳送，訂單就不會到我們手上。
  要改成真正的訂單系統時，比照 `executive-table/worker/orders.js` 另做一支（Worker 重算金額、存 D1、寄信、後台）。
- 沒有 Email 欄、沒有送禮選項（之後需要再從 `shop/` 搬過來）。

## 上線前待補

- [ ] 真正的商品、價格、照片（目前 6 樣都是示範，`badge: "示範"`）
- [ ] 門市地址、營業時間、取貨方式細節（`store`）
- [ ] 本週預訂的截止日與取貨日（`week`）
- [ ] 運費金額（目前 1,500 免運、宅配 120、超商 70 都是暫定）
- [ ] 確認 LINE 官方帳號與收款資訊沿用雲南好物（`@617aipgs`、嘉禮慕華舖）是否正確
- [ ] `privacy.html` 加一節說明本頁的個資用途
- [ ] 資料齊了以後把 `demo` 改 `false`、商品的 `badge` 拿掉，決定要不要拿掉 `noindex`
