# images/

網站用的照片都放這裡。

## 怎麼把照片掛到頁面上

在對應的 `.img-placeholder` 加一個 `--img` 變數就好，不用改 HTML 結構：

```html
<!-- 沒掛圖：維持原本的色塊 -->
<div class="img-placeholder tea"><span>YUNNAN</span></div>

<!-- 掛上照片 -->
<div class="img-placeholder tea" style="--img:url(images/yunnan-puer-gift-bag.jpg)"></div>
```

沒有設定 `--img` 的區塊會自動維持原本的漸層色塊，所以可以一張一張慢慢換，不會開天窗。

掛上真實照片時，通常把裡面的 `<span>` 標籤拿掉（那是佔位符用的角落文字）。

## 照片規格

| 項目 | 建議 |
| --- | --- |
| 格式 | `.jpg`（照片）、`.png` 只用在需要透明背景時 |
| 寬度 | 1600px 以內 |
| 檔案大小 | 200–400KB |
| 命名 | 全小寫、用連字號，例如 `yunnan-puer-gift-bag.jpg` |

各區塊的裁切比例（照這個比例裁，畫面才不會被裁掉重點）：

| 用途 | 比例 |
| --- | --- |
| 商品卡 `.product` | 4:5（直式） |
| 職人照 `.portrait` | 3:4（直式） |
| 文章卡 `.article-card`、服務章節 | 4:3（橫式） |

## 壓縮方式

macOS 內建：

```bash
sips -Z 1600 原圖.jpg --out 壓好的.jpg
```

或用線上工具 [squoosh.app](https://squoosh.app)（拖進去、選 MozJPEG、品質 75 左右、下載）。
