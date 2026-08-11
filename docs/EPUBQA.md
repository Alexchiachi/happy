# epubqa — 電子書上架前檢查、修正與優化

零依賴的 Python CLI（只用標準函式庫，Python 3.8+，無需 pip install）。
針對 **英文 / 繁體中文 / 簡體中文 / 日文 / 韓文** 五種語言，
對齊 **Amazon KDP、Apple Books、Google Play Books、Rakuten Kobo** 的規則。

## 快速開始

```bash
python3 -m epubqa check book.epub                    # 檢查
python3 -m epubqa fix book.epub --dry-run            # 預覽修正
python3 -m epubqa fix book.epub -o book-fixed.epub   # 自動修正
python3 -m epubqa optimize book.epub -o final.epub   # 瘦身
python3 -m epubqa batch dist/ -o reports/            # 多語版批次比對
```

產生示範用的測試書（五語言，內含刻意植入的缺陷）：

```bash
python3 tools/make_fixtures.py fixtures/
python3 -m epubqa check fixtures/sample-zh-Hant.epub
```

## 指令

### `check` — 檢查，不修改任何東西

```
--format {text,json,markdown,html}   輸出格式（預設 text）
-o, --output PATH                    寫入檔案
--lang {en,zh-Hant,zh-Hans,ja,ko}    指定語言，略過自動偵測
--only structure metadata …          只跑指定類別
--skip typography                    略過指定類別
--epubcheck epubcheck.jar            同時執行官方 EPUBCheck 並合併結果
--strict                             有警告即以非零狀態結束（給 CI 用）
-v, --verbose                        顯示所有建議說明
```

離開碼：`0` 通過、`1` 有錯誤、`2` 有阻擋上架項、`3` 檔案讀不開。

### `fix` — 自動修正

```
-o, --output PATH      輸出路徑（預設 <原檔名>-fixed.epub）
--dry-run              只列出會改什麼，不寫檔
--no-typography        不動標點與引號
--no-a11y              不補無障礙 metadata
--no-convert           不修繁簡轉換錯誤
```

修正後會自動重跑檢查，顯示 前→後 的數字對照。
**原始檔案永遠不會被覆寫**，一律輸出新檔。

### `optimize` — 瘦身

移除孤兒檔案、作業系統垃圾檔，並以正確的 OCF 結構重新封裝。
封面、字型、NCX、spine 內的文件永遠不會被移除。
需要外部工具的有損優化（圖片重壓、字型子集化）只會**報告機會**，不會擅自執行。

### `batch` — 多語版一致性

檢查目錄下所有 EPUB，並額外比對：識別碼是否重複、五語版是否齊備、
封面是否忘了在地化、各語版字數比例是否合理（用於偵測漏譯整段）。

## 檢查類別

| 類別 | 代號 | 內容 |
|:---|:---|:---|
| `structure` | `STRUCT-*` | OCF 容器、mimetype、manifest/spine、nav、內部連結、XML 合法性 |
| `metadata` | `META-*` | 標題、ISBN 檢查碼、語言標籤、作者排序鍵、日期、封面宣告、固定版面 |
| `language` | `LANG-*` | 語言宣告與內文是否相符、繁簡混用、轉換陷阱、跨語言文字混入 |
| `typography` | `TYPO-*` | 各語標點規範、引號、刪節號、破折號、斷行 CSS |
| `assets` | `ASSET-*` | 封面尺寸比例格式、CMYK/漸進式 JPEG、圖片大小、字型授權與體積 |
| `accessibility` | `A11Y-*` | EPUB Accessibility 1.1 / WCAG 2.2 AA、歐盟 EAA |
| `stores` | `STORE-*` | 各平台專屬規則 |

## 嚴重度

| 等級 | 意義 |
|:---|:---|
| **阻擋上架** | 平台會退件，或讀者裝置上完全無法閱讀 |
| **錯誤** | 不會退件但讀者看得見，會反映在評價上 |
| **警告** | 品質或商業損失（例如 KDP 傳送費） |
| **建議** | 可做可不做的優化 |

## 設計原則

**修正只做確定安全的事。** 標點轉換只在中日韓上下文中觸發，引號轉換用狀態機
逐段重置，繁簡修正只做人工整理過的整詞替換表。單字的簡→繁批次轉換**不會**自動
執行——那需要語意判斷，工具只報告位置，交由人工處理。

**不會有損改動素材。** 圖片不會被重新壓縮，字型不會被改動。這類優化只會報告
機會與建議指令，由你決定。

**原檔不動。** 所有寫入操作都輸出新檔。

**離線可用。** 只用標準函式庫，沒有網路請求，沒有安裝步驟。

## CI 整合

```yaml
- name: EPUB pre-launch check
  run: |
    python3 -m epubqa check dist/book-zh-Hant.epub --strict
    python3 -m epubqa batch dist/ -o reports/
```

## 測試

```bash
python3 -m unittest discover -s tests -v
```

## 已知限制

- 圖片與字型的**內容**不會被檢查，只讀檔頭與體積。色彩對比、圖片在電子紙上的
  灰階表現需要人工確認。
- 繁簡轉換陷阱表是人工整理的常見案例，不是完整字典。
- 語言偵測依據字集統計，極短的內容（少於數十字）會回報信心不足而非硬猜。
- 翻譯品質（語意、語氣、術語一致性）不在本工具範圍內；`batch` 只能從字數比例
  提示「可能漏譯」。
- 平台規則會變動。上架前請以各平台當下的官方文件為準。
