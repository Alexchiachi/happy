"""Cover, image and font checks.

Image headers are parsed by hand (no Pillow) so the tool stays dependency-free.
CMYK and progressive JPEGs are called out because they render as black or blank
on several e-ink readers while looking perfect on a desktop.
"""

from __future__ import annotations

import re
import struct

from ..issues import Issue, Severity
from ..langprofile import PROFILES, cjk_ratio, profile_for, resolve_book_language
from ..model import Epub, visible_text

CODE = "ASSET"

#: KDP charges a delivery fee per MB on the 70% royalty plan.
KDP_DELIVERY_WARN_BYTES = 3 * 1024 * 1024
KDP_MAX_BYTES = 650 * 1024 * 1024
APPLE_MAX_BYTES = 2 * 1024 * 1024 * 1024
COVER_MIN_SHORT_EDGE = 1600
COVER_IDEAL = (1600, 2560)
IMAGE_WARN_BYTES = 1024 * 1024

#: A full CJK font covers 20k+ glyphs; unsubsetted it dwarfs the text.
CJK_FONT_WARN_BYTES = 3 * 1024 * 1024


def check(epub: Epub, target_lang: str = "") -> list:
    lang = target_lang or _lang_of(epub)
    issues = []
    issues += _package_size(epub)
    issues += _cover(epub)
    issues += _images(epub)
    issues += _fonts(epub, lang)
    return issues


def _lang_of(epub: Epub) -> str:
    return resolve_book_language(epub)


# ------------------------------------------------------------- image decoding


