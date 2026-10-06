---
version: 1
name: 大道至簡 Dao is simple
description: 像一本在產地讀的書。米白紙底、墨色字、一個茶褐強調色，大量留白，宋體中文配義大利體英文。介面退後，讓土地、物與人說話；沒有陰影、沒有圓角、沒有漸層裝飾，每頁用一方朱印收尾。
scope: 品牌站（根目錄 *.html、journal/、zh-cn/，樣式在 styles.css）。shop/、anning/ 共用同一組色票（shop/shop.css），版型各自獨立。一人商業閉環旗艦導引頁（另一個倉庫）刻意不照這份走，例外寫在文末「例外」一節。
reference: 結構與寫法參考 VoltAgent/awesome-design-md 的 Apple DESIGN.md，取其「介面退後、單一強調色、17px 內文、系統唯一的例外要寫明」的紀律，不取其外觀。

colors:
  paper: "#FAF6EF"        # 主畫布，米白紙
  paper-deep: "#F2EBDF"   # 第二層紙，hover、按下、輪播底
  ink: "#2A2520"          # 所有標題與內文
  ink-soft: "#4A423A"     # 段落、說明
  mist: "#736C63"         # 輔助字、英文副標、浮水印（對 paper 4.81:1）
  line: "#D9D1C2"         # 1px 細線、分隔、卡片框
  tea: "#82663F"          # 雲南／全站強調色（對 paper 4.97:1）
  moss: "#547050"         # 台灣強調色（對 paper 5.12:1）
  seal: "#A8543A"         # 朱印。只用在印章、否定清單的 ✕、錯誤訊息
  accent: "{colors.tea}"  # 由 <body class="region-*"> 切換

typography:
  font-display: '"Cormorant Garamond", "Noto Serif TC", serif'   # 英文、數字、價格、eyebrow
  font-body: '"Noto Serif TC", "Songti TC", "PingFang TC", serif'
  font-han: '"Noto Serif TC", "Songti TC", serif'                # 中文標題、按鈕、標籤
  body:        { size: 17px, weight: 400, lineHeight: 1.85 }
  article:     { size: 1.05rem, weight: 400, lineHeight: 2.05 }
  lede:        { size: 1.2rem, weight: 400, lineHeight: 1.8, color: ink-soft }
  hero-title:  { size: "clamp(3.2rem, 9vw, 7rem)", weight: 200, letterSpacing: 0.12em }
  region-title: { size: "clamp(8rem, 22vw, 18rem)", weight: 200, letterSpacing: 0.05em, lineHeight: 0.95 }
  page-hero-h1: { size: "clamp(3rem, 7vw, 5rem)", weight: 200, letterSpacing: 0.15em }
  h-section:   { size: "clamp(1.6rem, 3vw, 2.2rem)", weight: 400, letterSpacing: 0.08em }
  h-card:      { size: 1.35rem, weight: 400, letterSpacing: 0.04em }
  pull-quote:  { size: "clamp(1.6rem, 3.5vw, 2.6rem)", weight: 300, letterSpacing: 0.1em, lineHeight: 1.6 }
  eyebrow:     { family: font-display, size: 0.78rem, weight: 500, letterSpacing: 0.4em, transform: uppercase, color: accent }
  en-subtitle: { family: font-display, style: italic, color: mist, letterSpacing: 0.05em }

spacing:
  s-1: 0.5rem
  s-2: 1rem
  s-3: 1.5rem
  s-4: 2.5rem
  s-5: 4rem
  s-6: 6rem
  s-7: 9rem
  s-8: 12rem
  flow-s: 4rem    # 段與段之間只用這三個
  flow-m: 8rem
  flow-l: 12rem

layout:
  container: 1240px
  container-narrow: 760px
  gutter: "clamp(1.25rem, 5vw, 3rem)"

rounded:
  none: 0         # 全站預設。卡片、按鈕、圖片、輸入框都是直角
  full: 50%       # 只有兩個例外：連繫卡的圓形字標、輪播暫停鍵

motion:
  ease: "cubic-bezier(0.19, 1, 0.22, 1)"
  dur: 720ms          # 進場、敘事（捲到才發生）
  dur-chrome: 320ms   # 導覽列、手風琴
  dur-ui: 180ms       # hover、按下
  press-scale: 0.97   # 按鈕按下；圖片卡 0.985

