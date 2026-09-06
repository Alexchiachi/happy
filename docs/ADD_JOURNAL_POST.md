# 如何新增一篇幸福誌文章

每篇文章要動兩個地方：

1. **文章本體** — 在 `journal/` 資料夾裡新增一個 HTML 檔
2. **列表卡片** — 在 `journal.html` 加一張卡，連到那個檔

沒有資料庫、沒有後台、不用安裝任何東西。複製、改字、上傳，就這樣。

---

## 步驟一：建立文章檔

複製 `journal/_template.html`，另存成新檔名，放在同一個 `journal/` 資料夾裡。

**檔名規則**（很重要，這會變成網址）：

```
年-月-英文短名.html
```

例如：

| 文章 | 檔名 |
| --- | --- |
| 大理蒼山下的老茶倉 | `2026-04-dali-tea-warehouse.html` |
| 節氣穀雨泡新茶 | `2026-04-guyu-new-tea.html` |
| 宜蘭三星的稻田 | `2026-05-yilan-rice-field.html` |

- 全部小寫，用 `-` 連接，**不要有中文、空格、底線**
- 中文檔名在網址裡會變成一長串亂碼，也容易在某些主機上失效
- 檔名一旦公開就別再改 —— 改了舊連結會壞掉

打開新檔案，會看到 `①` 到 `⑧` 的註解標記，照著改就好：

| 標記 | 改什麼 |
| --- | --- |
| ① | 瀏覽器分頁標題 |
| ② | 摘要（給 Google 和社群分享用） |
| ③ | 首圖色塊與構圖變化 |
| ④ | 分類 · 年月 |
| ⑤ | 文章大標（壓在首圖正中央） |
| ⑥ | 開場摘要 |
| ⑦ | 作者、閱讀時間 |
| ⑧ | 內文 |

**標題是壓在首圖上的，一律排成最多兩行。** 字級要跟著標題長度選，在 `<h1>` 上加一個 class：

| class | 標題長度（全形字） | 桌機字級 |
| --- | --- | --- |
| `t-xl` | 12 字以內 | 3.9rem |
| `t-lg` | 13–17 字 | 3.3rem |
| `t-md` | 18–21 字 | 2.8rem |
| `t-sm` | 22 字以上 | 2.3rem |

**預設不要加 `<br>`**，交給版面自動平衡左右兩行。只有在自動斷點把詞切壞
（例如把「一炷香」拆成「一／炷香」）時，才在標點處手動加一個 `<br>`。
加完一定要在瀏覽器確認——較長那行如果超出寬度，會變成三行。

**構圖變化**：色塊後面可以再加 `v2`～`v6`（不加就是預設）。同色系的文章請用不同的變化，
而且內頁封面要跟 `journal.html` 那張卡片用同一組，點進去才接得上。

**分類請從這四個裡挑一個**（要跟 `journal.html` 上方的篩選列一致）：
生活提案 ／ 產地故事 ／ 選物筆記 ／ 二地對話

---

## 步驟二：寫內文

內文區塊在 `<div class="article-body">` 和 `</div>` 之間。可用的東西：

```html
<p>一般段落。每段用一組 p 標籤包起來。</p>

<h2>大標，用來分章節</h2>

<h3>小標，茶褐色</h3>

<blockquote>
  想被記住的一句話。
  <cite>— 說話的人 · 地點</cite>
</blockquote>

<ul>
  <li>條列第一點</li>
  <li>條列第二點</li>
</ul>

<figure>
  <div class="img-placeholder moss"><span>PHOTO</span></div>
  <figcaption>圖說。</figcaption>
</figure>

<hr>   <!-- 三顆點的分隔 · · · -->
```

間距、行高、字級都由 `styles.css` 自動處理，**不要自己加 `style=""` 調間距**，會跑掉。

---

## 步驟三：放照片（可選）

沒有照片也沒關係 —— 版面用的是色塊，本來就長得好看。

有照片的話：

1. 圖片放進根目錄的 `images/` 資料夾
2. 檔名一樣用小寫英文和 `-`
3. 建議寬度 1600px 以內，JPG，壓到 300KB 以下（圖太大網站會變慢）
4. 把色塊那行改成帶 `--img` 的寫法：