def image_info(data: bytes) -> dict:
    """Return width/height/format plus JPEG colour-model flags, header-only."""
    info = {"format": None, "width": None, "height": None, "cmyk": False, "progressive": False}
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        info["format"] = "png"
        if len(data) >= 24 and data[12:16] == b"IHDR":
            info["width"], info["height"] = struct.unpack(">II", data[16:24])
        return info
    if data[:2] == b"\xff\xd8":
        info["format"] = "jpeg"
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            if i + 4 > len(data):
                break
            seg_len = struct.unpack(">H", data[i + 2 : i + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB):
                if marker in (0xC2, 0xC6, 0xCA):
                    info["progressive"] = True
                if i + 10 <= len(data):
                    info["height"], info["width"] = struct.unpack(">HH", data[i + 5 : i + 9])
                    components = data[i + 9]
                    info["cmyk"] = components == 4
                break
            i += 2 + seg_len
        return info
    if data[:6] in (b"GIF87a", b"GIF89a"):
        info["format"] = "gif"
        info["width"], info["height"] = struct.unpack("<HH", data[6:10])
        return info
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        info["format"] = "webp"
        if data[12:16] == b"VP8 " and len(data) > 30:
            info["width"] = struct.unpack("<H", data[26:28])[0] & 0x3FFF
            info["height"] = struct.unpack("<H", data[28:30])[0] & 0x3FFF
        return info
    if data.lstrip()[:5] == b"<?xml" or b"<svg" in data[:400]:
        info["format"] = "svg"
        return info
    return info


# ---------------------------------------------------------------------- size


def _package_size(epub: Epub) -> list:
    issues = []
    size = epub.file_size()
    mb = size / 1024 / 1024
    if size > KDP_MAX_BYTES:
        issues.append(
            Issue(
                f"{CODE}-001",
                Severity.BLOCKER,
                f"檔案 {mb:.1f} MB 超過 KDP 的 650 MB 上限",
                stores=("kdp",),
            )
        )
    elif size > KDP_DELIVERY_WARN_BYTES:
        fee = mb * 0.15
        issues.append(
            Issue(
                f"{CODE}-002",
                Severity.WARN,
                f"檔案 {mb:.1f} MB：KDP 70% 版稅方案每本會扣約 US${fee:.2f} 傳送費",
                suggestion="壓縮圖片、子集化字型可直接提高每本淨收入。"
                "執行 `epubqa optimize` 查看可節省的空間。",
                stores=("kdp",),
            )
        )
    return issues


# --------------------------------------------------------------------- cover


def _cover(epub: Epub) -> list:
    issues = []
    covers = [i for i in epub.manifest.values() if "cover-image" in i.property_set]
    if not covers:
        legacy = [m for m in epub.metadata if m.tag == "meta" and m.attrib.get("name") == "cover"]
        if legacy:
            ref = legacy[0].attrib.get("content", "")
            if ref in epub.manifest:
                covers = [epub.manifest[ref]]
    if not covers:
        return issues  # already reported by metadata checks

    cover = covers[0]
    if not epub.has(cover.path):
        return [
            Issue(
                f"{CODE}-010",
                Severity.BLOCKER,
                f"封面檔案不存在：{cover.href}",
                file=epub.opf_path,
            )
        ]

    data = epub.files[cover.path]
    info = image_info(data)
    size_mb = len(data) / 1024 / 1024

    if info["format"] not in ("jpeg", "png"):
        issues.append(
            Issue(
                f"{CODE}-011",
                Severity.ERROR,
                f"封面格式為 {info['format'] or '未知'}",
                file=cover.path,
                suggestion="封面必須是 JPEG 或 PNG。KDP 不接受 WebP/AVIF/SVG 封面。",
                stores=("kdp", "apple", "google", "kobo"),
            )
        )
    if info["cmyk"]:
        issues.append(
            Issue(
                f"{CODE}-012",
                Severity.BLOCKER,
                "封面是 CMYK 色彩模式的 JPEG",
                file=cover.path,
                suggestion="轉為 RGB。CMYK JPEG 在多款閱讀器上會顯示為全黑或負片，"
                "但在桌面看起來正常，非常容易漏檢。",
                stores=("kdp", "apple", "google", "kobo"),
            )
        )
    if info["progressive"]:
        issues.append(
            Issue(
                f"{CODE}-013",
                Severity.WARN,
                "封面是漸進式（progressive）JPEG",
                file=cover.path,
                suggestion="改存為 baseline JPEG；部分電子紙裝置無法解碼漸進式。",
                stores=("kdp", "kobo"),
            )
        )

    w, h = info["width"], info["height"]
    if w and h:
        short = min(w, h)
        if short < COVER_MIN_SHORT_EDGE:
            issues.append(
                Issue(
                    f"{CODE}-014",
                    Severity.ERROR,
                    f"封面尺寸 {w}×{h}，短邊小於 {COVER_MIN_SHORT_EDGE}px",
                    file=cover.path,
                    suggestion=f"建議 {COVER_IDEAL[0]}×{COVER_IDEAL[1]}（1.6:1）。"
                    "KDP 要求短邊至少 1000px、建議 1600px；Apple 要求短邊至少 1400px。",
                    stores=("kdp", "apple"),
                )
            )
        ratio = h / w if w else 0
        if not (1.4 <= ratio <= 1.9):
            issues.append(
                Issue(
                    f"{CODE}-015",
                    Severity.WARN,
                    f"封面長寬比 {ratio:.2f}:1 偏離業界標準 1.6:1（{w}×{h}）",
                    file=cover.path,
                    suggestion="書店縮圖會裁切或加白邊。建議調整為 1.6:1。",
                    stores=("kdp", "apple", "google", "kobo"),
                )
            )
        if w > 10000 or h > 10000:
            issues.append(
                Issue(
                    f"{CODE}-016",
                    Severity.WARN,
                    f"封面像素過大（{w}×{h}）",
                    file=cover.path,
                    suggestion="超過 2560px 長邊沒有畫質效益，只會增加檔案大小。",
                )
            )
    else:
        issues.append(
            Issue(
                f"{CODE}-017",
                Severity.WARN,
                "無法讀取封面尺寸（檔頭損毀或格式不支援）",
                file=cover.path,
            )
        )

    if size_mb > 5:
        issues.append(
            Issue(
                f"{CODE}-018",
                Severity.WARN,
                f"封面檔案 {size_mb:.1f} MB 過大",
                file=cover.path,
                suggestion="JPEG 品質 80–85 通常可壓到 500KB 以下且肉眼無差異。",
                stores=("kdp",),
            )
        )

    cover_pages = [
        i
        for i in epub.manifest.values()
        if i.is_xhtml() and re.search(r"cover", i.href, re.I)
    ]
    if not cover_pages:
        issues.append(
            Issue(
                f"{CODE}-019",
                Severity.INFO,
                "沒有封面 XHTML 頁面",
                file=epub.opf_path,
                suggestion="加入一個 epub:type=\"cover\" 的頁面並列為 spine 第一項，"
                "確保在書內翻到第一頁時能看到封面。",
                stores=("apple",),
            )
        )
    return issues


# -------------------------------------------------------------------- images


def _images(epub: Epub) -> list:
    issues = []
    referenced = set()
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        for m in re.finditer(r'<img\b[^>]*>', markup, re.I):
            tag = m.group(0)
            line = markup.count("\n", 0, m.start()) + 1
            src = re.search(r'src="([^"]+)"', tag)
            if src:
                referenced.add(epub.resolve(src.group(1), item.path))
            if not re.search(r'\balt\s*=', tag, re.I):
                issues.append(
                    Issue(
                        f"{CODE}-020",
                        Severity.ERROR,
                        "<img> 缺少 alt 屬性",
                        file=item.path,
                        line=line,
                        excerpt=tag[:100],
                        suggestion="每張圖都要有 alt。裝飾性圖片用 alt=\"\" 加 role=\"presentation\"。"
                        "歐盟無障礙法案（EAA，2025-06 起適用）要求電子書具備替代文字。",
                        stores=("apple", "google", "kobo"),
                    )
                )
            if not re.search(r'\b(width|height)\s*=|style="[^"]*(width|height)', tag, re.I):
                issues.append(
                    Issue(
                        f"{CODE}-021",
                        Severity.INFO,
                        "<img> 未指定尺寸",
                        file=item.path,
                        line=line,
                        suggestion="用 CSS max-width: 100%; height: auto 避免圖片溢出版面。",
                    )
                )
        for m in re.finditer(r'<(video|audio|iframe|object|embed)\b', markup, re.I):
            issues.append(
                Issue(
                    f"{CODE}-022",
                    Severity.WARN,
                    f"使用 <{m.group(1)}> 多媒體元素",
                    file=item.path,
                    line=markup.count("\n", 0, m.start()) + 1,
                    suggestion="Kindle 不支援，會直接略過；請提供靜態替代內容。",
                    stores=("kdp", "kobo"),
                )
            )
        for m in re.finditer(r"<script\b", markup, re.I):
            issues.append(
                Issue(
                    f"{CODE}-023",
                    Severity.ERROR,
                    "內容文件含 <script>",
                    file=item.path,
                    line=markup.count("\n", 0, m.start()) + 1,
                    suggestion="多數平台停用或拒收 JavaScript；EPUB 3 需在 manifest "
                    'properties 宣告 "scripted"，且 KDP 會退件。',
                    stores=("kdp", "apple", "kobo"),
                )
            )

    for item in epub.manifest.values():
        if not item.is_image() or not epub.has(item.path):
            continue
        data = epub.files[item.path]
        info = image_info(data)
        if info["cmyk"]:
            issues.append(
                Issue(
                    f"{CODE}-024",
                    Severity.ERROR,
                    "CMYK JPEG（在多款閱讀器會顯示異常）",
                    file=item.path,
                    suggestion="轉為 sRGB。",
                    stores=("kdp", "apple", "kobo"),
                )
            )
        if len(data) > IMAGE_WARN_BYTES:
            issues.append(
                Issue(
                    f"{CODE}-025",
                    Severity.WARN,
                    f"圖片 {len(data)/1024/1024:.1f} MB 偏大",
                    file=item.path,
                    suggestion="重新壓縮；每 MB 都會計入 KDP 傳送費。",
                    stores=("kdp",),
                )
            )
        if info["format"] in ("webp", "avif"):
            issues.append(
                Issue(
                    f"{CODE}-026",
                    Severity.ERROR,
                    f"使用 {info['format'].upper()} 格式圖片",
                    file=item.path,
                    suggestion="改用 JPEG 或 PNG；KDP 與多數電子紙閱讀器不支援。",
                    stores=("kdp", "kobo", "apple"),
                )
            )
        if item.path not in referenced and "cover-image" not in item.property_set:
            issues.append(
                Issue(
                    f"{CODE}-027",
                    Severity.INFO,
                    "圖片未被任何內容文件引用（孤兒檔案）",
                    file=item.path,
                    suggestion="以 `epubqa optimize --prune` 移除可縮小檔案。",
                    fixable=True,
                )
            )
    return issues


# --------------------------------------------------------------------- fonts


def _fonts(epub: Epub, lang: str) -> list:
    issues = []
    fonts = [i for i in epub.manifest.values() if i.is_font()]
    css_text = "\n".join(epub.text(i.path) for i in epub.css_docs() if epub.has(i.path))
    is_cjk_lang = lang in ("zh-Hant", "zh-Hans", "ja", "ko")

    declared_srcs = set()
    for m in re.finditer(r"@font-face\s*{([^}]*)}", css_text, re.S | re.I):
        block = m.group(1)
        for src in re.finditer(r'url\(\s*[\'"]?([^\'")]+)', block):
            declared_srcs.add(src.group(1).strip())
        if not re.search(r"font-family", block, re.I):
            issues.append(
                Issue(
                    f"{CODE}-030",
                    Severity.ERROR,
                    "@font-face 缺少 font-family",
                    file=epub.css_docs()[0].path if epub.css_docs() else epub.opf_path,
                )
            )

    css_paths = [i.path for i in epub.css_docs()]
    for src in declared_srcs:
        if "://" in src:
            issues.append(
                Issue(
                    f"{CODE}-031",
                    Severity.ERROR,
                    f"@font-face 引用遠端字型：{src}",
                    file=css_paths[0] if css_paths else epub.opf_path,
                    suggestion="字型必須內嵌；遠端字型離線失效且各平台皆退件。",
                    stores=("kdp", "apple", "google", "kobo"),
                )
            )
            continue
        resolved = {epub.resolve(src, p) for p in css_paths} or {epub.resolve(src)}
        if not any(epub.has(r) for r in resolved):
            issues.append(
                Issue(
                    f"{CODE}-032",
                    Severity.ERROR,
                    f"@font-face 指向不存在的字型檔：{src}",
                    file=css_paths[0] if css_paths else epub.opf_path,
                )
            )

    if fonts:
        enc = epub.files.get("META-INF/encryption.xml")
        for font in fonts:
            if not epub.has(font.path):
                continue
            size = len(epub.files[font.path])
            if size > CJK_FONT_WARN_BYTES:
                issues.append(
                    Issue(
                        f"{CODE}-033",
                        Severity.WARN,
                        f"字型檔 {size/1024/1024:.1f} MB",
                        file=font.path,
                        suggestion="子集化（subsetting）只保留書中實際用到的字。"
                        "中日韓全字集字型動輒 5–20MB，子集化後常可降到 300KB 以下，"
                        "直接反映在 KDP 傳送費上。",
                        stores=("kdp",),
                    )
                )
            if font.href.lower().endswith(".ttc"):
                issues.append(
                    Issue(
                        f"{CODE}-034",
                        Severity.ERROR,
                        "使用 TTC（字型集合）格式",
                        file=font.path,
                        suggestion="拆成單一 TTF/OTF 或轉為 WOFF2。",
                    )
                )
            if not font.href.lower().endswith((".woff", ".woff2")):
                issues.append(
                    Issue(
                        f"{CODE}-035",
                        Severity.INFO,
                        "字型未使用 WOFF2 壓縮格式",
                        file=font.path,
                        suggestion="WOFF2 通常可再省 30–50% 體積，EPUB 3 閱讀器皆支援。",
                    )
                )
        if enc is not None:
            issues.append(
                Issue(
                    f"{CODE}-036",
                    Severity.WARN,
                    "存在 META-INF/encryption.xml（字型混淆）",
                    file="META-INF/encryption.xml",
                    suggestion="確認混淆演算法為 IDPF 標準且 unique-identifier 完全一致，"
                    "否則字型會載入失敗；改版換 identifier 時必須重新混淆。",
                    stores=("apple", "google"),
                )
            )
        # Open licences (SIL OFL above all) require the licence text to travel
        # with the font. Bundling it is both the compliance step and the
        # evidence that the licence question was actually looked at.
        licence = next(
            (
                name
                for name in epub.files
                if re.search(r"(^|/)(ofl|license|licence|copying)[^/]*$", name, re.I)
            ),
            None,
        )
        # Once the licence travels with the book the question has been answered,
        # so — like every other check here — this one goes quiet.
        if not licence:
            issues.append(
                Issue(
                    f"{CODE}-037",
                    Severity.INFO,
                    f"內嵌了 {len(fonts)} 個字型檔，未附授權文件",
                    suggestion="確認字型授權允許電子書內嵌（embedding permission）。"
                    "商用字型多數需另購電子書授權，這是上架後最常見的法務風險；"
                    "SIL OFL 等開放授權則要求隨檔附上授權全文（OFL.txt），"
                    "並將它列入 manifest。",
                )
            )
    elif is_cjk_lang:
        issues.append(
            Issue(
                f"{CODE}-038",
                Severity.INFO,
                f"未內嵌字型（{lang}）",
                suggestion="通常是正確選擇：中日韓字型體積大，且各閱讀器內建字型較佳。"
                "請確認 CSS 的 font-family 有列出泛用字族（serif / sans-serif）作為後援。",
                lang=lang,
            )
        )

    if css_text and not re.search(r"font-family[^;]*(serif|sans-serif|monospace)", css_text, re.I):
        if re.search(r"font-family", css_text, re.I):
            issues.append(
                Issue(
                    f"{CODE}-039",
                    Severity.WARN,
                    "font-family 沒有泛用字族後援",
                    file=css_paths[0] if css_paths else epub.opf_path,
                    suggestion="結尾加上 serif 或 sans-serif；"
                    "指定的字型不存在時，中日韓文可能落到不含漢字的字型而顯示成豆腐方塊。",
                    lang=lang or None,
                )
            )
    return issues