components:
  svc-cta:        { border: "1px solid {colors.tea}", color: tea, font: font-han, size: 0.9rem, letterSpacing: 0.25em, padding: 12px 28px, hover: "填滿 tea、字轉 paper" }
  svc-cta-quiet:  { border: "1px solid {colors.line}", color: mist, hover: "字與框轉 tea，不填滿" }
  submit:         { background: ink, color: paper, padding: 14px 36px, hover: "背景轉 tea" }
  service-card:   { border: "1px solid {colors.line}", background: paper, padding: "4rem 2.5rem", hover: "框轉 tea、底轉 paper-deep" }
  product-card:   { image: "4:5", cat: "font-display 0.75rem tea uppercase", price: "font-display 1rem", ask: "寫信詢問 →" }
  svc-chapter:    { grid: "1fr 1fr", image: "4:3", table: svc-table, alternate: ".flip" }
  seal:           { size: 88px, border: "2px solid {colors.seal}", color: seal, background: "rgba(168,84,58,0.04)", text: "兩行各兩字" }
  nav:            { position: fixed, scrolled: "paper 86% + blur(20px) saturate(180%) + 底線 line" }
---

# 大道至簡 DESIGN.md

給 AI 與設計協作者看的「長什麼樣子」說明。`CLAUDE.md` 管怎麼做事，這份管畫面。
數值以 `styles.css` 為準；兩邊不一致時，改 CSS 的人要回來改這份。

## Overview 總覽

大道至簡的網頁像**一本在產地讀的書**，不是一間店。

米白的紙（`paper`）、墨色的字（`ink`）、一個茶褐色的強調（`tea`），加上大量留白。
中文標題用細的宋體（Noto Serif TC 200–300），字距拉開；英文用 Cormorant Garamond 義大利體當副標，像書裡的旁註。
介面盡量退後，讓土地、物與做事的人說話。每頁最後蓋一方朱印收尾。

**核心特徵**
- **紙與墨**：沒有純白、沒有純黑。畫布是 `#FAF6EF`，字是 `#2A2520`，看起來是印的，不是發光的。
- **一頁一個強調色**：雲南頁與全站用茶褐 `tea`，台灣頁用苔綠 `moss`，由 `<body class="region-*">` 切換 `--accent`。同一頁不同時出現兩個地區色（首頁的雲南 × 台灣對照是唯一例外）。
- **朱印是唯一的紅**：`seal` 只用在印章、否定清單的 ✕、表單錯誤訊息。不拿來當按鈕或連結。
- **直角與細線**：沒有圓角、沒有陰影。層次靠 1px 的 `line` 細線、`paper` 與 `paper-deep` 兩層紙色，以及留白。
- **細字大字**：越大的中文字越細。頁首大字 weight 200，段落標題 400，從不用粗體當標題。
- **中英雙軌**：每個中文標題底下可以有一行英文義大利體（`.en`、`.service-en`），是低語，不是翻譯。
- **慢**：進場淡入 720ms，但互動回饋只有 180ms。敘事可以慢，回應不能慢。

## 從 Apple 學什麼，不學什麼

參考 Apple 的 DESIGN.md（VoltAgent/awesome-design-md），借它的**紀律**，不借它的**外觀**。

| 借來的原則 | 在大道至簡的樣子 |
|---|---|
| 介面退後，讓主角說話 | 主角是產地照片、人物、文字，不是按鈕與框 |
| 只有一個強調色 | 一頁一個 `--accent`，所有可點的東西都用它 |
| 內文 17px，不是 16px | `body { font-size: 17px }`，閱讀速度而非掃描速度 |
| 用表面變化分段，不加裝飾 | 用 `paper` / `paper-deep`、1px 細線與留白分段 |
| 系統唯一的例外要寫明 | 圓角只有兩處、紅色只有朱印、陰影只有照片上的字 |
| 按下要有回饋 | `:active` 縮放 0.97、清單連結透明度 0.55 |
| 毛玻璃只用在功能上 | 捲動後的導覽列 `blur(20px) saturate(180%)` |
| 標題字距是品牌聲音 | Apple 收緊（負字距）；我們**放開**（中文 0.05–0.15em） |

**不學的**：黑白交替的全版磚塊、藍色膠囊按鈕、無襯線字體、粗體 600 標題、18px 大圓角卡片。那是科技產品的語言，不是土地的語言。

## Colors 色彩

