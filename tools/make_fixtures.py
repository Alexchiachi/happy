#!/usr/bin/env python3
"""Generate sample EPUBs — one per language — with deliberate, documented defects.

Used by the test suite and as a demo corpus: every defect planted here maps to a
check in ``epubqa/checks``, so ``epubqa check`` on these files should light up.

    python3 tools/make_fixtures.py fixtures/
"""

from __future__ import annotations

import os
import struct
import sys
import zipfile
import zlib

CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

NAV = """<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"{lang}>
<head><title>{toc_label}</title></head>
<body>
<nav epub:type="toc" id="toc"><h1>{toc_label}</h1>
<ol><li><a href="chap1.xhtml">{ch1}</a></li><li><a href="chap2.xhtml">{ch2}</a></li></ol>
</nav>
</body></html>
"""

CHAPTER = """<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"{lang}>
<head><title>{title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<h1>{title}</h1>
{body}
</body></html>
"""

OPF = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">{identifier}</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:creator>{creator}</dc:creator>
{language}
    <dc:publisher>幸福餐桌出版</dc:publisher>
{extra_meta}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="chap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="chap2.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="cover" href="cover.jpg" media-type="image/jpeg"{cover_props}/>
  </manifest>
  <spine>
    <itemref idref="nav"/>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>
"""

BASE_CSS = """body { margin: 0 1em; }
p { margin: 0.4em 0; }
"""


def make_jpeg(width: int, height: int, cmyk: bool = False) -> bytes:
    """Minimal syntactically valid JPEG header — enough for header-only checks."""
    components = 4 if cmyk else 3
    sof = b"\xff\xc0" + struct.pack(">H", 8 + components * 3)
    sof += b"\x08" + struct.pack(">HH", height, width) + bytes([components])
    for i in range(components):
        sof += bytes([i + 1, 0x11, 0])
    return b"\xff\xd8" + b"\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + sof + b"\xff\xd9"


# --------------------------------------------------------------- per-language

BOOKS = {
    "en": dict(
        filename="sample-en.epub",
        title="The Happiness Table",
        creator="Chia-Chi Chien",
        language="en",
        toc_label="Contents",
        ch1="Chapter 1: Terroir",
        ch2="Chapter 2: The Ritual",
        # Defects: straight quotes, double spaces, three dots, hyphen range.
        body1="""<p>"This is not a crop," she said.  "It is a memory you can carry home."</p>
<p>The pine forest of Chengde has held this rhythm for 1990-2020, unchanged...</p>
<p>Every guest becomes a co-creator, not a customer. That's the whole idea.</p>""",
        body2="""<p>Summer dyeing, autumn harvest, spring planting, winter cellaring.</p>
<p>We don't sell gastrodia.  We sell the afternoon you spent digging it up.</p>""",
        defects=["straight quotes", "double space", "... ellipsis", "hyphen range",
                 "no a11y metadata", "no lang attr on chap2", "cover too small"],
    ),
    "zh-Hant": dict(
        filename="sample-zh-Hant.epub",
        title="幸福餐桌",
        creator="簡家齊",
        language="zh-TW",  # defect: region tag instead of script tag
        toc_label="目錄",
        ch1="第一章　風土",
        ch2="第二章　儀式",
        # Defects: simplified leftovers, conversion traps, ASCII punctuation,
        # three-dot ellipsis, curly quotes instead of corner brackets.
        body1="""<p>她说,这不是农产品,而是可以带走的记忆。</p>
<p>承德的松林裡，四季各有各的節奏...</p>
<p>採挖那天，所有人的手都沾滿泥土，那种感觉很难形容。</p>
<p>“每一位參與者都是共創者，不是顧客。”</p>""",
        body2="""<p>頭發上還沾著松針，她笑著說：以后每年都要回來。</p>
<p>輕松的午后，餅干配天麻炖湯，那里的風把松脂味送進屋內。</p>
<p>這個項目的軟件系統會記錄每一次採收的數據。</p>""",
        defects=["zh-TW instead of zh-Hant", "simplified chars", "conversion traps",
                 "ASCII punctuation", "... ellipsis", "curly quotes",
                 "mainland vocabulary", "no line-break CSS"],
    ),
    "zh-Hans": dict(
        filename="sample-zh-Hans.epub",
        title="幸福餐桌",
        creator="简家齐",
        language="zh",  # defect: bare zh
        toc_label="目录",
        ch1="第一章　风土",
        ch2="第二章　仪式",
        body1="""<p>她说，这不是农产品，而是可以带走的记忆。</p>
<p>承德的松林里，四季各有各的节奏……</p>
<p>「每一位参与者都是共创者，不是顾客。」</p>""",
        body2="""<p>采挖那天,所有人的手都沾满泥土。</p>
<p>轻松的午后，饼干配天麻炖汤。</p>""",
        defects=["bare zh language tag", "corner brackets in simplified",
                 "ASCII comma", "no a11y metadata"],
    ),
    "ja": dict(
        filename="sample-ja.epub",
        title="しあわせの食卓",
        creator="簡家齊",
        language="ja",
        toc_label="目次",
        ch1="第一章　風土",
        ch2="第二章　儀式",
        # Defects: 、。 vs ，． mixing, ruby without rp, PRC-only simplified chars.
        body1="""<p>彼女は言った、これは農産物ではなく、持ち帰れる記憶だと。</p>
<p>承徳の松林には，四季それぞれのリズムがある．</p>
<p><ruby>天麻<rt>てんま</rt></ruby>は、ここでは文化の記号になる。</p>""",
        body2="""<p>収穫の日、みんなの手が土で汚れた...</p>
<p>这个项目会记录每一回の収穫。</p>""",
        defects=["mixed 、。 and ，．", "ruby without rp", "simplified Chinese leak",
                 "... ellipsis", "no line-break CSS"],
    ),
    "ko": dict(
        filename="sample-ko.epub",
        title="행복한 식탁",
        creator="젠 자치",
        language="ko",
        toc_label="목차",
        ch1="1장 풍토",
        ch2="2장 의식",
        # Defects: fullwidth punctuation, missing space after punctuation, double space.
        body1="""<p>그녀는 말했다，이것은 농산물이 아니라 가져갈 수 있는 기억이라고。</p>
<p>청더의 소나무 숲에는  사계절의 리듬이 있다.</p>
<p>수확하는 날,모두의 손이 흙으로 덮인다.</p>""",
        body2="""<p>참여자는 고객이 아니라 공동 창작자다.</p>
<p>天麻는 여기서 문화적 기호가 된다.</p>""",
        defects=["fullwidth punctuation", "no space after comma", "double space",
                 "missing word-break: keep-all", "no a11y metadata"],
    ),
}