```html
<!-- 原本（色塊） -->
<div class="img-placeholder tea article-cover reveal"><span>JOURNAL</span></div>

<!-- 改成（真照片） -->
<div class="img-placeholder article-cover reveal" style="--img: url('../images/dali-warehouse.jpg');"></div>
```

> 注意路徑前面的 `../` —— 文章在 `journal/` 資料夾裡，要往上一層才找得到 `images/`。
> 這樣寫的好處：萬一圖片沒上傳成功，會自動露出底下的色塊，不會開天窗。

三種色塊可選：`tea`（雲南・茶褐）、`moss`（台灣・苔綠）、`dark`（墨黑）。

---

## 步驟四：加到列表

打開 `journal.html`，找到 `<div class="article-list">`。那裡有一塊註解寫著怎麼做。把這段貼在最上面（最新的文章排最前）：

```html
<a href="journal/2026-05-你的檔名.html" class="article-card reveal">
  <div class="img-placeholder moss has-title">
    <div class="cover-inner">
      <div class="meta">產地故事 · 2026.05</div>
      <h3>文章標題</h3>
    </div>
    <span>TAIWAN</span>
  </div>
  <p>兩三句摘要，跟文章開頭的 lede 可以一樣。</p>
</a>
```

`has-title` 是「標題壓在色塊上」，不要拿掉。色塊後面可再加構圖變化 `v2`–`v6`，
要跟內頁封面用同一組。

注意外層是 `<a>` 不是 `<article>` —— 這樣整張卡片都可以點。

**想換首頁那篇精選文章**：改 `journal.html` 上方 `<article class="article-feature">` 區塊的標題、摘要，還有「繼續閱讀 →」的 `href`。

---

## 步驟五：預覽

上傳前先在自己電腦上看一眼。打開「終端機」，貼上：

```bash
cd ~/Desktop/happy      # 換成你放專案的位置
python3 -m http.server 8080
```

然後瀏覽器開 <http://localhost:8080/journal.html>。按 `Control + C` 停掉。

**要檢查的三件事**：

- [ ] 從 journal.html 點得進文章
- [ ] 文章裡「← 回幸福誌」點得回去
- [ ] 手機寬度也正常（瀏覽器視窗拉窄看看）

---

## 改過 CSS 或 JS 之後

`styles.css` 和 `scripts.js` 的引用網址後面帶著內容雜湊（`styles.css?v=c88e1ba5`）。
只改 HTML 不用管它；但**只要動到 CSS 或 JS，推上去之前一定要跑**：

```bash
python3 tools/bump_assets.py
```

它會重算雜湊並更新所有 HTML 的引用。

不跑會怎樣：舊訪客（尤其手機）拿到的是「新的 HTML ＋ 快取住的舊 CSS」，
新樣式沒有對應規則，版面會壞掉——而且他們不會知道要清快取。

## 步驟六：上線

```bash
cd ~/Desktop/happy
git add .
git commit -m "新增文章：大理蒼山下的老茶倉"
git push
```

推上去之後 GitHub Pages 大約 **1～2 分鐘**會更新。網址是：

```
https://alexchiachi.github.io/happy/journal/你的檔名.html
```

看不到更新的話，多半是瀏覽器快取 —— 用 `Shift + 重新整理` 強制重載。

---

## 常見狀況

**文章打開變成沒有樣式的白底黑字**
`../styles.css` 的 `../` 掉了。文章在子資料夾裡，一定要有 `../`。

**點進去 404**
`journal.html` 裡的 `href` 跟實際檔名對不上。檢查大小寫 —— GitHub Pages 分大小寫，`Dali.html` 和 `dali.html` 是兩個不同的檔案。

**照片沒出現**
路徑錯，或檔名大小寫不符。先確認 `images/` 裡真的有那個檔。

**文字擠在一起／間距怪怪的**
檢查是不是漏了 `</p>` 或 `</div>` 的收尾標籤。

**想一次寫好幾篇**
文章之間互不影響，複製模板複製幾次都可以，最後一起 commit。
