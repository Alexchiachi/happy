# 舊 WordPress 網站資料庫（archive/wordpress/）

舊網站「大道至簡-簡家旗 Dao is simple」（WordPress，主機 Bluehost）的已發布文章與頁面，轉成 Markdown 與 WebP，當作新網站 daoissimple.com 的內容素材。

- **不會發布到網站**：本資料夾不在 `tools/build_site.sh` 的白名單裡。要把某篇放上網站，要另外做成網頁（例如幸福誌 `journal/`），並照 `DESIGN.md` 與 `NEW-PAGE.md` 的規範。
- **但在 GitHub 上公開**：happy 是公開倉庫。這裡只放舊站本來就公開的文章，以及被文章引用的圖片。
- **搬家的整體計畫以 `MOTHER-UPGRADE.md` 第 5 節為準**。本資料夾只提供資料，不另立計畫。

匯出日期：2026-11-25。

## 內容

```
archive/wordpress/
├── README.md                 本文件
├── posts/                    96 篇文章（post_type = post）
├── pages/                    27 個舊頁面（post_type = page），僅供重做頁面時參考文案
├── images/                   349 張 WebP，只收被 posts/ 或 pages/ 引用的圖
├── old-slug-redirects.txt    75 條：WordPress 改名前的中文網址 → 現在的拼音網址（Cloudflare _redirects 格式）
└── tools/                    產生這些檔案的轉換腳本（需要原始備份才能執行，見文末）
```

## 檔案格式

每篇一個 `.md` 檔，**檔名 = slug = 舊站網址**（`https://daoissimple.com/<slug>/`）。

```yaml
---
title: "2024年 幸福雲南夏令營"
date: "2024-04-12 16:11:02"          # 舊站當地時間（post_date）
slug: "2024nian-xingfuqicaiyunnanxialingying"
categories: ["親子"]                  # 只有 posts/ 有，可能是空陣列
tags: []                              # 只有 posts/ 有，可能是空陣列
cover: "../images/xxx.webp"           # 選填，舊站的精選圖片
description: "…"                      # 選填，只有 3 篇有
---
```

- 內文已去除 WordPress 區塊註解、短代碼與 HTML。單行換行是行尾的 `\`（CommonMark 硬換行）。
- 圖片用相對路徑 `../images/<檔名>.webp`，在 GitHub 上直接打開就看得到圖。
- 站內連結是根路徑，例如 `/lianluowo/`，指向舊站網址。改過名的舊 slug 已對應到新 slug。

**分類**（文章數）：教育 35、書 27、幸福 19、佛法 16、生活感想 11、幸福生活 9、藝術家 9、雲南 8、生命裡的幸福課 7、創業 7、幸福餐桌 5、哲學 4、稻田裡的餐桌 4、出租大叔 3、親子 2、社會創新 2、台味開箱 2、道德經 1、智慧 1。

## 怎麼轉出來的

- 來源是 WordPress 資料庫匯出檔（資料表前綴 `9Bv_`），只取 `post_status = publish` 且類型為 post 或 page 的資料。
- 分類和標籤取自 term 資料表；封面依 `_thumbnail_id` 找到附件；摘要用 Rank Math 描述，沒有的話用 post_excerpt。
- 圖片取自 `wp-content/uploads`，共 10,757 個檔案，處理規則：
  - 跳過 `-寬x高` 縮圖。
  - EWWW 的 `.jpg.webp` 副本與 `.bk.*` 備份，只有找不到原檔時才拿來代替。
  - `-scaled` 版本對應回原圖。
  - 轉成 WebP：品質 80，最長邊上限 2560px，已去除 EXIF（不含 GPS）。
  - 不同月份資料夾的同名檔，檔名加上 `-年-月`。
- 共挑出 579 張原圖。**沒被引用的 230 張刻意不放進這個公開倉庫**，只留在作者電腦上。

## 跟搬家計畫（MOTHER-UPGRADE 第 5 節）有關的事

1. **5.6 隱私權政策與服務條款的 WordPress 原文**，在 `pages/privacy-policy.md` 與 `pages/terms-of-service.md`。
2. **96 篇文章的舊網址還沒有去處。** 根目錄 `_redirects` 目前只有 9 條頁面轉址。舊文章網址 `/<slug>/`，加上 `old-slug-redirects.txt` 的 75 個中文舊網址，都沒有對應。Bluehost 停用（2027-02-26）後這些網址都會 404。要決定：做成幸福誌頁面、統一轉到 `/journal`，或兩者混用。這件事尚未決定，不要自行處理。
3. **`_redirects` 沒涵蓋的舊頁面**：`pages/` 裡下列頁面沒有轉址（那 9 條已涵蓋 guanyuzhenshidewo、anli-yu-renzheng、lianluowo、xingfufuwu、consulting、zuopinji、about-us、yunnandexiangqi、blog）：
   - `privacy-policy`、`terms-of-service`（5.6 要回 200）
   - `home`、`services`、`2026-2`、`7天內重大世界新聞`、`amazon-author-central`、`qiyexingfuguwenzaizuoshenme`、`shenmeshixingfu`、`xingfu-xingwei-yishu`、`xingfunengliangchuandi`
   - `大道至簡`、`幸福ai智能體公司`、`幸福法國`、`法國幸福代理`、`法國幸福代理-2`、`關於我的故事`、`雲南線香與藏香`
4. **16 個影音與 PDF 仍連到舊主機**（`hii.hdv.mybluehost.me/wp-content/uploads/…`：mp4、mov、mp3、m4a、PDF）。檔案只在作者電腦上的備份 zip 裡，Bluehost 停用前要搬走。
5. **3 個指向不存在頁面的連結**：`/幸福服務/`（在 `posts/amazon-zuozhezhuanye.md` 與兩個舊頁面）、`/聯絡我/`、`/去有風的地方-meet-yourself/`。這三頁在舊站沒有發布。

## 其他資料缺口

| 項目 | 篇數 |
|---|---|
| 沒有分類 | 3（`meng`、`mengzhixuyan`、`zuiheiandenayikeguangzhengzaiqishen`），由作者決定 |
| 沒有封面 | 3（`2026-nyfw-sustainability-social-innovation`、`daliyougecunzigailesancimingzi`、`2026-food-trend-social-innovation`） |
| 沒有 description | 93。可由 AI 起草，作者審核 |
| 沒有標籤 | 31 |

## 給 AI 的規則

- slug（檔名）不可更改，它對應舊網址。
- 不要刪除文章。要修改內文、補 description 或分類，走分支與 PR，由作者審核。
- 本資料夾只放 Markdown、WebP 與文字檔。不要在這裡放 `.html`：`tools/build_zhcn.py` 與 `tools/bump_assets.py` 會掃全倉庫的 `.html`。
- 原始備份 `localhost.sql`、`wp-content.zip` 含帳號、密碼雜湊與留言者 email，**永遠不可放進任何倉庫**。

## 轉換腳本（tools/）

`wp_to_markdown.py`（HTML → Markdown，只用標準函式庫）與 `archive_assets.py`（主腳本，需要 Pillow）。

只能在作者電腦上執行，因為需要原始備份：

```bash
python3 archive_assets.py localhost.sql wp-content.zip --root <輸出資料夾>
```

腳本的輸出結構是 `src/content/archive/`、`legacy-pages/`、`public/archive-images/`，圖片路徑寫成 `/archive-images/…`。本資料夾是整理過的版本：重新命名資料夾、圖片改成相對路徑、只留被引用的圖。**這裡的檔案已可直接編輯；重跑腳本會產生未整理的版本，不要直接覆蓋本資料夾。**