### 紙（表面）
- **Paper** `#FAF6EF`：所有頁面的底。
- **Paper Deep** `#F2EBDF`：第二層紙。卡片 hover、按下、輪播載入前的底色。
- **Card** `#FFFDF8`：只在 `shop/`、`anning/` 的表單卡片使用。

### 墨（文字）
- **Ink** `#2A2520`：標題、內文。
- **Ink Soft** `#4A423A`：段落、說明文字。
- **Mist** `#736C63`：英文副標、編號、價格旁的產地、頁尾小字。對 paper 4.81:1，剛好過 WCAG AA；不要再調淡。

### 強調
- **Tea 茶褐** `#82663F`：雲南與全站。按鈕框、eyebrow、表格標籤、連結 hover。
- **Moss 苔綠** `#547050`：台灣。用法與 tea 相同，只在台灣頁或台灣相關元素。
- **Seal 朱印** `#A8543A`：印章、否定清單 ✕、錯誤訊息。
- **Line** `#D9D1C2`：所有 1px 細線、卡片框、次要按鈕框。

### 照片佔位色塊
沒有照片時用 `.img-placeholder.tea / .moss / .dark` 的漸層色塊，搭 `.v2`–`.v8` 換角度與光斑，讓相鄰的色塊不重複。
這是**全站唯一允許的漸層**，而且只是照片的替身。有真實照片就換成 `<img>`，色塊留在底下當 404 的退路。

### 無障礙
- `prefers-contrast: more`：`mist` 加深到 `#595248`（7:1）、`line` 加深到 `#B5AB98`、導覽列拿掉毛玻璃。
- `prefers-reduced-transparency`：導覽列改實色 `paper`。
- 新增顏色前先算對比。文字對 `paper` 至少 4.5:1。

## Typography 字體

### 字族
- **Noto Serif TC**（`font-han` / `font-body`）：所有中文。標題、內文、按鈕、標籤。
- **Cormorant Garamond**（`font-display`）：英文副標、eyebrow、編號、價格、頁尾英文。常用義大利體。
- 從 Google Fonts 載入：`Cormorant Garamond 300/400/500/400i` + `Noto Serif TC 200/300/400/500`。**不要加其他字體**，尤其是無襯線體。

### 層級

| 用途 | class | 大小 | 字重 | 字距 |
|---|---|---|---|---|
| 地區大字（雲南／台灣） | `.region-title` | clamp(8rem, 22vw, 18rem) | 200 | 0.05em |
| 首頁大標 | `.hero-title` | clamp(3.2rem, 9vw, 7rem) | 200 | 0.12em |
| 內頁大標 | `.page-hero h1` | clamp(3rem, 7vw, 5rem) | 200 | 0.15em |
| 引言 | `.pull-quote q` | clamp(1.6rem, 3.5vw, 2.6rem) | 300 | 0.1em |
| 服務章節標題 | `.svc-chapter h2` | clamp(1.8rem, 3.5vw, 2.6rem) | 300 | 0.05em |
| 段落標題 | `.h-section` | clamp(1.6rem, 3vw, 2.2rem) | 400 | 0.08em |
| 卡片標題 | `.h-card` / `.service-title` | 1.35–1.4rem | 400 | 0.04–0.05em |
| 導言 | `.lede` | 1.2rem / 1.8 | 400 | — |
| 內文 | `body` | 17px / 1.85 | 400 | — |
| 文章內文 | `.article-body` | 1.05rem / 2.05 | 400 | — |
| Eyebrow | `.eyebrow` | 0.78rem | 500 | 0.4em、大寫 |
| 英文副標 | `.en` | 0.95–1.1rem | 400 義大利體 | 0.05em |

### 原則
- **越大越細**：大字 200，中字 300，小字 400。標題不用 600 以上。唯一的 500 在 eyebrow、頁尾欄位標題、印章。
- **中文字距放開**：標題 0.05–0.15em，按鈕 0.15–0.25em，eyebrow 0.4em。這是「慢」在字上的樣子。
- **行高寬鬆**：內文 1.85，文章 2.05。不要低於 1.75。
- **標題 `text-wrap: balance`，段落 `pretty`**：避免一行只剩一個字。
- **短說明一句一段**：兩三句的短說明，每句一段、長句在逗號處斷行，不斷在詞中間。細則見下一節「短說明段落：一句一段」。
- **標題與引言不留標點**：h1、h2 和 `.pull-quote q` 裡的逗號、頓號、分號、冒號改成留白 `<i class="gap"> </i>`（不要用 `<span>`，`.img-placeholder span` 會把它當浮水印），句號刪掉；引言每個句子一行，用 `<br>` 分。問號、驚嘆號、書名號、引號保留。內文與卡片小標題照常用標點。`:has(.gap)` 的標題只在留白處斷行。`<title>`、meta、og 文字不動，維持可讀的標點。
- **置中的 eyebrow 要補負 margin**：`letter-spacing` 會讓最後一個字後面多一格，`margin-right: -0.4em` 抵銷。

