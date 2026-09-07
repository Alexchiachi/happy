# 內耗熵值檢測（inner-flow）

一支獨立的線上檢測工具，跟大道至簡品牌站放在同一個 repo，但**不共用版型、
樣式或建置流程**。它有自己的 Tailwind、自己的一套五語系切換、自己的後端與金流。

公開網址：<https://alexchiachi.github.io/happy/inner-flow/>

## 這個資料夾裡有什麼

| 路徑 | 是什麼 |
|---|---|
| `index.html` | 檢測頁本體。Tailwind 已預先編譯內嵌，單檔即可運作 |
| `guide/7day-guide.html` | 《七日指南》PDF 的排版原稿 |
| `downloads/inner-flow-7day-guide.pdf` | 上面那份的成品，頁面直接提供下載 |
| `images/` | 這支工具專用的 favicon 與 OG 圖 |
| `server/` | AI 生成後端（TypeScript）。依三維度分數生成《自洽躍遷破局手冊》 |
| `wordpress/` | WordPress 外掛版本，含 Gumroad 授權碼驗證與報告生成 |
| `docs/` | Gumroad 上架清單、Google 表單收件腳本 |
| `tools/` | 兩支建置腳本，見下 |

## 要改東西的話

**改了頁面裡的 Tailwind class** —— 內嵌的 CSS 是編譯出來的，不會自動更新：

```bash
./inner-flow/tools/build-inner-flow-css.sh
```

**改了七日指南的內容** —— 重新產生 PDF：

```bash
node inner-flow/tools/build-guide-pdf.js
```

（這支腳本會把中文字體子集內嵌進 PDF。不這樣做的話，Chromium 列印時會靜靜地
退回系統預設字型，整份中文排版走樣。）

**接後端** —— 見 `server/README.md`，部署完把網址填進 `index.html` 的 `API_BASE`。

## 跟品牌站的關係

**大道至簡不再連到這裡。**導覽列與頁尾的入口都拿掉了，兩邊各自獨立招客。
`sitemap.xml` 也分開，由根目錄的 `robots.txt` 一起指出去——搜尋引擎照樣
找得到，但收錄是分開的。

只剩一條線還牽著：**這裡的隱私權連結指回 `../privacy.html`**。
那份政策本身就寫了這支工具會蒐集哪些資料（能量原型、內耗熵值、答案碼、
送出時間），同一個經營者共用一份政策是正常做法。
真的要完全切開的話，得另外寫一份只講這支工具的隱私權政策——那是法務決定，
不是整理檔案的決定，所以留著沒動。

品牌站的 `tools/build_zhcn.py`（繁簡建置）把這個資料夾整個跳過，
因為它自己就有一套語系切換。

## 舊網址

搬家前的網址是 `…/happy/inner-flow.html`，已經對外流通過。
根目錄留了一個同名的轉址殼（`noindex` + 轉到這裡），確定沒人再從舊網址進來之後可以刪。
