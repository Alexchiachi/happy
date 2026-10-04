# 做新網頁之前先讀：優化經驗與檢查清單

2026-09 優化雲南三頁（`yunnan.html`、`shop/`、`anning/`）時踩過的坑、量過的數字、做好的工具，都整理在這裡。
新網頁照這份做，一開始就做對，不必事後再優化一輪。

- 長什麼樣子：[`DESIGN.md`](DESIGN.md)。這份管的是**快不快、穩不穩、找不找得到、安不安全**。
- 哪個技能做什麼：[`CLAUDE.md`](CLAUDE.md) 的技能表。

---

## 一、開工前五分鐘：先決定這三件事

| 問題 | 為什麼要先想 |
| --- | --- |
| **這頁要不要被搜尋到？** | 要：加進 `sitemap`（跑 `tools/build_zhcn.py`）、寫 `description`、`canonical`。不要（例如預約頁試營運）：`<meta name="robots" content="noindex">`，PageSpeed 的 SEO 分數會低，那是正常的 |
| **開場畫面（第一屏）是什麼？** | 第一屏最大的那個東西（通常是照片或大標）決定 LCP 分數。它必須**直接寫在 HTML 裡**，不能等 JS 或 JSON |
| **要不要簡體版？** | 品牌站頁面會由 `tools/build_zhcn.py` 自動產生；`shop/`、`anning/` 這類獨立頁不做。新增對外頁面要加進 `.github/workflows/pages.yml` 的白名單 |

---

## 二、五個踩過的坑（附實測數字）

### 1. 中文字型是最大的效能殺手

- **現象**：安寧頁手機 PageSpeed 55 分、好物頁 70 分，「會阻斷算繪的要求」預估可省 15 秒。
- **原因**：Google Fonts 把 Noto Serif TC 切成四百多段。光是字型的 CSS 就有 509KB（壓縮後 139KB）；
  瀏覽器再依頁面上的字下載對應的段落——每頁 **50–60 個字型檔、4–4.7MB**，手機主執行緒被卡住 1.1–1.3 秒。
- **第一次修錯了**：只把字型 CSS 改成非同步載入（不擋畫面），但**該下載的量沒變**，上線後分數完全沒動。
  → 教訓：**不擋畫面 ≠ 不花成本**。頻寬與處理時間照樣被吃掉。
- **正解**：自己放「只含用到的字」的子集。
  `tools/subset_fonts.py` 用無頭瀏覽器找出每個字重實際用到的字，向 Google Fonts 要子集，存到 `shop/fonts/`。
  三個字重共約 **300KB**，並且等 `load` 之後才載入：

  ```html
  <script>addEventListener('load', function () { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'fonts/fonts.css'; document.head.appendChild(l); });</script>
  <noscript><link rel="stylesheet" href="fonts/fonts.css"></noscript>
  ```

  為什麼要等 `load`：字型若在第一次繪製前就被發現，Lighthouse 會把它算進 FCP／LCP（見第三節）。
- **結果**：安寧 65 → 94、好物 73 → 95（同條件本機實測）。
- **新網頁怎麼做**：
  - 獨立頁（像 `shop/`、`anning/`）：直接共用 `shop/fonts/`，把新頁面加進 `tools/subset_fonts.py` 裡那組 `TARGETS` 的 `pages`，重跑一次。
  - 部署在 Cloudflare 的課程頁（`executive-table/`）只發布自己資料夾裡的檔案，所以有自己一組 `executive-table/fonts/`
    （檔名帶雜湊、`_headers` 設快取一年）。`python3 tools/subset_fonts.py executive-table` 只重做這一組。
  - 品牌站頁面目前仍從 Google Fonts 載入完整字型（文章多、用字廣，還沒處理）。新品牌站頁面照現狀即可，
    但**只載入真的用到的字重**（每多一個字重，就多一整套 2MB）。
  - 改了文案、商品、房型之後要重跑 `python3 tools/subset_fonts.py`。沒跑也不會缺字，只是新字會用系統明體顯示。

### 2. 等 JS 才出現的開場畫面：版面跳動＋LCP 變慢

- **現象**：安寧頁 CLS 0.655（合格是 0.1 以下）；封面照要等 2 秒多才開始下載。
- **原因**：封面照清單寫在 `stay.json`，JS 讀完 JSON 才把輪播插進頁面——手機上整段文字被往下推一屏，
  而且瀏覽器在讀到 JSON 之前根本不知道要下載哪張圖。
