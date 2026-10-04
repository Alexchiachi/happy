#!/usr/bin/env python3
"""
短說明段落排版：一句一段，長句在逗號處斷行。文字一字不動，只改排版。

規則與適用範圍見 DESIGN.md「短說明段落：一句一段」。

做什麼：
  掃描根目錄的 *.html，把「短說明段落」的 <p> 內文拆成
  <span class="s">一句</span>，句子太長就在逗號（沒有逗號就在頓號）處加 <br>。
  .s 的樣式在 styles.css（display:block、句與句之間 0.5em、text-wrap: pretty）。

哪些段落會被處理：
  1. 指定的 class（lede、door-desc、service-desc、book-desc、hero-tagline、proof-label、
     reveal）：每行字數上限看 CLS 表。
  2. 沒有 class、不超過 90 字、至少兩句的短段落（例如卡片摘要、常見問題回答）。
  不處理：含 HTML 標籤的段落（連結、粗體、已經處理過的）、含括號或「。」」的段落、
  privacy.html、cases.html 的長導言、journal/ 內文、zh-cn/。

用法（改完繁體頁、要新增短說明時）：
    python3 tools/format_short_text.py          # 只印出會改哪些，不寫檔
    python3 tools/format_short_text.py --write  # 寫入
    python3 tools/build_zhcn.py                 # 重建簡體版

可重複執行：已處理過的段落含 <span>，會被略過。
沒有逗號、又太長的句子（斷在詞中間會很難看）請加進下面的 MANUAL，手動選自然的斷點（用 | 分行）。
改了每行字數上限之後，要先把 HTML 還原再跑（已處理過的不會重排）。
"""
import glob
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP_FILES = {"404.html", "inner-flow.html", "privacy.html"}
PLAIN_SKIP = {"cases.html"}  # 沒有 class 的短段落不處理的頁面
# class → 每行最多幾字（句子超過才換行）。手機約 17–19 字寬，所以上限都不大
CLS = {
    "lede reveal": 17, "lede lede-center reveal": 17, "lede": 17, "reveal": 19,
    "door-desc": 16, "service-desc": 16, "hero-tagline reveal": 14,
    "book-desc": 16, "proof-label": 16,
}
PLAIN_MAX = 19
# 沒有標點又太長的句子：手動指定斷點（| 分行）
MANUAL = {
    "我們從在地職人手中選回每一件能說土地故事的物。": "我們從在地職人手中選回|每一件能說土地故事的物。",
    "我們從中精選每一件能承載這份厚度的物。": "我們從中精選|每一件能承載這份厚度的物。",
    "簡家旗十四年從金融投資轉身、走入泥土稻田與山林田野的心境清淤之作。": "簡家旗十四年從金融投資轉身、|走入泥土稻田與山林田野|的心境清淤之作。",
    "2012 年發起的台灣產地到餐桌引領計畫。": "2012 年發起的|台灣產地到餐桌引領計畫。",
    "把它們整理成你願意留在生活裡的好物與好事。": "把它們整理成|你願意留在生活裡的好物與好事。",
}


def sentences(t):
    return re.findall(r"[^。？！]+[。？！]?", t)


def split2(line, maxw):
    """逗號切完仍太長的行，再在頓號處切。"""
    if len(line) <= maxw + 4 or "、" not in line:
        return [line]
    out, cur = [], ""
    for q in re.findall("[^、]+、?", line):
        if cur and len(cur) + len(q) > maxw + 2:
            out.append(cur)
            cur = q
        else:
            cur += q
    if cur:
        out.append(cur)
    return out


def lines(sent, maxw):
    if sent in MANUAL:
        return MANUAL[sent].split("|")
    if len(sent) <= maxw:
        return [sent]
    seps = "，：；" if re.search("[，：；]", sent) else "、"
    if seps == "、" and "、" not in sent:
        return [sent]
    out, cur = [], ""
    for p in re.findall("[^" + seps + "]+[" + seps + "]?", sent):
        if cur and len(cur) + len(p) > maxw:
            out.append(cur)
            cur = p
        else:
            cur += p
    if cur:
        out.append(cur)
    res = []
    for l in out:
        res += split2(l, maxw)
    return res


def render(t, maxw):
    ss = [s.strip() for s in sentences(t) if s.strip()]
    return "".join('<span class="s">' + "<br>".join(lines(s, maxw)) + "</span>" for s in ss)


def main():
    write = "--write" in sys.argv
    total = 0
    for f in sorted(glob.glob(str(ROOT / "*.html"))):
        name = Path(f).name
        if name in SKIP_FILES:
            continue
        t = Path(f).read_text(encoding="utf-8")
        cnt = 0

        def sub(m):
            nonlocal cnt
            attrs, inner = m.group(1) or "", m.group(2)
            cm = re.search(r'class="([^"]*)"', attrs)
            cls = cm.group(1) if cm else None
            if "<" in inner:
                return m.group(0)
            txt = re.sub(r"\s+", " ", inner).strip()
            if not txt or "。」" in txt or "（" in txt:
                return m.group(0)
            ns = len([s for s in sentences(txt) if s.strip()])
            if cls in CLS:
                if ns < 2 and len(txt) <= CLS[cls] + 4:
                    return m.group(0)
                maxw = CLS[cls]
            elif cls is None and ns >= 2 and len(txt) <= 90 and name not in PLAIN_SKIP:
                maxw = PLAIN_MAX
            else:
                return m.group(0)
            cnt += 1
            return f"<p{attrs}>" + render(txt, maxw) + "</p>"

        t2 = re.sub(r"<p((?:\s[^>]*)?)>(.*?)</p>", sub, t, flags=re.S)
        if cnt:
            print(f"{name}: {cnt} 段")
            total += cnt
            if write:
                Path(f).write_text(t2, encoding="utf-8")
    print(f"共 {total} 段" + ("（已寫入）" if write else "（試跑，沒有寫檔；加 --write 才會寫入）"))


if __name__ == "__main__":
    main()
