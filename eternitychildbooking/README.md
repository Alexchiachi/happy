# 永恆之子整椎中心 · 線上預約系統
### Eternity's Child Chiropractic — Multilingual Online Booking

支援 **中文 / English / 日本語 / 한국어** 四種語言的線上預約表單，純靜態網頁（HTML + CSS + 原生 JS），
不需要伺服器即可上線，可直接放上 GitHub Pages。

---

## 目錄結構

```
eternitychildbooking/
├── index.html    頁面結構
├── styles.css    版型與樣式
├── i18n.js       四語言字典（中／英／日／韓）
├── config.js     ★ 營業時間、價格、帳號、收件信箱都在這裡
├── app.js        預約流程邏輯（日曆、時段、驗證、送出）
├── standalone.html  以上全部合併成的單一檔案（方便寄送或丟到任何空間）
├── manual.html   ★ 維護手冊：給不寫程式的人看的操作說明
├── google/       ★ Google 試算表收單程式與部署說明（建議）
├── wordpress/    WordPress 部署說明與 PHP 收單程式
└── assets/       ★ 照片放這裡（photo-1~4.jpg、TWQR 條碼），另附上傳說明
```

---

## 功能

| 項目 | 說明 |
|:---|:---|
| 四語系 | 中／英／日／韓即時切換，並自動偵測瀏覽器語言；也可用 `?lang=ja` 指定 |
| 五項服務 | 量子整骨、體雕塑身、整椎正骨、按摩推拿、醫美整骨 |
| 兩種時長 | 40 分鐘 NT$1,688；60 分鐘 NT$2,888 |
| 醫美整骨 | 改為選部位計價：十個部位擇三 NT$1,688、擇五 NT$2,888，選滿才能進下一步 |
| 一個月前置 | 日曆自動鎖住今天起一個月內的日期，只開放一個月後至四個月內 |
| 營業時間 | 週一至週六 09:00–21:00；週四只到 17:00；週日 09:00–12:00 |
| 週日限制 | 週日只開放上午時段，且僅限「初診」；選「回診」時週日整排自動反灰 |
| 時段計算 | 每 30 分鐘一個起始點，並確保療程能在打烊前結束（例：週四 40 分鐘最晚 16:00） |
| 表單驗證 | 姓名、電話、Email 格式檢查與同意條款勾選 |
| 付款資訊 | 臺灣銀行（004）013004490011，可一鍵複製；另可放上 TWQR 條碼 |
| 送出方式 | 預設寫進 Google 試算表並寄信通知；後端失敗時自動退回寄信 |
| 防撞單 | 日曆會讀回試算表中已成立的時段，重疊的時段自動鎖住 |
| 中心實景 | 四張照片的展示區，照片未上傳時整區自動隱藏；第一張兼作社群分享預覽圖 |
| 中心位置 | 資訊區嵌入 Google 地圖，客人的確認信也附上地圖連結 |
| 其他 | 預約編號、預約明細一鍵複製、下載 `.ics` 加入行事曆 |

---

## 快速上線（GitHub Pages）

1. 在 repo 的 **Settings → Pages** 選擇 `Deploy from a branch`，分支選 `main`、資料夾選 `/ (root)`。
2. 網址即為：`https://<帳號>.github.io/<repo>/eternitychildbooking/`
3. 想指定語言時可加參數，例如日文版 `.../eternitychildbooking/?lang=ja`（方便貼給不同國家的客人）。

> `standalone.html` 是把 HTML／CSS／JS 全部合併好的單一檔案，
> 直接用瀏覽器開就能用，也可以整份寄給別人或上傳到任何網頁空間。
> 改設定時請改 `config.js` 後重新產生，或直接編輯 `standalone.html` 裡的 `CONFIG`。

---

## 維護手冊

`manual.html` 是寫給非技術人員的操作說明：日常收單流程、六種常見的修改步驟、
出問題時的症狀對照表、名詞解釋。上線後的網址是
`https://<帳號>.github.io/<repo>/eternitychildbooking/manual.html`。

