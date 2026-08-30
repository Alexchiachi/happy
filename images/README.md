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

## 待補：微信公眾號 QR

`connect.html` 的微信卡片已經接好 `images/wechat-qr.jpg`，**圖還沒放進來**。

放進來之前，卡片會自動顯示一個「微」字圓形標記（跟旁邊兩張卡同一套樣式），
所以看起來是完整的，不會破圖、也不會出現「待補」字樣。圖片一放進來就會自動變成 QR。

```bash
# 把微信後台下載的 QR 存成這個檔名，放進 images/
cd ~/Desktop/happy      # 換成你放專案的位置
# 建議先壓到 800px 左右
sips -Z 800 ~/Downloads/你下載的QR.jpg --out images/wechat-qr.jpg
git add images/wechat-qr.jpg && git commit -m "加入微信公眾號 QR" && git push
```

規格：正方形、`.jpg`、800px 以內、白底。QR 四周原本的留白（靜區）不要裁掉，
裁太緊會掃不到。

## 待補：主理人照片

`about.html` 的主理人區塊已經接好 `images/founder-jianchiachi.jpg`，**圖還沒放進來**。

放進來之前維持原本的茶褐色塊，不會破圖；檔案一放進來就會自動變成照片。

```bash
cd ~/Desktop/happy      # 換成你放專案的位置
sips -Z 1200 ~/Downloads/你的照片.jpg --out images/founder-jianchiachi.jpg
git add images/founder-jianchiachi.jpg && git commit -m "更新主理人照片" && git push
```

規格：直式 3:4、`.jpg`、寬度 1200px 左右、300KB 以內。版面用 `background-size: cover`
置中裁切，比例不是 3:4 也不會變形，但上下會被切掉一些——臉不要壓在畫面最上緣。

檔名要一模一樣（全小寫）。GitHub Pages 分大小寫，`Founder-...jpg` 會 404。

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

## 原始素材

行銷長圖、未裁切的原檔用 `-poster` 或 `-source` 結尾保留，例如
`yunnan-puer-gift-bag-poster.jpg`。網站實際用的是裁切過的
`yunnan-puer-gift-bag.jpg`。這樣之後要重新裁切還有原檔可用。

注意：行銷長圖通常把規格、價格燒在圖上，直接拿來當商品卡圖會和卡片本身的
HTML 文字重複。請只裁出照片區域。
