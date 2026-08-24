# 大道至簡 · daoissimple — 靜態網站原始碼

> 做幸福的事，讓幸福變成有價值的事。

這份 zip 包含一個完整的七頁靜態網站，依照《大道至簡 daoissimple.com 網站重構規劃書 v1.0》的精神與規範實作。可以直接部署，也可以交給工程師改寫成 WordPress 主題。

## 檔案結構

```
site/
├── index.html       — 首頁
├── about.html       — 關於
├── journal.html     — 幸福誌
├── yunnan.html      — 雲南選物
├── taiwan.html      — 台灣選物
├── services.html    — 服務體驗
├── connect.html     — 連繫
├── styles.css       — 共用設計系統
├── scripts.js       — 共用互動腳本
└── README.md        — 本檔案
```

## 設計系統重點

**色彩**

- `#FAF6EF` 紙底（paper）
- `#2A2520` 墨字（ink）
- `#8B6F47` 茶褐（tea，雲南調性）
- `#5C7A5A` 苔綠（moss，台灣調性）
- `#A8543A` 印朱（seal，落款）

**字型**（透過 Google Fonts 載入）

- 標題顯示：Cormorant Garamond
- 中文：Noto Serif TC
- 字距、行距都偏鬆，留呼吸空間

**動效**

- 720ms ease-out 緩動
- 進場 fade-in + 微上移 24px
- 由 `IntersectionObserver` 觸發，附 `.reveal` 的元素自動受控

## 本機預覽

直接用瀏覽器開 `index.html` 就可以看。或者跑一個簡單的 server：

```bash
cd site
python3 -m http.server 8080
# 然後開 http://localhost:8080
```

## 部署方式

### 路徑一：靜態託管（推薦・最簡單）

把整個 `site/` 資料夾上傳到下列任一服務即可：

- **Netlify**：拖曳資料夾到 https://app.netlify.com/drop
- **Vercel**：`vercel` CLI 或 GitHub 連動
- **Cloudflare Pages**：GitHub 連動或 Direct Upload
- **GitHub Pages**：push 到 `gh-pages` 分支

DNS 設定指向後即可上線，整個過程約 15 分鐘。

### 路徑二：改寫為 WordPress 主題

請另一位 WordPress 主題開發工程師處理。建議的拆解方式：

- `header.php` ← 抽出共用 `<nav>` 與 `<head>`
- `footer.php` ← 抽出共用 `<footer>`
- `front-page.php` ← `index.html` 內容區
- `page-about.php` / `page-journal.php` / `page-services.php` / `page-connect.php` ← 對應頁面
- `archive-yunnan.php` 與 `single-yunnan.php` ← 雲南選物列表 / 商品頁
- `archive-taiwan.php` 與 `single-taiwan.php` ← 台灣選物列表 / 商品頁
- 商品資料用 ACF 或自訂文章類型（CPT）管理
- `styles.css` 與 `scripts.js` 直接放主題目錄，從 `functions.php` 加載

預估工程師工時：3–10 工作天。

## 待辦・上線前

1. **替換圖片佔位符**——目前所有圖片區都是色塊（`.img-placeholder`），需替換為真實攝影。雲南建議山霧、茶倉、職人雙手；台灣建議稻田、海岸、職人器物。風格偏自然光、低飽和、有空氣感，避免商業過修圖。
2. **替換內容文案**——商品價格、職人姓名、文章內容目前是示範資料，需替換為真實資訊。
3. **接通表單後端**——`connect.html` 中的表單目前只在前端模擬送出，需接上 Formspree、Resend、或自架後端。
4. **設定 Email / Phone**——目前是示範值（`hello@daoissimple.com`、`+886 02-2345-6789`）。
5. **加入 GA / Search Console**——上線前在每頁 `<head>` 加入追蹤碼。
6. **確認字型 fallback**——若擔心 Google Fonts 載入慢，可改為 self-host 或使用系統字型。
7. **無障礙複檢**——加上更完整的 `alt` 文字（圖片真實化後）、檢查鍵盤可用性。

## 設計取捨筆記（給接手者）

幾個刻意的設計選擇，請接手的設計師或工程師理解後再動：

- **沒有 banner 輪播、沒有彈窗、沒有閃爍特價**——這是品牌層的禁區，不要因為「轉換率」而加回去。
- **留白佔比超過 60%**——版面看起來「空」是對的。商品卡片之間、區塊之間的空隙，不要為了多塞東西而壓縮。
- **雲南與台灣對稱並列**——兩頁的結構是鏡像的（雲南為茶褐主調、台灣為苔綠主調）。請維持這份雙翼感，不要讓其中一邊成為主、另一邊成為附屬。
- **印章元素點到為止**——每頁底部的 `.seal-mark` 是收束用的，不要在頁面中段再加更多東方裝飾。
- **動效以「呼吸感」為目標**——不要替換為彈跳、縮放、視差等更「炫」的效果。慢，是這個品牌的主張。

## 授權

本網站原始碼由 Claude 為「大道至簡 · 簡家旗」客製生成。設計與內容版權屬於「大道至簡」，授權僅用於 daoissimple.com 與其延伸應用。

---

如有問題，請先回頭參考《大道至簡 daoissimple.com 網站重構規劃書 v1.0》文件，再聯絡簡家旗。

設計於靜處 · Designed in stillness