def build(spec: dict, dest_dir: str) -> str:
    path = os.path.join(dest_dir, spec["filename"])
    lang_attr = f' lang="{spec["language"]}" xml:lang="{spec["language"]}"'

    files = {
        "META-INF/container.xml": CONTAINER,
        "OEBPS/nav.xhtml": NAV.format(
            lang=lang_attr, toc_label=spec["toc_label"], ch1=spec["ch1"], ch2=spec["ch2"]
        ),
        "OEBPS/chap1.xhtml": CHAPTER.format(
            lang=lang_attr, title=spec["ch1"], body=spec["body1"]
        ),
        # Second chapter deliberately ships without lang attributes.
        "OEBPS/chap2.xhtml": CHAPTER.format(lang="", title=spec["ch2"], body=spec["body2"]),
        "OEBPS/style.css": BASE_CSS,
        "OEBPS/content.opf": OPF.format(
            identifier=f"urn:uuid:00000000-0000-4000-8000-{abs(hash(spec['filename'])) % 10**12:012d}",
            title=spec["title"],
            creator=spec["creator"],
            language=f"    <dc:language>{spec['language']}</dc:language>",
            extra_meta="",  # deliberately no dcterms:modified, no a11y metadata
            cover_props="",  # deliberately no properties="cover-image"
        ),
    }

    with zipfile.ZipFile(path, "w") as zf:
        # mimetype written second and compressed: a deliberate blocker-level defect.
        zf.writestr("META-INF/container.xml", files["META-INF/container.xml"])
        zf.writestr(zipfile.ZipInfo("mimetype"), b"application/epub+zip\n", zipfile.ZIP_DEFLATED)
        for name, content in files.items():
            if name == "META-INF/container.xml":
                continue
            zf.writestr(name, content)
        zf.writestr("OEBPS/cover.jpg", make_jpeg(600, 900))  # too small, wrong ratio
        zf.writestr("OEBPS/unused.jpg", make_jpeg(100, 100))  # orphan file
        zf.writestr(".DS_Store", b"\x00\x01junk")  # OS junk
    return path


def main(argv) -> int:
    dest = argv[1] if len(argv) > 1 else "fixtures"
    os.makedirs(dest, exist_ok=True)
    for code, spec in BOOKS.items():
        path = build(spec, dest)
        print(f"  {path}")
        for defect in spec["defects"]:
            print(f"      · 植入缺陷：{defect}")
    print(f"\n共產生 {len(BOOKS)} 個測試用 EPUB 於 {dest}/")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
