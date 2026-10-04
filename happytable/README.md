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
| `table_rice-art-aerial_03` | P7058332_compressed.jpg | 金黃稻田被割出圖案，長桌沿著田間小路擺開，桌邊有許多小小的人影 | 已上線 |
| `table_farmland-curve_04` | PB302144_compressed.jpg | 一條鋪白布的長桌蜿蜒穿過收割後的田地，遠處有一棵樹 | 已上線 |
| `table_hilltop-arc_05` | PA041886_compressed.jpg | 山頂的草地上，長桌沿著山稜彎成一道弧線，賓客坐在桌邊，遠方是雲霧中的山谷 | 已上線 |
| `table_orchard-row_06` | P8170063_compressed.jpg | 果園裡一列鋪白桌巾的長桌，兩側是果樹，遠處有山 | 已上線 |
| `table_black-sand-storm_07` | P6220009_compressed.jpg | 黑白色調的海岸，長桌與白色椅子沿著黑色沙灘延伸，天空佈滿烏雲，桌上有一盞燈 | 已上線 |
| `table_onion-gate_08` | P2030163_compressed.jpg | 田野裡的長桌前，立著以樹枝紮成、掛著一束青蔥的門架 | 已上線 |
| `table_night-hands_09` | PA100600_compressed.jpg | 夜裡的山頂，長桌排成一列、點著燈，前方地上有手掌形狀的光影 | 已上線 |

- 挑選原則：沒有清楚入鏡的人臉（遠景小人影可以）。同一資料夾裡有清楚人臉的（例如敬酒、布置餐桌的近景）沒用。
- **待補**：每張的拍攝地點與年月。檔名因此沒有「區域」與「年月」，待簡家旗確認後再改。不要憑檔名的相機編號猜。
- 資料夾 51 張（含原檔）已全部看過；2026-10-04 第二輪換掉 5 張（玉米田、花田、黑沙灘石頭桌、湖畔夕陽、夜裡燈籠），換上稻田圖案俯瞰、農田彎道、山頂弧線、烏雲海岸、夜山手掌光影，讓場景更多樣（田、空拍、山、果園、海、門、夜）。
- 沒選但可留給相片欣賞頁的：玉米田（P4160421）、花田（P4128441、P4128431）、黑沙灘石頭桌（P6220014）、湖畔夕陽（P9190219）、燈籠夜（PA270328、PC010163）、紅磚古厝間的長桌（P9071321）、稻田白椅一列（P5170040）、餐具特寫（P1114166、P4198977、P8180303）。
- 有清楚人臉所以不用：敬酒（P9050098）、布置餐桌近景（P4128469）、玉米田晚餐（P4170714）、稻田圓桌近景（P8120590）、室內夜景（PB151142、P2145126、PC310156）。

## 還沒做

- 相片欣賞獨立頁（`happytable/gallery.html`）：放更多張、依年份或場域分組。
- 幸福誌新增「幸福餐桌」分類篩選，專欄首頁列出同分類文章。
- 搬 WordPress 文章時，與餐桌相關的併入這裡。
