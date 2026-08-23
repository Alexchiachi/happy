"""Accessibility checks (EPUB Accessibility 1.1 / WCAG 2.2 AA).

Since 28 June 2025 the European Accessibility Act applies to ebooks sold into
the EU, and the major retailers now surface accessibility metadata on the
product page. Missing schema.org a11y metadata is no longer cosmetic: Kobo and
Google Play flag it, and EU distribution can be blocked outright.
"""

from __future__ import annotations

import re

from ..issues import Issue, Severity
from ..model import Epub

CODE = "A11Y"

REQUIRED_PROPS = {
    "schema:accessMode": "內容的感官型態（textual / visual）",
    "schema:accessModeSufficient": "單獨足以理解全書的型態組合",
    "schema:accessibilityFeature": "無障礙特性（structuralNavigation / tableOfContents / alternativeText…）",
    "schema:accessibilityHazard": "危害警示（none / flashing / motionSimulation）",
    "schema:accessibilitySummary": "人類可讀的無障礙說明",
}


def check(epub: Epub) -> list:
    issues = []
    issues += _metadata(epub)
    issues += _headings(epub)
    issues += _semantics(epub)
    issues += _tables_and_links(epub)
    return issues


def _metadata(epub: Epub) -> list:
    issues = []
    if not epub.version.startswith("3"):
        return [
            Issue(
                f"{CODE}-001",
                Severity.ERROR,
                "EPUB 2 無法宣告無障礙 metadata",
                file=epub.opf_path,
                suggestion="升級為 EPUB 3。歐盟無障礙法案（EAA）自 2025-06-28 起適用於"
                "在歐盟販售的電子書，缺少無障礙資訊可能無法在歐盟上架。",
                stores=("apple", "google", "kobo"),
            )
        ]

    present = {m.prop for m in epub.metadata if m.tag == "meta"}
    for prop, desc in REQUIRED_PROPS.items():
        if prop not in present:
            severity = (
                Severity.ERROR
                if prop in ("schema:accessMode", "schema:accessibilityFeature")
                else Severity.WARN
            )
            issues.append(
                Issue(
                    f"{CODE}-002",
                    severity,
                    f"缺少無障礙 metadata：{prop}",
                    file=epub.opf_path,
                    suggestion=f"{desc}。`epubqa fix --a11y` 可依內容自動推導並補上。",
                    stores=("google", "kobo", "apple"),
                    fixable=True,
                )
            )

    conforms = [m for m in epub.metadata if m.tag == "link" and "conformsTo" in str(m.attrib)]
    conforms += [m for m in epub.metadata if m.prop == "dcterms:conformsTo"]
    if not conforms:
        issues.append(
            Issue(
                f"{CODE}-003",
                Severity.WARN,
                "未宣告無障礙符合等級（dcterms:conformsTo）",
                file=epub.opf_path,
                suggestion='加入 <link rel="dcterms:conformsTo" '
                'href="http://www.idpf.org/epub/a11y/accessibility-20170105.html#wcag-aa"/>，'
                "或 EPUB Accessibility 1.1 的 EPUB A11Y 1.1 WCAG 2.2 AA。",
                stores=("kobo", "google"),
            )
        )

    hazard = [m.text for m in epub.metadata if m.prop == "schema:accessibilityHazard"]
    if hazard and "unknown" in [h.strip() for h in hazard]:
        issues.append(
            Issue(
                f"{CODE}-004",
                Severity.WARN,
                'accessibilityHazard 值為 "unknown"',
                file=epub.opf_path,
                suggestion="明確填寫（多數文字書為 none）；unknown 在部分平台等同未宣告。",
            )
        )
    return issues


