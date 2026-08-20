# 永恆之子整椎中心 · 線上預約系統
### Eternity's Child Chiropractic — Multilingual Online Booking

支援 **中文 / English / 日本語 / 한국어** 四種語言的線上預約表單，純靜態網頁（HTML + CSS + 原生 JS），
不需要伺服器即可上線，可直接放上 GitHub Pages。

---

## 目錄結構

```
booking/
├── index.html    頁面結構
├── styles.css    版型與樣式
├── i18n.js       四語言字典（中／英／日／韓）
├── config.js     ★ 營業時間、價格、帳號、收件信箱都在這裡
├── app.js        預約流程邏輯（日曆、時段、驗證、送出）
├── standalone.html  以上全部合併成的單一檔案（方便寄送或丟到任何空間）
└── assets/       選填：TWQR 收款條碼圖檔
```

---

## 功能

| 項目 | 說明 |
|:---|:---|
| 四語系 | 中／英／日／韓即時切換，並自動偵測瀏覽器語言；也可用 `?lang=ja` 指定 |
| 四項服務 | 量子整骨、體雕塑身、整椎正骨、按摩推拿 |
| 兩種時長 | 40 分鐘 NT$1,688；60 分鐘 NT$2,888 |
| 一個月前置 | 日曆自動鎖住今天起一個月內的日期，只開放一個月後至四個月內 |
| 營業時間 | 週一至週六 09:00–21:00；週四只到 17:00；週日 09:00–12:00 |
| 週日限制 | 週日只開放上午時段，且僅限「初診」；選「回診」時週日整排自動反灰 |
| 時段計算 | 每 30 分鐘一個起始點，並確保療程能在打烊前結束（例：週四 40 分鐘最晚 16:00） |
| 表單驗證 | 姓名、電話、Email 格式檢查與同意條款勾選 |
| 付款資訊 | 臺灣銀行（004）013004490011，可一鍵複製；另可放上 TWQR 條碼 |
| 送出方式 | 預設寄信到中心信箱；也可接後端 API（見下方） |
| 其他 | 預約編號、預約明細一鍵複製、下載 `.ics` 加入行事曆 |

---

## 快速上線（GitHub Pages）

1. 在 repo 的 **Settings → Pages** 選擇 `Deploy from a branch`，分支選 `main`、資料夾選 `/ (root)`。
2. 網址即為：`https://<帳號>.github.io/<repo>/booking/`
3. 想指定語言時可加參數，例如日文版 `.../booking/?lang=ja`（方便貼給不同國家的客人）。

> `standalone.html` 是把 HTML／CSS／JS 全部合併好的單一檔案，
> 直接用瀏覽器開就能用，也可以整份寄給別人或上傳到任何網頁空間。
> 改設定時請改 `config.js` 後重新產生，或直接編輯 `standalone.html` 裡的 `CONFIG`。

---

## 修改設定（只改 `config.js`）

```js
prices: { 40: 1688, 60: 2888 },       // 調整價格
leadMonths: 1,                        // 需提前幾個月預約
windowMonths: 4,                      // 最多可預約到幾個月後
slotStep: 30,                         // 時段間隔（分鐘）

hours: {
  0: { open: '09:00', close: '12:00', firstVisitOnly: true },  // 週日
  4: { open: '09:00', close: '17:00' },                        // 週四
  // 1,2,3,5,6 為 09:00–21:00
},

closedDates: ['2026-01-01'],          // 國定假日或公休日，列在這裡就會關閉
qrImage: 'assets/twqr.jpg',           // 放上 TWQR 條碼圖檔後填入
```

**加上 TWQR 條碼**：把櫃檯的收款條碼圖片存成 `booking/assets/twqr.jpg`，
再把 `config.js` 的 `qrImage` 填成 `'assets/twqr.jpg'`，確認頁就會顯示條碼。

---

## 預約資料的收取方式

### 方式 A（預設）：電子郵件

送出後會自動開啟客人的郵件程式，收件人是 `config.js` 裡的 `email`
（目前為 `ahanamita88888888@gmail.com`），內容已填好完整預約明細。
若客人的裝置沒有設定郵件程式，完成頁上還有「複製預約明細」按鈕可手動貼上寄出。

### 方式 B（建議）：Google 試算表自動收單

用 Google Apps Script 建立一個免費的收單後端，預約資料會自動寫進試算表並寄信通知：

1. 開一個新的 Google 試算表 → **擴充功能 → Apps Script**，貼上：

```js
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['編號','送出時間','日期','開始','結束','服務','類型',
                     '分鐘','金額','姓名','電話','Email','語言','備註']);
  }
  sheet.appendRow([d.ref, d.submittedAt, d.date, d.startTime, d.endTime,
                   d.serviceLabel, d.visit, d.durationMinutes, d.price,
                   d.name, d.phone, d.email, d.preferredLanguage, d.notes]);
  MailApp.sendEmail('ahanamita88888888@gmail.com',
                    '新預約 ' + d.ref + ' ' + d.date + ' ' + d.startTime,
                    JSON.stringify(d, null, 2));
  return ContentService.createTextOutput('ok');
}
```

2. **部署 → 新增部署作業 → 網頁應用程式**，執行身分選自己，存取權選「知道連結的任何人」。
3. 複製產生的網址，填進 `config.js`：

```js
endpoint: 'https://script.google.com/macros/s/XXXXXXXX/exec'
```

填好後，送出預約就會直接寫入試算表，不再開啟郵件程式。

---

## 已知範圍

* 時段的「已被預約」狀態存在瀏覽器本機（`localStorage`），只擋得住同一台裝置的重複預約。
  要做到跨裝置的即時滿檔，需在方式 B 的後端加上「回傳已佔用時段」的 `doGet`，並於 `app.js`
  的 `takenIntervals()` 改讀該 API。
* 送出的預約為「申請」，實際成立以中心回覆確認為準（頁面文案已載明）。
* 付款採轉帳，頁面不經手任何金流或信用卡資料。
