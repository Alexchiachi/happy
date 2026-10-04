# 幸福餐桌專欄（happytable/）

網址：`happytable/index.html`（簡體版 `zh-cn/happytable/index.html` 由 `tools/build_zhcn.py` 產生，不要手改）。
理念文字的來源與決定在根目錄 [`TABLE-IDEA-DRAFT.md`](../TABLE-IDEA-DRAFT.md)（簡家旗 2026-10-04 確認）。

## 寫這個專欄的規則

- **專欄文字不用「我」與「我們」。** 第三人稱、不帶人稱的寫法。引言署名「簡家旗」。
- **地區、場次、SROI 數字只以 `MOTHER-UPGRADE.md` 第 2 節事實表為準。**
- 「稻田裡的餐桌」名稱保留（組織名與 SROI 認證對象）；幸福餐桌是它的延伸：一棵樹與一片森林。
- 宜蘭第一張餐桌不點名合作農民。
- 標題與引言去標點（見 `DESIGN.md`）；樣式沿用 `styles.css` 既有元件（`.page-hero`、`.pull-quote`、`.article-body`、`.fact-list`、`.proof-grid`、`.photo-row`），沒有新增 CSS。
- 發布：`.github/workflows/pages.yml` 只複製 `happytable/*.html`，這份 README 不上網站。

## 照片

來源：Google 雲端硬碟「大道至簡｜網站素材／04_稻田裡的餐桌／作品／作品compressed_photos」，簡家旗自己的作品。
網頁用的檔案放 `images/happytable/`，長邊 1280（第一張 1600）、AVIF 加 JPG，用 `<picture>`。第一張不 lazy 並加 `fetchpriority="high"`。

| 網頁檔名（`images/happytable/`） | 雲端硬碟原檔 | alt（畫面上看得到的） | 狀態 |
| --- | --- | --- | --- |
| `table_rice-field-straw_01` | P8100008_compressed.jpg | 稻田裡，稻草捆圍著一條鋪白布的長桌，遠方是山與天空 | 已上線（首圖） |
| `table_rice-field-circle_02` | P8120609_compressed.jpg | 圓形的長桌繞著稻田中央，賓客圍坐一圈 | 已上線 |
| `table_orchard-row_03` | P8170063_compressed.jpg | 果園裡一列鋪白桌巾的長桌，兩側是果樹，遠處有山 | 已上線 |
| `table_cornfield-row_04` | P4160421_compressed.jpg | 玉米田之間一條白色長桌，兩側排滿白色折疊椅 | 已上線 |
| `table_flower-field_05` | P4128441_compressed.jpg | 開滿花的山坡上，一條蜿蜒的長桌沿著花田擺開 | 已上線 |
| `table_black-sand-beach_06` | P6220014_compressed.jpg | 黑色沙灘上，一條鋪著布、擺著石頭的長桌，面向大海 | 已上線 |
| `table_lakeside-dusk_07` | P9190219_compressed.jpg | 水邊的長桌在傍晚的逆光裡，桌上擺滿餐點，兩側是白色椅子 | 已上線 |
| `table_onion-gate_08` | P2030163_compressed.jpg | 田野裡的長桌前，立著以樹枝紮成、掛著一束青蔥的門架 | 已上線 |
| `table_lantern-night_09` | PA270328_compressed.jpg | 夜裡的田間，草堆之間點著燈籠，遠處的桌邊坐著人 | 已上線 |

- 挑選原則：沒有清楚入鏡的人臉（遠景小人影可以）。同一資料夾裡有清楚人臉的（例如敬酒、布置餐桌的近景）沒用。
- **待補**：每張的拍攝地點與年月。檔名因此沒有「區域」與「年月」，待簡家旗確認後再改。不要憑檔名的相機編號猜。
- 這 9 張是從已看過的 30 張挑的；資料夾約有 49 張，其餘尚未逐張檢視。

## 還沒做

- 相片欣賞獨立頁（`happytable/gallery.html`）：放更多張、依年份或場域分組。
- 幸福誌新增「幸福餐桌」分類篩選，專欄首頁列出同分類文章。
- 搬 WordPress 文章時，與餐桌相關的併入這裡。
