#!/usr/bin/env python3
"""
產生「只含用到的字」的 Noto Serif TC 子集，兩組各自獨立：
  ・雲南好物（shop/）與安寧幸福之家（anning/）→ shop/fonts/
  ・幸福餐桌課程頁（executive-table/，繁＋簡）→ executive-table/fonts/（Cloudflare 只發布 executive-table/ 裡的檔案，
    所以要放在自己的資料夾；檔名帶內容雜湊，可以長期快取）

為什麼：Google Fonts 把 Noto Serif TC 切成一百多段，瀏覽器依頁面上出現的字下載，
這兩頁每個字重要抓約 30 段、約 2MB，三個字重就是 6MB 上下。字型不擋畫面，
但在手機網路上會把頻寬塞滿，封面照與程式都排在後面（PageSpeed 手機分數 55／70 的主因）。
改成自己放子集字型：每個字重只含這兩頁實際出現的字，總共兩三百 KB。

怎麼做：
1. 用無頭瀏覽器打開兩頁（等資料載入完），逐一讀出每段中文實際用哪個字重（含隱藏的完成畫面）。
   JS 裡的提示文字、products.json／stay.json 的內容一律再加進 400。
2. 依字重向 Google Fonts 要子集（css2 的 text= 參數，一次最多約 500 字，所以分段）。
3. 下載 woff2，寫出該組的 fonts.css（頁面等 load 之後才載入它）。

什麼時候要重跑：改了頁面文案、商品或房型（products.json、stay.json）之後。
沒重跑也不會壞——子集裡沒有的字會用系統明體補上，只是那幾個字字形略有不同。

用法（在專案根目錄）：
    python3 tools/subset_fonts.py                   # 兩組都重做
    python3 tools/subset_fonts.py executive-table   # 只做課程頁那組（引數比對 out 資料夾）
需要：Node 的 playwright（npm i -g playwright）與 Chromium；
Chromium 路徑可用環境變數 CHROME_PATH 指定。

字型授權：SIL Open Font License 1.1（各組資料夾裡的 OFL.txt），允許子集化與自行託管。
"""
import functools
import hashlib
import http.server
import json
import os
import pathlib
import re
import subprocess
import sys
import threading
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
TARGETS = [
    {
        "out": "shop/fonts", "label": "shop/、anning/",
        "pages": ["shop/", "anning/"],
        # 動態出現的文字（錯誤訊息、完成畫面、合計）不一定在畫面上，直接把原始檔的字都算進 400
        "extra": ["shop/shop.js", "shop/products.json", "anning/anning.js", "anning/stay.json"],
        "hashed": False,
    },
    {
        "out": "executive-table/fonts", "label": "executive-table/（繁、簡）",
        "pages": ["executive-table/", "executive-table/zh-cn/"],
        # 程式寫進頁面的文字（試算金額、表單訊息、幻燈片說明）只取 <script> 裡的字，避免把 CSS 註解也算進去
        "extra_scripts": ["executive-table/index.html", "executive-table/zh-cn/index.html"],
        "hashed": True,
    },
]
WEIGHTS = (300, 400, 500)          # 各頁 CSS 實際用到的字重；600 以上會用 500 顯示
BASE = "".join(chr(c) for c in range(0x20, 0x7F)) + "，。、：；！？「」『』（）…—～・％＋－×／"
CHUNK = 480
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

EXTRACT_JS = r"""
const { chromium } = require(process.env.PW_MODULE);
(async () => {
  const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const out = {};
  for (const url of JSON.parse(process.env.PAGES)) {
    for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const p = await b.newPage({ viewport: vp });
      await p.goto(process.env.BASE_URL + url, { waitUntil: 'networkidle' });
      const r = await p.evaluate(() => {
        const o = {};
        const add = (el, s) => {
          const cs = getComputedStyle(el);
          if (!/Noto Serif TC/.test(cs.fontFamily.split(',')[0])) return;
          const w = cs.fontWeight; o[w] = (o[w] || '') + s;
        };
        const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n; while ((n = tw.nextNode())) if (n.parentElement) add(n.parentElement, n.data);
        document.querySelectorAll('[placeholder]').forEach((el) => add(el, el.placeholder));
        document.querySelectorAll('option').forEach((el) => add(el.parentElement || el, el.textContent));
        return o;
      });
      for (const [w, s] of Object.entries(r)) out[w] = (out[w] || '') + s;
      await p.close();
    }
  }
  await b.close();
  process.stdout.write(JSON.stringify(out));
})().catch((e) => { console.error(e); process.exit(1); });
"""


