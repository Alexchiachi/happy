#!/usr/bin/env python3
"""
替 shop/images/ 的照片產生較小的網頁格式，網頁優先載入，JPG 留作退路。

為什麼：PageSpeed 的「提升圖片傳送效能」。
- 商品照 name.jpg → name.webp（同尺寸 800×1000，約小 40%）
- 封面照 cover-*.jpg → cover-*.avif（同尺寸 900×1200，約小 35–40%）。
  封面細節多（藍花楹、草坡），轉 WebP 有時反而比 JPG 大，AVIF 才壓得下來。
  手機螢幕密度高，412 寬 × 2–3 倍還是會選 900 寬，所以不另做縮小版。

網頁怎麼用（products.json / stay.json 只寫 .jpg，其他格式的路徑由程式從 .jpg 推出來）：
- shop.js 商品卡：<picture> 先給 name.webp
- shop.js、anning.js、yunnan.html 封面：<picture> 先給 cover-x.avif
- 兩頁 HTML 的 <link rel="preload" type="image/avif"> 指向第一張封面

用法（在專案根目錄）：新增或換照片後執行
    python3 tools/make_web_images.py
需要 Pillow 11.3 以上（內建 AVIF）：pip install -U pillow
"""
import pathlib
import sys

try:
    from PIL import Image, features
except ImportError:
    sys.exit("需要 Pillow：pip install -U pillow")
if not features.check("avif"):
    sys.exit("這版 Pillow 不支援 AVIF：pip install -U pillow")

ROOT = pathlib.Path(__file__).resolve().parent.parent
IMAGES = ROOT / "shop" / "images"
SKIP = {"linepay-qr.jpg"}  # 收款碼放在確認信裡，信件只用 JPG


def main():
    n = 0
    for jpg in sorted(IMAGES.glob("*.jpg")):
        if jpg.name in SKIP:
            continue
        if jpg.name.startswith("cover-"):
            out, fmt, opts = jpg.with_suffix(".avif"), "AVIF", {"quality": 50}
        else:
            out, fmt, opts = jpg.with_suffix(".webp"), "WEBP", {"quality": 78, "method": 6}
        if out.exists() and out.stat().st_mtime >= jpg.stat().st_mtime:
            continue
        Image.open(jpg).convert("RGB").save(out, fmt, **opts)
        print("%-28s %4d KB → %4d KB" % (out.name, jpg.stat().st_size // 1024, out.stat().st_size // 1024))
        n += 1
    print("完成，產生 %d 張" % n)


if __name__ == "__main__":
    main()