### 短說明段落：一句一段 `.s`

短的說明文字（兩三句、不超過約 90 字）一律**一句一段、長句在逗號處斷行**，讓人一眼掃得完。**只改排版，文字一字不動。**

- **一句一段**：每個句子（以「。？！」結尾）放進 `<span class="s">`。`.s` 是區塊，句與句之間空 0.5em。
- **長句斷行**：句子超過每行上限時，在逗號、冒號、分號處用 `<br>` 換行；沒有這些標點才在頓號處換。每行上限：導言 `.lede` 17 字、一般 19 字、卡片說明（`.door-desc`、`.service-desc`、`.book-desc`、`.proof-label`）16 字、`.hero-tagline` 14 字。手機一行約 17–19 字，上限就是照這個定的。
- **不斷在詞中間**：「生活提／案」「研發／中」這種斷法不行。沒有標點又太長的句子，手動選自然的斷點（見工具的 `MANUAL`），例如「我們從在地職人手中選回／每一件能說土地故事的物。」。
- **不留孤字**：`.s` 用 `text-wrap: pretty`。截圖或量測確認沒有只剩一兩個字（含句號）獨占一行。
- **適用**：頁首導言、卡片與門卡的說明、書籍簡介、常見問題的回答、數字下方的說明、頁尾品牌說明、道情物說明、幸福誌卡片摘要。
- **不適用**：文章內文與長敘事（`.article-body`、關於頁的三個轉彎）、法律條文（`privacy.html`）、含連結或粗體的段落、商品的單句說明、含引號內句號的段落。這些照一般段落排。
- **做法**：新增或改了短說明之後，跑 `python3 tools/format_short_text.py`（先試跑，確認後加 `--write`），再跑 `python3 tools/build_zhcn.py`。工具可重複執行，已處理的段落會略過。手寫時照同樣的結構：`<p class="…"><span class="s">第一句。</span><span class="s">第二句，<br>第二句後半。</span></p>`。
- **等高**：並排卡片的說明行數不同時，要留同樣高度，標題與按鈕才對得齊（例：首頁 `.door-desc` 的 `min-height`）。
- **檢查**：桌面 1280 與手機 390 兩個寬度各看一次，確認沒有橫向捲動、沒有詞被斷開、沒有孤字。

### 文章內文：短中長的節奏

文章要讀起來有節奏，像聽一首歌：句子與段落有長短起伏，**短、中、長交錯**。現在多數讀者注意力短，整篇都是長段，或整篇都是碎短句，都會累；有起伏，眼睛和呼吸才有地方停、有地方走。（簡家旗 2026-10-06 確認的寫法。）

- **一段一個節拍**。段落有三種長度，交替使用：短（一句，約 20 字以內）、中（兩句，約 40 至 70 字）、長（三四句，約 80 至 110 字）。數字只是參考，重點是交錯。
- **不連續**：不要連著三段以上同一種長度；長段之後常接一句短的收束，像歌的停頓。
- **開頭與結尾**：開頭短中長漸入，結尾用短句或中句收，不拖長尾巴。
- **金句要標出來**：每篇約 3 至 6 句能單獨成立的句子，用引言樣式（`blockquote`）單獨成行，不要連續出現，也不要全篇都是。
- **不是越短越好**：把一個節拍硬拆成碎句，和一整坨長段一樣沒有節奏。
- **檢查**：把每段標成 S／M／L 排成一行，看有沒有連續三個相同、結尾是否有收束，再朗讀一遍，換氣的位置要自然。
- 這一節管文章內文；卡片、導言這類短說明照上一節「一句一段」。

## Layout 版面

### 間距
- 元件內用 `--s-1`～`--s-8`（0.5rem → 12rem）。
- **段與段之間只用三個值**：`--flow-s` 64px、`--flow-m` 128px、`--flow-l` 192px。節奏由 `.section` / `.section-tight` 持有，元件不自帶上下內距，否則會疊加。