def pw_module():
    root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True).stdout.strip()
    mod = pathlib.Path(root) / "playwright"
    if not mod.exists():
        sys.exit("需要 Node 的 playwright：npm i -g playwright")
    return str(mod)


def rendered_chars(pages):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    env = dict(os.environ, PW_MODULE=pw_module(), PAGES=json.dumps(pages),
               BASE_URL="http://127.0.0.1:%d/" % srv.server_address[1])
    try:
        res = subprocess.run(["node", "-e", EXTRACT_JS], capture_output=True, text=True, env=env)
    finally:
        srv.shutdown()
    if res.returncode:
        sys.exit("讀取頁面文字失敗：\n" + res.stderr[-2000:])
    return json.loads(res.stdout)


def nearest(w):
    return min(WEIGHTS, key=lambda x: (abs(x - w), -x))


def google_subset(weight, text):
    url = "https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@%d&text=%s" % (
        weight, urllib.parse.quote(text))
    css = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA})).read().decode()
    faces = re.findall(r"url\((\S+?)\).*?unicode-range: ([^;]+);", css, re.S)
    if len(faces) != 1:
        sys.exit("Google Fonts 回傳 %d 個檔案（預期 1 個），text 可能太長：字重 %d" % (len(faces), weight))
    return faces[0]


def build(t):
    out = ROOT / t["out"]
    per = {w: set(BASE) for w in WEIGHTS}
    for w, s in rendered_chars(t["pages"]).items():
        per[nearest(int(float(w)))] |= set(s)
    for f in t.get("extra", []):
        per[400] |= set((ROOT / f).read_text(encoding="utf-8"))
    for f in t.get("extra_scripts", []):
        html = (ROOT / f).read_text(encoding="utf-8")
        per[400] |= set("".join(re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)))

    out.mkdir(exist_ok=True)
    for old in out.glob("noto-serif-tc-*.woff2"):
        old.unlink()
    lic = ROOT / "shop" / "fonts" / "OFL.txt"
    if out != lic.parent:
        (out / "OFL.txt").write_bytes(lic.read_bytes())
    css = ["/* 由 tools/subset_fonts.py 產生，不要手改。只含 %s 用到的字；授權見 OFL.txt */" % t["label"]]
    total = 0
    for w in WEIGHTS:
        chars = "".join(sorted(c for c in per[w] if c.isprintable() and c not in "\t\r\n"))
        for i in range(0, len(chars), CHUNK):
            src, urange = google_subset(w, chars[i:i + CHUNK])
            data = urllib.request.urlopen(src).read()
            name = "noto-serif-tc-%d-%d%s.woff2" % (
                w, i // CHUNK, "." + hashlib.md5(data).hexdigest()[:8] if t["hashed"] else "")
            (out / name).write_bytes(data)
            total += len(data)
            css.append("@font-face { font-family: 'Noto Serif TC'; font-style: normal; font-weight: %d; "
                       "font-display: swap; src: url(%s) format('woff2'); unicode-range: %s; }" % (w, name, urange.strip()))
        print("字重 %d：%d 字" % (w, len(chars)))
    (out / "fonts.css").write_text("\n".join(css) + "\n", encoding="utf-8")
    print("完成：%s/ 共 %d KB" % (t["out"], total // 1024))


def main():
    want = sys.argv[1:]
    for t in TARGETS:
        if not want or any(a.strip("/") in t["out"] for a in want):
            build(t)


if __name__ == "__main__":
    main()