- **正解**：
  1. 版面先寫在 HTML：輪播框、`has-cover` 這些 class 一開始就在，資料到了才不會推動內容。
  2. **第一張照片直接寫在 HTML**，JS 只負責接上第二張以後。
  3. 文字說明之類晚到的內容，先用 `min-height` 留好位置（`.cover-note:empty { min-height: 2.4em; }`）。
- **原則**：資料可以放 JSON（單一來源），但**第一屏看得到的東西要在 HTML 裡**。兩邊重複的地方寫註解，提醒要一起改。

### 3. 輪播的照片：`loading="lazy"` 沒有用

- **現象**：一進頁面就下載全部封面（好物頁 7 張、約 1.3MB），但只看得到第一張。
- **原因**：投影片疊在同一個框裡，全部都「在畫面內」，瀏覽器的 lazy 判斷不會生效。
- **正解**：第二張起把網址放在 `data-src`／`data-srcset`，頁面載完先備好第二張，之後每輪到一張才預載下一張。
  三支程式用同一套寫法：`shop/shop.js`、`anning/anning.js`（`coverPicture`、`wakeSlide`）與 `scripts.js`（品牌站的 `[data-carousel]`）。
  新頁面要輪播，照抄其中一份，不要重寫。

### 4. 照片格式：先試再決定，不要憑印象

| 做法 | 結果 |
| --- | --- |
| 商品照 JPG → WebP（同尺寸） | 小約 **40%** ✅ |
| 封面照 JPG → WebP（同尺寸） | 細節多的照片（藍花楹）反而**變大** ❌ |
| 封面照做 600 寬的縮小版 | 手機螢幕密度 2–3 倍，412 寬 × 3 還是選 900 寬，**根本用不到** ❌ |
| 封面照 JPG → AVIF（同尺寸） | 小 **42–61%**，放大對照看不出差別 ✅ |
| JPG 重新壓縮 | 原檔已經壓得很好，重壓反而變大 ❌ |

- 工具：`python3 tools/make_web_images.py`（商品 → `.webp`，`cover-*` → `.avif`）。JSON 裡只寫 `.jpg`，其他格式由程式推出來。
- HTML 一律用 `<picture>`，JPG 留作退路：

  ```html
  <picture><source type="image/avif" srcset="images/cover-x.avif"><img src="images/cover-x.jpg" alt="具體描述畫面" width="900" height="1200" decoding="async" fetchpriority="high"></picture>
  ```

- 每張 `<img>` 都寫 `width`／`height`（避免跳動）；第一屏以外加 `loading="lazy"`；第一屏最大那張加 `fetchpriority="high"`。

### 5. 無障礙的小地方：看得到的字要跟報讀的名稱一致

- 好物頁「訂單」按鈕的 `aria-label` 寫「前往結帳」，用語音操作說「訂單」會點不到（WCAG 2.5.3）。
- **原則**：按鈕上已經有字，就不要再加 `aria-label`；真的要加，必須包含畫面上的字。

---

## 三、怎麼量才準（這一節最重要）

第一次優化時，本機量到 92／97 分，上線後 PageSpeed 卻還是 55／70。原因是**本機環境跟真實手機不一樣**：

| 陷阱 | 說明 | 對策 |
| --- | --- | --- |
| 沙盒連不到 Google Fonts | 字型請求瞬間失敗，4.7MB 的字型成本完全沒被量到 | Chromium 走代理（下方指令） |
| 沙盒連不到 `github.io` | 不能直接測正式網址 | 本機起伺服器測；上線後請使用者用 PageSpeed 測正式網址 |
| PageSpeed API 有每日額度 | 沙盒呼叫常得到「Quota exceeded」或 429 | 同上 |
| 本機 `python3 -m http.server` 不壓縮 | CSS／JS 比正式站大，分數略偏低 | 看趨勢與前後差，不看絕對值 |
| **PageSpeed 每次測都不一樣，剛上線的第一次特別低** | PR #27 上線後：第一次手機 79／78，第二次 89／89（2026-09 實測）。剛部署時 GitHub Pages 的 CDN 還沒快取、字型與照片也是第一次被抓，回應較慢；PageSpeed 每次的伺服器與網路也有差異 | 上線後**隔幾分鐘再測，至少測 2–3 次，取中間值**。本機（走代理）量到 94／95，正式網址穩定後約 89，本機大約樂觀 5 分；本機用來比較改動前後，分數以 PageSpeed 正式網址為準 |
| Lighthouse 的模擬（Lantern） | 在實際的第一次繪製前**已經下載完**的資源，都會被算進 FCP／LCP；本機太快，字型剛好搶在前面就會被算進去，分數忽高忽低 | 非必要資源（字型）等 `load` 之後再載；每頁跑 2–3 次 |