### 容器
- `.container` 最寬 1240px，`.container.narrow` 760px（文字為主的段落、引言、FAQ、表單）。
- 左右留白 `--gutter: clamp(1.25rem, 5vw, 3rem)`。

### 格線
- 三欄：服務卡、商品卡、三扇門、三元（手機變一欄；商品卡手機兩欄）。
- 兩欄交錯：服務章節 `.svc-chapter`（圖文各半，`.flip` 左右對調）、文章精選、人物（5:7）。
- 五欄：地區主題字「茶 菌 香 染 器」（手機兩欄）。
- **無縫格**：`.doors`、`.triad`、`.themes` 用 `gap: 1px` + `background: var(--line)`，讓格子之間只剩一條細線。這是我們版本的 Apple「表面變化就是分隔」。

### 留白哲學
留白不是空，是讓人停下來的地方。首頁大標區佔滿一屏（`100svh`），地區頁 80%，內頁大標上方 9rem。
一個段落只說一件事；說完就留白，不要急著接下一個區塊。

## Elevation 層次

| 層次 | 做法 | 用在 |
|---|---|---|
| 平 | 無框、無影 | 所有段落、頁首、頁尾 |
| 細線 | 1px `line` | 服務卡、表格、段落標頭底線、頁尾頂線 |
| 第二層紙 | `paper-deep` | hover、按下、無縫格的格子 |
| 毛玻璃 | `paper` 86% + blur | 捲動後的導覽列，唯一一處 |

**沒有 box-shadow。** 唯一的陰影是 `text-shadow`，用在壓在照片或色塊上的白字，讓它在任何底色上都描得出邊。

**壓在照片上的封面標題要量對比。** 照片亮度不一（白桌巾、天空、夕陽），暗罩不夠深，白字會跟背景混在一起。有照片的封面（`.cover-title`、`.has-title` 且含 `<picture>`）用較深、中央最深的暗罩；新增封面照片後，把標題區最亮處（取 95 百分位）與紙色算對比，要在 4.5:1 以上。

**封面與卡片標題不折出單獨一個字。** 標題字級由 `styles.css` 依封面寬度自動縮（container query），前提是每個標題帶 `style="--n:最長詞組字數"`。新增文章或改標題後執行 `python3 tools/set_title_fit.py --write`，再跑 `tools/build_zhcn.py`。12 字以內的詞組不拆行。

## Shapes 形狀
- **一律直角。** 卡片、按鈕、圖片、輸入框、印章都是 0 圓角。
- 例外只有兩個圓：連繫卡的圓形字標（`.icon-mark`）、輪播暫停鍵（`.carousel-pause`）。不要新增第三個。
- 圖片比例：商品 4:5、服務章節與文章卡 4:3、人物 3:4、地區輪播 3:4（手機 4:5）、文章內圖 3:2。

## Components 元件

### 導覽列 `.nav`
固定在頂端，一開始透明無底線；捲動後（`.scrolled`）變成半透明紙色 + 毛玻璃 + 底線，內距縮小。
品牌名「大道至簡」中文 + 小字英文 `Dao is simple`（tea、大寫）。選單字距 0.12em，目前頁與 hover 以一條 tea 細線從左長出。
860px 以下收成「≡」，命中區撐到 45×44。最後一項是語言切換「简体」。

### 按鈕
- **`.svc-cta` 主要**：tea 細框、tea 字、中文字距 0.25em、直角。hover 填滿 tea、字轉紙色。文字以「 →」結尾（「我想去 →」「寫信問問 →」）。
- **`.svc-cta.quiet` 次要**：line 框、mist 字；hover 只換色不填滿。兩顆並排時第二顆一定是 quiet。
- **送出鈕**：墨底紙字，hover 轉 tea。整站唯一的實心按鈕，只給「送出」。
- **按下**：`scale(0.97)`，180ms。減少動態時取消縮放，但保留顏色回饋。

### 服務卡 `.service`（首頁）
細框直角，上方英文編號（01、02…mist），中文標題，英文義大利體副標（tea），一句描述。整張是連結，指向 `services.html#錨點`。

### 服務章節 `.svc-chapter`（服務頁）
圖文兩欄交錯。文字側順序固定：英文副標 → 1–3 段文字 → `.svc-table` 資訊表 → `.svc-cta` → 需要時一行延伸連結。
資訊表左欄是 tea 色中文標籤（形式、費用、天數、地點、對象、安排），字距 0.15em、佔 30%。**價格一律寫在表裡，不寫進段落。**