**改動系統時請一併更新這份手冊**，否則它會變成誤導人的說明書。
手冊頁尾標有對應的網站版本，改版時記得同步。

---

## 最快的上線方式（靜態主機，30 秒）

`standalone.html` 是單一檔案，任何靜態主機都能直接放：

1. 到 [app.netlify.com/drop](https://app.netlify.com/drop)，把 `standalone.html` 拖進去
2. 立刻拿到一個 HTTPS 網址，例如 `https://xxx.netlify.app`
3. 想換成客戶自己的網域，在 Netlify 的 `Domain settings` 綁上去即可

Cloudflare Pages、Vercel 也是一樣的拖放流程。

**唯一要注意的**：靜態主機不能跑 PHP，所以 `wordpress/booking-submit.php` 在這裡用不了。
靜態主機要收信，最省事的是接一個免費表單服務，`config.js` 兩行就好：

```js
endpoint: 'https://api.web3forms.com/submit',
endpointFields: { access_key: '在 web3forms.com 用 Email 免費申請', subject: '新預約' }
```

不必改任何程式，預約資料就會寄到你申請金鑰時填的信箱。
（免費方案有每月送信額度，實際數字請以該服務官網為準。）

---

## 改版時記得同步版本號

`config.js` 的 `version` 與 `index.html` 裡四個 `?v=` 要改成同一個數字。
那四個查詢字串是給瀏覽器看的：網址變了才會重新下載，否則使用者會一直
看到快取裡的舊版——包括舊的收單設定，這會讓預約靜靜地送不出去。

改完後頁尾右下角會顯示新的版本號，可用來確認線上跑的是哪一版。

---

## 修改設定（只改 `config.js`）

```js
prices: { 40: 1688, 60: 2888 },       // 調整價格（按時長計價的服務）

// 醫美整骨：選部位計價。parts 增減部位、packages 調整方案
pickService: {
  key: 'aesthetic',
  parts: ['face','jaw','pelvis','hip','waist','belly','shoulder','hunch','tuina','detail'],
  packages: [
    { pick: 3, price: 1688, minutes: 40 },   // 擇三，佔用 40 分鐘時段
    { pick: 5, price: 2888, minutes: 60 }    // 擇五，佔用 60 分鐘時段
  ]
},
leadMonths: 1,                        // 需提前幾個月預約
windowMonths: 4,                      // 最多可預約到幾個月後
slotStep: 30,                         // 時段間隔（分鐘）

hours: {
  0: { open: '09:00', close: '12:00', firstVisitOnly: true },  // 週日
  4: { open: '09:00', close: '17:00' },                        // 週四
  // 1,2,3,5,6 為 09:00–21:00
},

closedDates: ['2026-01-01'],          // 國定假日或公休日，列在這裡就會關閉

// 中心位置。換地點時到 Google 地圖 → 分享 → 嵌入地圖，把 iframe 的 src 貼進 embed
map: { embed: 'https://www.google.com/maps/embed?pb=...', link: 'https://maps.google.com/?cid=...' },
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

> **用 WordPress 的話**：`wordpress/` 資料夾裡有現成的 PHP 收單程式與完整部署步驟，
> 不用裝外掛，預約會直接寄到中心信箱，並自動用客人的語言回一封確認信。

### 方式 B（建議）：Google 試算表自動收單

**完整的程式與部署步驟請看 [`google/README.md`](google/README.md)**，
那裡的 `booking-sheet.gs` 除了寫進試算表，還會寄通知信給中心、
並依客人語言自動回一封確認信。以下是最精簡的版本：

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

* 防撞單依賴 Google 試算表的回應。若 Google 暫時連不上，預約頁仍可使用，
  但當下看不到其他客人的預約，仍有極小的撞單機會。
* 送出的預約為「申請」，實際成立以中心回覆確認為準（頁面文案已載明）。
* 付款採轉帳，頁面不經手任何金流或信用卡資料。
