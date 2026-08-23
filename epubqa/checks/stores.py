"""Store-specific rules that do not fit the generic categories.

Rules encode publicly documented retailer requirements as of 2026-08. Retailers
change these; ``docs/STORE_RULES.md`` records the source for each so they can be
re-verified before a launch.
"""

from __future__ import annotations

import re

from ..issues import Issue, Severity
from ..langprofile import profile_for, resolve_book_language
from ..model import Epub, visible_text

CODE = "STORE"


def check(epub: Epub, target_lang: str = "") -> list:
    lang = resolve_book_language(epub, target_lang)
    issues = []
    issues += _kdp(epub, lang)
    issues += _apple(epub)
    issues += _google_kobo(epub)
    issues += _front_matter(epub)
    return issues


def _kdp(epub: Epub, lang: str) -> list:
    issues = []
    text = "\n".join(
        visible_text(epub.text(i.path)) for i in epub.content_docs() if epub.has(i.path)
    )

    # KDP forbids pointing readers to other retailers.
    competitors = [
        "barnesandnoble.com",
        "kobo.com",
        "books.apple.com",
        "itunes.apple.com",
        "smashwords.com",
        "gumroad.com",
        "books.google",
    ]
    all_markup = "\n".join(
        epub.text(i.path) for i in epub.content_docs() if epub.has(i.path)
    )
    for name in competitors:
        for m in re.finditer(re.escape(name), all_markup, re.I):
            issues.append(
                Issue(
                    f"{CODE}-001",
                    Severity.ERROR,
                    f"內文出現其他通路連結：{name}",
                    suggestion="KDP 禁止在書中引導讀者到其他零售通路，會導致下架。",
                    stores=("kdp",),
                )
            )
            break

    if re.search(r"\b(免費下載|free download|限時免費|訂閱電子報領取)\b", text, re.I):
        issues.append(
            Issue(
                f"{CODE}-002",
                Severity.INFO,
                "內文含促銷／導流文字",
                suggestion="KDP 允許作者網站連結，但禁止導向其他書店或含價格資訊；"
                "價格與促銷字樣請移除。",
                stores=("kdp",),
            )
        )

    if lang == "ja":
        if epub.page_progression != "rtl":
            issues.append(
                Issue(
                    f"{CODE}-003",
                    Severity.INFO,
                    "日文書但未設定 page-progression-direction=\"rtl\"",
                    file=epub.opf_path,
                    suggestion="橫排日文書維持 ltr 即可；若為直排必須設 rtl，"
                    "否則 Kindle 日本站的翻頁方向會相反。",
                    stores=("kdp",),
                    lang="ja",
                )
            )

    nav = [i for i in epub.manifest.values() if "nav" in i.property_set]
    if nav and epub.spine:
        first = epub.manifest.get(epub.spine[0].idref)
        if first and first.id == nav[0].id:
            issues.append(
                Issue(
                    f"{CODE}-004",
                    Severity.WARN,
                    "目錄是 spine 的第一頁",
                    file=epub.opf_path,
                    suggestion="KDP 建議封面在前、目錄其後；"
                    "且目錄頁不應計入「試閱」的前 10%。",
                    stores=("kdp",),
                )
            )
    return issues


def _apple(epub: Epub) -> list:
    """Apple runs EPUBCheck and rejects on any error, so mirror its strictest bits."""
    issues = []
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        if not re.search(r"<!DOCTYPE\s+html", markup, re.I):
            issues.append(
                Issue(
                    f"{CODE}-010",
                    Severity.ERROR,
                    "XHTML 缺少 <!DOCTYPE html>",
                    file=item.path,
                    stores=("apple",),
                    fixable=True,
                )
            )
        if 'xmlns="http://www.w3.org/1999/xhtml"' not in markup:
            issues.append(
                Issue(
                    f"{CODE}-011",
                    Severity.BLOCKER,
                    "<html> 缺少 XHTML namespace 宣告",
                    file=item.path,
                    suggestion='加上 xmlns="http://www.w3.org/1999/xhtml"。',
                    stores=("apple", "google", "kobo"),
                    fixable=True,
                )
            )
        if re.search(r"<(nav|section|article|aside|figure)\b", markup, re.I) and epub.version.startswith("2"):
            issues.append(
                Issue(
                    f"{CODE}-012",
                    Severity.ERROR,
                    "EPUB 2 使用 HTML5 元素",
                    file=item.path,
                    stores=("apple",),
                )
            )
    return issues


def _google_kobo(epub: Epub) -> list:
    issues = []
    if not epub.first_value("description"):
        issues.append(
            Issue(
                f"{CODE}-020",
                Severity.INFO,
                "缺少 dc:description，Google Play 商品頁會空白",
                file=epub.opf_path,
                stores=("google",),
            )
        )
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        # The ratio measures inline cruft in *prose*. A table of contents is
        # mostly markup by nature — one span per entry, all class-driven — so
        # it trips the threshold no matter how cleanly it is written.
        if "nav" in item.property_set:
            continue
        markup = epub.text(item.path)
        count = len(re.findall(r"<span\b", markup, re.I))
        chars = len(re.sub(r"<[^>]+>", "", markup))
        if chars and count / max(chars, 1) > 0.05:
            issues.append(
                Issue(
                    f"{CODE}-021",
                    Severity.WARN,
                    f"<span> 密度過高（{count} 個）",
                    file=item.path,
                    suggestion="Kobo 轉為 KEPUB 時會再插入大量 span，過度巢狀會拖慢渲染"
                    "甚至造成排版錯亂。請以 CSS class 取代行內 span。",
                    stores=("kobo",),
                )
            )
            break
    return issues


def _front_matter(epub: Epub) -> list:
    """Every store's sample is the first N% — leading blank or boilerplate pages
    waste it, and KDP flags leading blank pages as a quality issue."""
    issues = []
    if not epub.spine:
        return issues
    for sp in epub.spine[:3]:
        item = epub.manifest.get(sp.idref)
        if not item or not epub.has(item.path):
            continue
        text = visible_text(epub.text(item.path)).strip()
        has_img = "<img" in epub.text(item.path).lower() or "<svg" in epub.text(item.path).lower()
        if len(text) < 5 and not has_img:
            issues.append(
                Issue(
                    f"{CODE}-030",
                    Severity.ERROR,
                    "書籍開頭有空白頁",
                    file=item.path,
                    suggestion="KDP 的品質審查會標記開頭空白頁；同時也浪費了試閱額度。",
                    stores=("kdp",),
                )
            )
    return issues