### 商品卡 `.product`
4:5 圖、分類（英文大寫 tea：`茶 · TEA`）、品名、產地（義大利體 mist）、價格（Cormorant）、底部「寫信詢問 →」。
整張是連結；hover 圖片放大 1.02、品名轉 tea。「寫信詢問」用 `margin-top: auto` 貼齊同列底部。

### 人物 `.portrait`
3:4 人像 + 名字（字距 0.1em）+ 身分（義大利體 tea）+ 引言（左側 2px tea 直線，weight 300）+ 一段註記。「物的背後是人」是品牌核心，每個地區頁至少一位。

### 引言 `.pull-quote`
置中，上下各一條 60px 的 tea 短線，中文 weight 300，歸屬用義大利體 mist。一頁最多一段。

### 下一步 `.next-step`
讀到頁底的出口。頂線 + eyebrow「Next · 下一步」+ 一句安靜的話 + 一到兩顆按鈕。**語氣是邀請，不是推銷。**

### 印章 `.seal`
每頁的最後一個區塊。88px 方框、2px 朱紅框、極淡朱紅底，兩行各兩字（「雲南／選物」「體驗／幸福」），下方一行英文義大利體。

### 表單 `.letter-form`
只有底線的輸入框（像在信紙上寫字），標籤 tea 色中文字距 0.2em。聚焦時底線轉 tea；鍵盤聚焦另加 2px 外框。
成功訊息 moss、錯誤訊息 seal。按鈕下方一句說明個資去向並連到隱私權政策。

### 照片輪播 `.carousel`
直式 3:4，淡入淡出 1.4s，每 5.5 秒換一張，照片同時從 1.06 慢慢縮回 1（7 秒）。控制列在照片**下方**不蓋照片：細線圓點 + 圓形暫停鍵。網路照片要附侵權聲明。

## Voice 文字語氣
畫面的「少」要跟文字的「少」一致。
- 短句，一句一件事。「住下來，慢下來，看見自己。」
- 用否定來定義：「不是觀光，不是打卡。」「我們不教 KPI，我們聊使命。」
- 具體的人與物，不用形容詞堆疊：寫「茶人、染布師、廚娘」，不寫「頂級在地達人」。
- 按鈕用第一人稱的願望：「我想去 →」「我想談談 →」，不寫「立即購買」「馬上預約」。
- 不用驚嘆號、不用 emoji、不寫限時優惠。
- 繁體版用台灣用字；簡體版由 `tools/build_zhcn.py` 產生，不要手改 `zh-cn/`。

## Do's and Don'ts

### Do
- 用 `var(--token)`，不要在 HTML 或 CSS 裡直接寫色碼。
- 地區頁用 `<body class="region-yunnan|region-taiwan">` 決定強調色。
- 每個中文標題考慮配一行英文義大利體副標。
- 新頁面結尾放 `.next-step` 與 `.seal`。
- 所有 hover 包在 `@media (hover: hover) and (pointer: fine)` 裡，另外補 `:active`。
- 動態效果都要有 `prefers-reduced-motion` 的關閉版本。
- 照片用 `<img>` 放在 `.img-placeholder` 裡，寫具體的 `alt`，寬高寫上，第一屏以外 `loading="lazy"`。
- 新增元件時先問：能不能用細線、紙色、留白解決？
- 短說明（兩三句）一句一段、長句在逗號處斷行，用 `.s`，文字不動；跑 `tools/format_short_text.py`。

### Don't
- 不要把短說明排成一整坨，也不要讓詞被斷在中間（「生活提／案」）。
- 不要加圓角、陰影、漸層背景。
- 不要用粗體（600+）當標題，不要用無襯線字體。
- 不要在同一頁同時用 tea 和 moss 當強調（首頁對照區除外）。
- 不要把 `seal` 朱紅拿來做按鈕或連結。
- 不要用實心按鈕，除非是表單送出。
- 不要把 `mist` 調得更淡，它已經在對比底線上。
- 不要讓元件自帶上下內距，節奏交給 section。
- 不要加 icon 字型、插圖、貼圖、彩色標籤。需要圖示時，用一個中文字放在細框裡（例如連繫頁的「信」「賴」「臉」）。

## Responsive 響應式

