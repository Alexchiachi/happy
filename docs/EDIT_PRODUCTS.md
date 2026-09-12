# 改商品卡

商品卡在 `yunnan.html` 與 `taiwan.html` 的 `<div class="products">` 裡面，
一張卡就是一個 `<a class="product">`。

## 改一張卡

直接改文字就好，**不用動 `href`**：

```html
<a class="product reveal" href="connect.html">
  <div class="img-placeholder tea" style="--img:url(images/檔名.jpg)"></div>
  <div class="cat">茶 · TEA</div>          <!-- 分類 -->
  <h3>易武正山 古樹春茶餅</h3>              <!-- 商品名 -->
  <p class="origin">雲南西雙版納 · 2024 春</p>  <!-- 產地・年份 -->
  <p class="price">NT$ 2,800 / 357g</p>    <!-- 價格 -->
  <span class="ask">寫信詢問 →</span>
</a>
```

訪客點卡片會到連繫頁，而且「想聊的事情」會自動填上商品名。
那個商品名是**點下去的當下從這張卡的 `<h3>` 讀出來的**，不是寫死在 `href` 裡——
所以你改了 `<h3>`，連結跟著就對了，沒有第二個地方要同步。

`href` 永遠就是 `connect.html`，不要自己加 `?item=`。

## 加一張卡

複製一張現成的貼上去，改上面那五個地方。`class` 一個都別動：

- `product` 是版型，`reveal` 是捲到才淡入
- `ask` 那一行是「可以點」的提示，拿掉的話卡片看起來會像不能點的
- `img-placeholder` 後面的 `tea`／`moss`／`dark` 是沒有照片時的底色

有照片：圖放進 `images/`，然後寫
`style="--img:url(images/你的檔名.jpg)"`。
沒有照片就留 `<div class="img-placeholder tea"><span>YUNNAN</span></div>`，
會顯示色塊。

## 刪一張卡

整個 `<a class="product">…</a>` 刪掉即可。

## 改完之後

```bash
python3 tools/build_zhcn.py    # 重建簡體版（會自動轉成簡體字）
python3 tools/bump_assets.py   # 只有改過 styles.css / scripts.js 才需要
```

簡體版**不要手動改** `zh-cn/` 底下的檔案，那是產生出來的，下次重建會被蓋掉。

## 價格要怎麼寫

繁體版寫台幣。簡體版的服務報價有另外一套人民幣價格，
寫在 `tools/build_zhcn.py` 的 `OVERRIDES` 裡。
商品目前兩邊都顯示台幣——要改成人民幣的話，把對照加進同一張表。
