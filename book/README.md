# 我們不要就這樣算了，但也不要一直記得

幸福三部曲・首部曲｜損之卷・清淤　　簡家旗 著　／　大道至簡 DAO IS SIMPLE

## 目錄結構

```
book/
├── src/                 書稿原始檔（解壓後的 EPUB，可直接編輯、可 diff）
│   ├── mimetype
│   ├── META-INF/container.xml
│   └── OEBPS/
│       ├── content.opf   後設資料、manifest、spine
│       ├── nav.xhtml     目錄與 landmarks
│       ├── style.css     全書樣式
│       ├── f1–f2         總序、首部曲序
│       ├── c01–c10       正文十章
│       ├── b13–b15       後記、作者簡介、致謝
│       ├── colophon      版權頁
│       └── images/       封面
├── build.py             打包成 EPUB
└── *.epub               打包結果
```

改稿改 `src/`，不要改 `.epub` —— 那是產出物，每次重打包都會被覆蓋。

## 打包

```bash
python3 book/build.py
```

輸出是可重現的：同樣的 `src/` 打兩次會得到位元組完全相同的檔案，所以沒改東西就不會在 git 裡出現雜訊。

## 上架前檢查

兩個都要跑。epubqa 查的是通路規則與中文排版，epubcheck 查的是 EPUB 規格本身 ——
各通路（Readmoo、Apple、Google）上傳時跑的就是 epubcheck，它擋下來的東西 epubqa
不一定看得到。

```bash
python3 -m epubqa check "book/我們不要就這樣算了，但也不要一直記得.epub" --lang zh-Hant

npm install epubchecker
java -Dfile.encoding=UTF-8 \
  -jar node_modules/epubchecker/vendors/epubcheck-*/epubcheck.jar \
  "book/我們不要就這樣算了，但也不要一直記得.epub"
```

epubcheck 是 Java 程式，讀不動中文檔名時會回報 `File not found` 卻仍印出
「0 errors」—— 那不是通過，是根本沒讀到檔案。看到這行就先複製成英文檔名再跑。

目前狀態：epubqa **0 阻擋、0 錯誤、0 警告、0 建議**；epubcheck **0 fatals / 0
errors / 0 warnings**。

## 幾個刻意的決定

改稿時容易「順手修好」的地方，其實是想過才這樣寫的：

**不內嵌字型。** 中文字型檔動輒數百 KB，而 Readmoo、Kobo、mooInk 內建的繁中字型排版更好，也少一個審核變數。`style.css` 只列字體堆疊，結尾一定要留 `serif` / `sans-serif` 泛用字族 —— 少了它，指定字型不存在時中文會落到不含漢字的字型，變成一整片豆腐方塊。

**不寫死背景色與文字色。** `body` 沒有 `background` / `color`，交給閱讀器。設計的米底色放在 `@media (prefers-color-scheme: light)`，深色模式另有一整組。改配色時**兩組都要改** —— 只改一邊會在夜間模式變成深底深字或米底白字。

**沒有 `!important`。** 讀者在閱讀器裡選的字體、字級要能蓋過我們的設定。加了 `!important` 就鎖死了，Readmoo 審核也可能因此退件。

**不自動加 `text-indent`。** 本書段落靠 1.1em 下邊距分隔，不靠首行縮排。`text-indent` 會繼承到每一個區塊容器 —— 包括目錄的定寬編號和卦象線條 —— 把內容推出框外。

**`.numeral` 帶 `aria-hidden="true"`。** 章首那個大字「壹貳參」是浮水印，正下方的 `.chno` 已經用文字寫了「第一章」。標成裝飾才不會被螢幕閱讀器唸兩次，也才不必為它的低對比負責。

**目錄裡不放空標籤。** EPUB 3 導覽文件的內容模型比一般 XHTML 嚴格：`<nav>` 之內的 `<span>` 與 `<a>` 必須含有文字。曾經為了對齊，在沒有編號的條目放了空的 `<span class="tocnum"></span>`，被通路的 epubcheck 判為 6 個 RSC-005 錯誤、三家通路全部退件。要留空間就用 CSS —— `ol.toc a` 的 `padding-left` 配上 `.tocnum` 的負 `margin-left`，沒有編號的條目自然就對齊到標題起點。

**配色須符合 WCAG AA。** `content.opf` 宣告了 `wcag-aa`，那就得是真的：一般文字對比度至少 4.5:1。在米底 `#EDE8DC` 上，這代表文字色不能比 `#6E675B` 更淺。