def _headings(epub: Epub) -> list:
    """Heading order drives screen-reader navigation and store TOC generation."""
    issues = []
    seen_h1 = False
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        levels = [
            (int(m.group(1)), m.start())
            for m in re.finditer(r"<h([1-6])\b", markup, re.I)
        ]
        if not levels:
            body = re.search(r"<body[^>]*>(.*)</body>", markup, re.S | re.I)
            if body and len(re.sub(r"<[^>]+>", "", body.group(1)).strip()) > 500:
                issues.append(
                    Issue(
                        f"{CODE}-010",
                        Severity.WARN,
                        "章節文件沒有任何標題元素（h1–h6）",
                        file=item.path,
                        suggestion="每個章節至少要有一個 <h1>；螢幕閱讀器與書店目錄都依賴標題結構。",
                        stores=("kobo", "google"),
                    )
                )
            continue
        if levels[0][0] == 1:
            seen_h1 = True
        prev = None
        for level, pos in levels:
            if prev is not None and level > prev + 1:
                issues.append(
                    Issue(
                        f"{CODE}-011",
                        Severity.WARN,
                        f"標題層級跳號：h{prev} 之後直接出現 h{level}",
                        file=item.path,
                        line=markup.count("\n", 0, pos) + 1,
                        suggestion="標題層級不可跳號（WCAG 1.3.1）。",
                    )
                )
            prev = level
    if not seen_h1:
        issues.append(
            Issue(
                f"{CODE}-012",
                Severity.WARN,
                "全書沒有任何 <h1>",
                file=epub.opf_path,
            )
        )
    return issues


def _semantics(epub: Epub) -> list:
    issues = []
    all_markup = ""
    for item in epub.content_docs():
        if epub.has(item.path):
            all_markup += epub.text(item.path)

    if "epub:type" not in all_markup:
        issues.append(
            Issue(
                f"{CODE}-020",
                Severity.WARN,
                "全書未使用任何 epub:type 語意標記",
                file=epub.opf_path,
                suggestion="至少標註 cover / frontmatter / bodymatter / chapter / backmatter，"
                "讓輔助科技與閱讀器能正確導覽。",
                stores=("apple", "kobo"),
            )
        )

    # A page-list maps to the pagination of a *print* edition. A digital-only
    # book has no page numbers to map to, so asking for one is noise; only a
    # book that declares a print source can be missing it.
    has_print_source = bool(epub.first_value("source")) or bool(
        epub.meta_by_property("dcterms:source")
    )
    nav_items = [i for i in epub.manifest.values() if "nav" in i.property_set]
    for nav in nav_items:
        if not epub.has(nav.path):
            continue
        markup = epub.text(nav.path)
        if has_print_source and 'epub:type="page-list"' not in markup:
            issues.append(
                Issue(
                    f"{CODE}-021",
                    Severity.INFO,
                    "宣告了紙本來源（dc:source）卻沒有 page-list 導覽",
                    file=nav.path,
                    suggestion="加入 page-list 與 pagebreak 標記，讓讀者能對照紙本頁碼"
                    "（教育與圖書館通路常要求）。",
                )
            )

    if re.search(r"<table\b", all_markup, re.I) and not re.search(r"<th\b", all_markup, re.I):
        issues.append(
            Issue(
                f"{CODE}-022",
                Severity.WARN,
                "有 <table> 但沒有任何 <th> 表頭",
                suggestion="資料表需要 <th scope>；純排版用途的表格應改用 CSS。",
            )
        )
    return issues


def _tables_and_links(epub: Epub) -> list:
    issues = []
    vague = ("點這裡", "這裡", "click here", "here", "read more", "こちら", "여기")
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        for m in re.finditer(r"<a\b[^>]*>(.*?)</a>", markup, re.I | re.S):
            label = re.sub(r"<[^>]+>", "", m.group(1)).strip()
            if label.lower() in vague:
                issues.append(
                    Issue(
                        f"{CODE}-030",
                        Severity.INFO,
                        f"連結文字語意不明：「{label}」",
                        file=item.path,
                        line=markup.count("\n", 0, m.start()) + 1,
                        suggestion="連結文字應能脫離上下文獨立理解（WCAG 2.4.4）。",
                    )
                )
            elif not label and "img" not in m.group(1).lower():
                issues.append(
                    Issue(
                        f"{CODE}-031",
                        Severity.WARN,
                        "空連結（無可讀文字）",
                        file=item.path,
                        line=markup.count("\n", 0, m.start()) + 1,
                    )
                )
    return issues
