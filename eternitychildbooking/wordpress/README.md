# 部署到 WordPress

預約系統是純前端網頁，WordPress 不用裝任何外掛就能放上去。
共有兩個步驟：**① 把網頁放上去**、**② 讓預約資料寄到你的信箱**。

---

## ① 把網頁放上去

### 方式 A：獨立網址（最簡單、最不會出錯）★推薦

用主機商的**檔案管理員**（cPanel／Plesk）或 **FTP 軟體**（FileZilla、Cyberduck），
在網站根目錄（跟 `wp-content`、`wp-config.php` 同一層）建立一個 `eternitychildbooking` 資料夾，
把這些檔案放進去：

```
你的網站根目錄/
├── wp-content/
├── wp-config.php
└── eternitychildbooking/              ← 新增這個資料夾
    ├── index.html        ← 把 standalone.html 改名成 index.html
    └── booking-submit.php ← 收信程式（見步驟 ②）
```

完成後網址就是 **`https://你的網域/eternitychildbooking/`**。

最後在 WordPress 後台 `外觀 → 選單 → 自訂連結`，網址填 `/eternitychildbooking/`、
名稱填「線上預約」，加進主選單即可。

> **為什麼建議獨立網址？**
> 這個預約頁有自己完整的版面設定（含 `body`、`*` 等全域樣式）。
> 如果直接貼進 WordPress 文章編輯器的「自訂 HTML」區塊，
> 這些樣式會蓋掉佈景主題，整個網站版面會跑掉。請不要那樣做。

### 方式 B：嵌在 WordPress 頁面裡（保留你的頁首頁尾）

先照方式 A 把檔案放上去，然後新增一個 WordPress 頁面，
插入「自訂 HTML」區塊，貼上：

```html
<iframe id="ecc-booking" src="/eternitychildbooking/" title="線上預約"
        style="width:100%;height:1600px;border:0;display:block"
        scrolling="no"></iframe>
<script>
window.addEventListener('message', function (e) {
  if (e.data && e.data.eccBookingHeight) {
    document.getElementById('ecc-booking').style.height = (e.data.eccBookingHeight + 40) + 'px';
  }
});
</script>
```

預約頁會主動回報自己的高度，iframe 會自動長高，不會出現內部捲軸。

### 方式 C：完全不用 WordPress

`standalone.html` 用瀏覽器直接開就能用，也可以拖到 [Netlify Drop](https://app.netlify.com/drop)
立刻得到一個網址。缺點是沒有步驟 ② 的收信功能，只能用預設的寄信方式。

---

## ② 讓預約資料寄到你的信箱

### 預設方式：客人的信箱程式（不需設定，但會漏單）

沒有設定 `endpoint` 時，客人按「送出預約」會**開啟客人自己的信箱程式**，
內容已經填好、收件人是你，但**客人還要自己按一次寄出**。

這代表：客人手機沒設定信箱程式、或按了取消，你就收不到這筆預約。
完成頁上雖然有「複製預約明細」讓客人手動貼給你，但實務上一定會漏單。
**正式營運請務必改用下面的方式。**

### 建議方式：WordPress 直接收單（不用外掛、不用第三方服務）

1. 把 `booking-submit.php` 上傳到跟 `index.html` 同一個資料夾。
2. 打開 `index.html`（或 `standalone.html`），搜尋 `endpoint`，改成：

```js
endpoint: '/eternitychildbooking/booking-submit.php',
```

3. 存檔上傳，完成。

之後客人按下送出，資料會直接送到你的網站，然後：

* **寄一封給你**（`ahanamita88888888@gmail.com`）— 標題如
  `[新預約 ECC-260920-A3F2] 2026-09-20 09:00 王小明`，內文含完整明細；
  直接按「回覆」就是回信給客人。
* **寄一封確認信給客人** — 自動使用客人選的語言（中／英／日／韓），
  內含預約明細與轉帳資訊。

程式本身還做了三件事：同一 IP 每小時最多 8 筆（防灌水）、
所有欄位長度與格式檢查、日期時間格式驗證。

> **收不到信怎麼辦？**
> 這支程式用的是 WordPress 內建的 `wp_mail()`，會沿用網站既有的寄信設定。
> 如果你的主機沒有設定過寄信，信件容易進垃圾信匣或直接失敗。
> 解法是安裝免費外掛 **WP Mail SMTP**，用 Gmail 或主機商提供的 SMTP 設定一次，
> 之後所有信件（含這個預約系統）都會正常送達。
>
> 萬一後端真的失敗了，網頁會自動退回「開啟客人信箱程式」的方式，
> 預約不會直接消失。

### 替代方式：Google 試算表自動收單

不想改 WordPress 的話，也可以用 Google Apps Script，
預約會自動寫進 Google 試算表並寄信通知你。
做法寫在上一層的 `../README.md`「方式 B」。

---

## 常見問題

**Q：客人可以直接線上付款嗎？**
不行，目前是轉帳。頁面只顯示你的臺銀帳號與 TWQR 提示，不經手任何金流，
也不會蒐集信用卡資料。要做線上刷卡需要串接綠界、藍新等金流商，是另一個工程。

**Q：兩個客人會不會約到同一個時段？**
會。目前「已被預約」只記在客人自己的瀏覽器裡。
要真正防止撞單，需要讓 `booking-submit.php` 把已成立的時段存進資料庫，
再提供一支查詢用的網址給前端讀取。需要的話再跟我說，我可以接著做。

**Q：要改營業時間或價格？**
改 `index.html` 最上面的 `const CONFIG = {` 區塊，
營業時間、價格、公休日、收件信箱全部都在那裡。