**標準量法**：把正式版（`main`）和修改版放在兩個埠，同條件比較。

```bash
# 正式版（main）放 8766，修改版（目前工作目錄）放 8765
git worktree add /tmp/live origin/main
(cd /tmp/live && python3 -m http.server 8766 &) ; python3 -m http.server 8765 &

# 讓 Chromium 真的去下載 Google Fonts（只用在本機測試）
export CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
FL="--headless=new --no-sandbox --proxy-server=$HTTPS_PROXY --proxy-bypass-list=localhost;127.0.0.1 --ignore-certificate-errors"
npx -y lighthouse@latest http://localhost:8765/shop/ --only-categories=performance \
  --chrome-flags="$FL" --output=json --output-path=lh.json --quiet
jq '.categories.performance.score, .audits["largest-contentful-paint"].displayValue' lh.json
```

- 看分數，也看**字型與圖片的下載量**（`network-requests` 裡 `resourceType` 為 `Font`／`Image` 的 `transferSize`）。
- 效能以外的檢查：`bash .claude/skills/web-quality-audit/scripts/analyze.sh 頁面.html`（原始碼快篩），
  完整的 Lighthouse（不加 `--only-categories`）看無障礙、SEO、最佳實踐。
- 互動要實際操作確認（Playwright）：輪播會換張、跳著點也會載入、表單送得出去、字型真的換上。
- **上線後一定請使用者用 [PageSpeed Insights](https://pagespeed.web.dev/) 測正式網址**，隔幾分鐘、測 2–3 次，貼截圖回來對照。

---

## 四、網站這端改不了的（不要白花時間）

- **「使用有效的快取生命週期」**：GitHub Pages 固定快取 10 分鐘。要改只能換主機（例如 Cloudflare Pages）。
- **「舊版 JavaScript」約 11KB**：Cloudflare Web Analytics 的第三方程式。
- **`noindex` 頁面的 SEO 分數**：刻意不給搜尋引擎收錄，分數低是正常的。

---

## 五、新網頁檢查清單

**開工**
- [ ] 讀過 `DESIGN.md`（色票、字體、元件、語氣）
- [ ] 決定：要不要被搜尋、第一屏是什麼、要不要簡體版（第一節）
- [ ] 對外頁面加進 `.github/workflows/pages.yml` 白名單

**寫的時候**
- [ ] 第一屏最大的元素直接寫在 HTML；需要 JS 的區塊先把位置留好
- [ ] 字型：獨立頁共用 `shop/fonts/` 並加進 `subset_fonts.py`；品牌站頁面只載用到的字重
- [ ] 照片：跑 `make_web_images.py`，用 `<picture>`，寫寬高、alt，第一屏以外 lazy
- [ ] 輪播：沿用現成的逐張載入寫法
- [ ] hover 包在 `@media (hover: hover) and (pointer: fine)`；補 `:active`；有 `prefers-reduced-motion` 版本
- [ ] 按鈕、連結的可見文字就是名稱，不另寫不一致的 `aria-label`
- [ ] 表單送到 Worker：伺服器端驗證、限流、重算金額（`security-and-hardening` 技能）
- [ ] 短說明（導言、卡片說明、常見問題回答）一句一段、長句在逗號處斷行，不斷在詞中間：跑 `tools/format_short_text.py`（規則見 `DESIGN.md`）
- [ ] 改了 `styles.css`／`scripts.js` 跑 `tools/bump_assets.py`；改了繁體頁跑 `tools/build_zhcn.py`

**交出去之前**
- [ ] 本機 Lighthouse 走代理，跟 `main` 同條件比較，各跑 2–3 次
- [ ] `analyze.sh` 快篩、完整 Lighthouse 看無障礙與 SEO
- [ ] Playwright 手機尺寸實際操作一次、截圖看過
- [ ] PR 說明寫清楚前後數字與「上線後待確認」
- [ ] 上線後請使用者用 PageSpeed 測正式網址（隔幾分鐘、測 2–3 次，取中間值）

---

## 六、工具一覽

| 工具 | 什麼時候跑 |
| --- | --- |
| `tools/build_zhcn.py` | 改了任何品牌站繁體頁（重建 `zh-cn/`、sitemap、hreflang） |
| `tools/format_short_text.py` | 新增或改了短說明段落（把短說明排成一句一段、長句斷行；先試跑，加 `--write` 才寫入） |
| `tools/bump_assets.py` | 改了 `styles.css` 或 `scripts.js`（更新快取版本號） |
| `tools/make_web_images.py` | 新增或換了 `shop/images/` 的照片 |
| `tools/subset_fonts.py` | 改了 `shop/`、`anning/` 的文案、`products.json`、`stay.json`；或改了 `executive-table/` 的文案（加引數 `executive-table` 只做那組） |
| `.claude/skills/web-quality-audit/scripts/analyze.sh` | 交出去之前的原始碼快篩 |

## 七、成績紀錄

| 日期 | 頁面 | 手機效能（前 → 後） | 主要改動 |
| --- | --- | --- | --- |
| 2026-09-26 | 安寧幸福之家 | 49 → 75（本機） | 封面版面先寫在 HTML，CLS 0.655 → 0 |
| 2026-09-26 | 三頁 | 本機 92／97／96，上線仍 55／70 | 字型改非同步、封面 AVIF、逐張載入——**字型量沒變，所以沒用** |
| 2026-09-26 | 安寧／好物 | 65／73 → 94／95（本機走代理） | 中文字型子集 4.7MB → 300KB、load 後才載入、第一張封面寫進 HTML |
| 2026-09-26 | 安寧／好物（**PageSpeed 正式網址**） | 手機 55／70 → **89／89**；電腦 **99／100** | 同上一列（PR #27 上線後實測。剛上線第一次測是 79／78、電腦 99／99，第二次才是 89／89） |
| 2026-09-27 | 幸福餐桌課程頁（繁／簡） | 55／55 → **99–100／99**（本機走代理） | 中文字型子集 1.4MB（簡體 2.9MB）→ 190KB、load 後才載入；hover 只給滑鼠 |
| 2026-09-27 | 幸福餐桌課程頁（**PageSpeed 正式網址**，Cloudflare） | 手機 **99**；電腦 **100** | 同上一列（PR #29 上線後實測）。比 GitHub Pages 上的雲南兩頁（89）高，部分來自 Cloudflare 可長期快取字型與圖片 |
| 2026-09-27 | 一人商業閉環旗艦導引頁（另一個倉庫，見 `DESIGN.md` 的「例外」一節） | 本機 **90–95**（改之前量不到，見下） | 中文字型子集 **7.9MB／110 檔 → 310KB／7 檔**、load 後才載入；開場動畫不再從 `opacity:0` 開始 |
| 2026-09-27 | 同上（**PageSpeed 正式網址**，GitHub Pages） | 手機 **100**；電腦 **100** | 同上一列。同樣在 GitHub Pages 上卻比雲南兩頁（89）高：那一頁是單一檔案、第一屏沒有照片、也沒有第三方統計，所以沒有東西跟字型搶頻寬 |

之後每次上線，請把 PageSpeed 正式網址的手機與電腦分數補在這張表。

**旗艦導引頁「改之前」為什麼是空的**：沙盒的瀏覽器連不到 Google Fonts，字型請求會瞬間失敗，
7.9MB 完全不會被計入——照第三節的陷阱，量出來的分數只會騙人。所以前後對照改用實際會下載的
位元組數：直接抓 Google Fonts 的 CSS（614KB）、算出這一頁會命中哪些分段、再向 gstatic 查每一段
的大小。這個方法在沙盒裡可靠，也不需要真的把 7.9MB 下載下來。

**那一頁的坑，這裡也適用**：開場動畫從 `opacity:0` 開始的話，瀏覽器要等動畫跑完、元素真的看得見，
才算數「最大內容繪製」。第一屏最大的元素如果是文字又套了淡入，LCP 就被自己的動畫綁住——
實測 3.3 秒，改成只位移不淡入之後是 1.5 秒。這是第二節第 2 個坑（開場畫面不能等）的另一半：
不只是別等 JS，也別等自己的動畫。