| 斷點 | 變化 |
|---|---|
| ≤ 860px | 導覽列收成 ≡；三扇門變一欄 |
| ≤ 820px | 地區頁開場改成字在上、照片在下，照片滿版 |
| ≤ 760px | 服務卡、服務章節、文章、人物、三元變一欄；商品卡兩欄；主題字兩欄；頁尾兩欄 |
| ≤ 600px | 連繫卡變一欄 |

- 大字都用 `clamp()`，不另寫斷點。
- 觸控目標至少 44×44（導覽 ≡、連繫按鈕、輪播控制）。
- 高度用 `svh`，手機網址列展開收起時不會跳動。
- 手機上有些說明不同（例如掃 QR Code），用 `(pointer: coarse)` 切換 `.only-touch` / `.only-pointer`。

## 例外：一人商業閉環旗艦導引頁

`Alexchiachi/Dao-Is-Simple-The-Open-System-Series-`
（線上：<https://alexchiachi.github.io/Dao-Is-Simple-The-Open-System-Series-/>）
是大道至簡的另一個對外頁面，**刻意不照這份規範**。寫在這裡，免得下一個人以為它壞了、跑去「修正」。

品牌站是一本在產地讀的書，讀者可以慢慢翻；那一頁是一份要在螢幕前讀完並做決定的提案，
對象是 38–55 歲的創辦人與高階主管，全部的路都通往同一張審核申請表。兩者的節奏不同，
所以視覺也不同。

| | 這份規範 | 旗艦導引頁 |
| --- | --- | --- |
| 底色 | 米白紙 `#FAF6EF` | 近白 `#FBFBFD`，另有一整套深色主題 |
| 強調色 | 茶褐 `#82663F` | 赤陶 `#8D5B4C`（深色 `#CE8E79`） |
| 形狀 | 一律直角、沒有陰影 | 12px 圓角、膠囊按鈕、卡片有陰影 |
| 標題字重 | 越大越細（200–300） | 700 |
| 字距 | 中文放開 0.05–0.15em | 標題收緊 −0.012～−0.018em |
| 深色模式 | 沒有做 | 有，涵蓋系統偏好／指定淺／指定深三種狀態 |

**共通的部分**（這些不是例外，兩邊一致）：宋體是主要視覺、內文 17px 起跳、行高不低於 1.75、
hover 包在 `@media (hover: hover) and (pointer: fine)` 並另外補 `:active`、
每個動態都有 `prefers-reduced-motion` 的關閉版本、文字對比至少 4.5:1、
按鈕與連結的可見文字就是它的名稱。

效能與品質照 [`NEW-PAGE.md`](NEW-PAGE.md)：中文字型自己放子集（7.9MB → 310KB）、
等 `load` 之後才載入、第一屏不等 JS 也不從 `opacity:0` 開始（那一頁的進場動畫原本從
`opacity:0` 起，LCP 被自己拖到 3.3 秒，改成只位移之後是 1.5 秒——同樣的坑值得記在這裡）。
它的 `tools/subset_fonts.py` 是這裡這一支的單頁版本，不需要 playwright。

2026-09-27 由使用者決定維持現狀。要收斂成同一套視覺的話，那是重做那一頁的視覺，
不是改幾個 token——先問使用者。

## Iteration Guide 給 AI 的做法
1. 先讀這份，再讀 `styles.css` 裡對應的元件。能用既有 class 就不要新寫。
2. 一次只改一個元件，說清楚用了哪個 token。
3. 新顏色、新圓角、新陰影，一律先問使用者。
4. 新增或改了短說明（導言、卡片說明、常見問題回答），跑 `python3 tools/format_short_text.py --write`，再跑 `tools/build_zhcn.py`。
5. 改完繁體版跑 `python3 tools/build_zhcn.py`；改了 `styles.css` 或 `scripts.js` 跑 `tools/bump_assets.py` 更新版本號。
6. 猶豫要不要加東西時，選擇不加。大道至簡。

## Known Gaps 尚未定案
- 服務頁與多數商品還是色塊佔位，實景照片的調色原則（暖、低飽和、自然光）尚未寫成規範。
- 深色模式沒有做，目前只有紙色版本。
- `shop/`、`anning/` 共用色票但版型獨立，尚未併入這份的元件清單。
- 旗艦導引頁（見上一節「例外」）自成一套；兩套要不要收斂成一套，尚未決定。
