#!/usr/bin/env python3
"""
tools/sync_products.py
從 shop/products.json 自動同步商品資料到 yunnan.html 的「當季選物」區塊，
包含分類標籤、商品卡片、展開/收合操作按鈕，
並產生 shop/products.zh-cn.json 供簡體版前端即時讀取。
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS_JSON = ROOT / "shop" / "products.json"
PRODUCTS_CN_JSON = ROOT / "shop" / "products.zh-cn.json"
YUNNAN_HTML = ROOT / "yunnan.html"

try:
    from opencc import OpenCC
    converter = OpenCC("tw2sp")
except ImportError:
    converter = None


def format_price(variants):
    active_vars = [v for v in variants if v.get("active", True)]
    prices = [v["price"] for v in active_vars if "price" in v]
    if not prices:
        return ""
    min_p = min(prices)
    has_range = len(set(prices)) > 1
    return f"NT$ {min_p:,}" + (" 起" if has_range else "")


def generate_card_html(p, shop_prefix="shop/"):
    img_jpg = p.get("img", "")
    img_webp = img_jpg.replace(".jpg", ".webp") if img_jpg.endswith(".jpg") else img_jpg
    img_src = f"{shop_prefix}{img_jpg}"
    webp_src = f"{shop_prefix}{img_webp}"
    alt = p.get("imgAlt", p.get("name", ""))
    cat = (p.get("cat", "")).upper()
    name = p.get("name", "")
    intro = p.get("intro", p.get("origin", ""))
    price = format_price(p.get("variants", []))
    shelf = p.get("shelf", "season")
    ask = "到選購頁 →"

    return f'''        <a class="product reveal" href="{shop_prefix}" data-shelf="{shelf}">
          <div class="img-placeholder tea">
            <picture>
              <source srcset="{webp_src}" type="image/webp">
              <img src="{img_src}" alt="{alt}" width="800" height="1000" loading="lazy" decoding="async">
            </picture>
          </div>
          <div class="cat">{cat}</div>
          <h3>{name}</h3>
          <p class="origin">{intro}</p>
          <p class="price">{price}</p>
          <span class="ask">{ask}</span>
        </a>'''


def sync_yunnan_html():
    if not PRODUCTS_JSON.exists():
        print(f"錯誤：找不到 {PRODUCTS_JSON}", file=sys.stderr)
        return False
    if not YUNNAN_HTML.exists():
        print(f"錯誤：找不到 {YUNNAN_HTML}", file=sys.stderr)
        return False

    with open(PRODUCTS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    active_products = [p for p in data.get("products", []) if p.get("active", True)]
    all_count = len(active_products)
    season_count = sum(1 for p in active_products if p.get("shelf") == "season")
    always_count = sum(1 for p in active_products if p.get("shelf") == "always")

    # 產生簡體版 JSON
    if converter:
        cn_str = converter.convert(json.dumps(data, ensure_ascii=False))
        cn_data = json.loads(cn_str)
        with open(PRODUCTS_CN_JSON, "w", encoding="utf-8") as f:
            json.dump(cn_data, f, ensure_ascii=False, indent=2)
        print(f"已產出簡體版產品資料：{PRODUCTS_CN_JSON.name}")

    cards_html = "\n".join(generate_card_html(p) for p in active_products)
    
    block = f'''      <!-- PRODUCTS_START -->
      <nav class="filters reveal" aria-label="選物分類">
        <button type="button" class="filter active" data-shelf="all">全部 ({all_count})</button>
        <button type="button" class="filter" data-shelf="season">節令茶食 ({season_count})</button>
        <button type="button" class="filter" data-shelf="always">常備香染 ({always_count})</button>
      </nav>

      <!-- 品項與價格由 shop/products.json 自動同步；支援分類篩選與前端即時動態連動。 -->
      <div class="products is-collapsed" data-products-sync>
{cards_html}
      </div>

      <!-- 展開與選購操作（桌機與手機共用：預設呈現精選 6 款，可一鍵展開全部） -->
      <div class="products-actions reveal">
        <button type="button" class="svc-cta quiet btn-products-toggle" aria-expanded="false">
          展開全部 {all_count} 款當季選物 <span class="arrow">↓</span>
        </button>
        <a href="shop/" class="svc-cta">到選購頁看完整規格與訂購 →</a>
      </div>
      <!-- PRODUCTS_END -->'''

    content = YUNNAN_HTML.read_text(encoding="utf-8")

    if "<!-- PRODUCTS_START -->" in content and "<!-- PRODUCTS_END -->" in content:
        pattern = re.compile(r'<!-- PRODUCTS_START -->.*?<!-- PRODUCTS_END -->', re.DOTALL)
        new_content = pattern.sub(block.strip(), content, count=1)
    else:
        # 第一次替換：從標頭後方替換到說明文字之前
        pattern = re.compile(
            r'(<header class="section-rule">\s*<h2 class="h-section reveal">當季選物</h2>\s*</header>).*?'
            r'(<p class="lede lede-center reveal"[^>]*>以上為[^\n]*選購頁目前上架的品項)',
            re.DOTALL
        )
        if not pattern.search(content):
            print("警告：在 yunnan.html 中找不到目標區塊", file=sys.stderr)
            return False
        new_content = pattern.sub(rf'\1\n{block}\n      \2', content, count=1)

    YUNNAN_HTML.write_text(new_content, encoding="utf-8")
    print(f"已成功同步 {all_count} 項好物至 {YUNNAN_HTML.name}（結構化區塊）")
    return True


if __name__ == "__main__":
    success = sync_yunnan_html()
    sys.exit(0 if success else 1)
