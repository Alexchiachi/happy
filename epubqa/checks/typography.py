"""Per-language typography and CSS checks.

Split into: punctuation correctness (locale-specific), whitespace hygiene, and
the CSS declarations each language needs in order to line-break correctly.
Korean without ``word-break: keep-all`` and Japanese/Chinese without
``line-break: strict`` are the two defects readers complain about most.
"""

from __future__ import annotations

import re

from ..issues import Issue, Severity
from ..langprofile import (
    CJK_CONTEXT,
    CJK_LEAD,
    KINSOKU_NO_END,
    KINSOKU_NO_START,
    PROFILES,
    cjk_ratio,
    excerpt_at,
    is_cjk,
    is_han,
    is_hangul,
    is_kana,
    is_latin,
    profile_for,
    resolve_book_language,
)
from ..model import Epub, visible_text

CODE = "TYPO"

MAX_REPORTS_PER_RULE = 12


def check(epub: Epub, target_lang: str = "") -> list:
    lang = target_lang or _lang_of(epub)
    profile = PROFILES.get(lang)
    issues = []
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        text = visible_text(markup)
        if not text.strip():
            issues.append(
                Issue(
                    f"{CODE}-000",
                    Severity.WARN,
                    "內容文件沒有任何可見文字",
                    file=item.path,
                    suggestion="空白頁會被 KDP 判定為排版問題；若是刻意留白請確認有內容標記。",
                )
            )
            continue
        issues += _whitespace(item.path, markup, text)
        if profile is None:
            continue
        if lang in ("zh-Hant", "zh-Hans", "ja"):
            issues += _cjk_punctuation(item.path, text, lang, profile)
        if lang in ("zh-Hant", "zh-Hans"):
            issues += _chinese_quotes(item.path, text, lang, profile)
        if lang == "ja":
            issues += _japanese(item.path, markup, text)
        if lang == "ko":
            issues += _korean(item.path, text)
        if lang == "en":
            issues += _english(item.path, text)
        if lang in ("zh-Hant", "zh-Hans", "ja", "ko"):
            issues += _cjk_latin_spacing(item.path, text, lang)
    issues += _css(epub, lang)
    return _cap(issues)


def _lang_of(epub: Epub) -> str:
    return resolve_book_language(epub)


def _cap(issues: list) -> list:
    """Keep reports readable: collapse floods into a single summary line."""
    seen = {}
    out = []
    overflow = {}
    for issue in issues:
        key = (issue.code, issue.file)
        seen[key] = seen.get(key, 0) + 1
        if seen[key] <= MAX_REPORTS_PER_RULE:
            out.append(issue)
        else:
            overflow[key] = overflow.get(key, 0) + 1
    for (code, path), count in overflow.items():
        out.append(
            Issue(
                code,
                Severity.INFO,
                f"（同類問題另有 {count} 處未逐一列出）",
                file=path,
            )
        )
    return out


# ------------------------------------------------------------------ whitespace


def _whitespace(path: str, markup: str, text: str) -> list:
    issues = []
    for m in re.finditer(r"[ \t]+$", markup, re.M):
        issues.append(
            Issue(
                f"{CODE}-001",
                Severity.INFO,
                "行尾有多餘空白",
                file=path,
                line=markup.count("\n", 0, m.start()) + 1,
                fixable=True,
            )
        )
    for m in re.finditer(r" {2,}|&nbsp;(?:\s*&nbsp;){2,}", markup):
        issues.append(
            Issue(
                f"{CODE}-002",
                Severity.WARN,
                "以連續不斷行空白排版縮排",
                file=path,
                line=markup.count("\n", 0, m.start()) + 1,
                suggestion="改用 CSS text-indent；&nbsp; 在不同字級下會跑版。",
            )
        )
    for m in re.finditer(r"<p[^>]*>\s*(?:&nbsp;| |<br\s*/?>)?\s*</p>", markup, re.I):
        issues.append(
            Issue(
                f"{CODE}-003",
                Severity.WARN,
                "空段落被用來製造間距",
                file=path,
                line=markup.count("\n", 0, m.start()) + 1,
                suggestion="改用 margin；空段落在 Kindle 轉檔後間距不可控。",
                stores=("kdp",),
                fixable=True,
            )
        )
    for m in re.finditer(r"(?:<br\s*/?>\s*){3,}", markup, re.I):
        issues.append(
            Issue(
                f"{CODE}-004",
                Severity.WARN,
                "連續三個以上的 <br>",
                file=path,
                line=markup.count("\n", 0, m.start()) + 1,
                suggestion="改用 CSS margin 或 page-break-before。",
                stores=("kdp",),
            )
        )
    return issues


# ------------------------------------------------------------- CJK punctuation


def _cjk_punctuation(path: str, text: str, lang: str, profile) -> list:
    """Half-width punctuation inside CJK runs looks broken in a CJK font."""
    issues = []
    pattern = re.compile(
        rf"([{CJK_LEAD}])\s*([,.;:!?])(?=\s|[{CJK_CONTEXT}]|$)"
    )
    for m in pattern.finditer(text):
        ascii_ch = m.group(2)
        # A period after a Latin abbreviation inside CJK is a false positive; the
        # look-behind above already requires a CJK char immediately before.
        full = {",": "，", ".": "。", ";": "；", ":": "：", "!": "！", "?": "？"}[ascii_ch]
        if lang == "ja" and ascii_ch == ",":
            full = "、"
        issues.append(
            Issue(
                f"{CODE}-010",
                Severity.ERROR,
                f"中日文句中使用半形標點「{ascii_ch}」，應為全形「{full}」",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                excerpt=excerpt_at(text, m.start()),
                lang=lang,
                fixable=True,
            )
        )

    for m in re.finditer(r"(?<![.．])\.{3,6}(?![.．])", text):
        window = text[max(0, m.start() - 10) : m.start()]
        if cjk_ratio(window) > 0.3:
            issues.append(
                Issue(
                    f"{CODE}-011",
                    Severity.ERROR,
                    f"使用半形句點作刪節號「{m.group(0)}」，應為「{profile.ellipsis}」",
                    file=path,
                    line=text.count("\n", 0, m.start()) + 1,
                    excerpt=excerpt_at(text, m.start()),
                    suggestion="中日文刪節號為兩個 U+2026（六點），不是三個半形句點。",
                    lang=lang,
                    fixable=True,
                )
            )
    for m in re.finditer(r"(?<!…)…(?!…)", text):
        window = text[max(0, m.start() - 12) : m.start()]
        if cjk_ratio(window) > 0.3:
            issues.append(
                Issue(
                    f"{CODE}-012",
                    Severity.WARN,
                    "刪節號只有一個「…」（三點），中日文排版慣例為兩個（六點）",
                    file=path,
                    line=text.count("\n", 0, m.start()) + 1,
                    excerpt=excerpt_at(text, m.start()),
                    lang=lang,
                    fixable=True,
                )
            )
    # ASCII double-hyphen is unambiguously wrong, so it is auto-fixable.
    for m in re.finditer(r"(?<!-)--(?!-)", text):
        window = text[max(0, m.start() - 12) : m.start()]
        if cjk_ratio(window) > 0.3:
            issues.append(
                Issue(
                    f"{CODE}-013",
                    Severity.WARN,
                    f"以半形雙連字號代替破折號：「{m.group(0)}」應為「{profile.dash}」",
                    file=path,
                    line=text.count("\n", 0, m.start()) + 1,
                    excerpt=excerpt_at(text, m.start()),
                    suggestion="中日文破折號佔兩個全形字寬（兩個 U+2014）。",
                    lang=lang,
                    fixable=True,
                )
            )
    # A lone em dash may well be a deliberate separator or subtitle marker, so it
    # is reported for a human to judge and never rewritten automatically.
    for m in re.finditer(r"(?<!—)—(?!—)", text):
        window = text[max(0, m.start() - 12) : m.start()]
        if cjk_ratio(window) > 0.3:
            issues.append(
                Issue(
                    f"{CODE}-016",
                    Severity.INFO,
                    "單個破折號「—」；中日文行文慣例為兩格「——」",
                    file=path,
                    line=text.count("\n", 0, m.start()) + 1,
                    excerpt=excerpt_at(text, m.start()),
                    suggestion="若是行文中的破折號請改為「——」；"
                    "若是刻意作為副標或分隔符號則維持單個即可，本項不會自動修改。",
                    lang=lang,
                )
            )
    for m in re.finditer(r"[㐀-鿿぀-ヿ][()]", text):
        issues.append(
            Issue(
                f"{CODE}-014",
                Severity.WARN,
                "中日文句中使用半形括號",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                excerpt=excerpt_at(text, m.start()),
                suggestion="純中日文內容用全形（）；夾註西文或數字時才用半形並前後留空。",
                lang=lang,
                fixable=True,
            )
        )
    for m in re.finditer(r"[，。、；：？！]{3,}", text):
        issues.append(
            Issue(
                f"{CODE}-015",
                Severity.WARN,
                f"連續標點「{m.group(0)}」",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                lang=lang,
            )
        )
    return issues


def _chinese_quotes(path: str, text: str, lang: str, profile) -> list:
    """zh-Hant uses 「」『』; zh-Hans uses “”‘’. Mixing both is a conversion smell."""
    issues = []
    corner = len(re.findall(r"[「」『』]", text))
    curly = len(re.findall(r"[“”‘’]", text))
    straight = len(re.findall(r'"', text))

    if lang == "zh-Hant" and curly > 0 and corner > 0:
        issues.append(
            Issue(
                f"{CODE}-020",
                Severity.WARN,
                f"繁體版同時混用直角引號（{corner}）與彎引號（{curly}）",
                file=path,
                suggestion="統一為「」『』；台港慣例使用直角引號。",
                lang=lang,
            )
        )
    elif lang == "zh-Hant" and curly > 0 and corner == 0:
        idx = text.find("“")
        issues.append(
            Issue(
                f"{CODE}-021",
                Severity.INFO,
                f"繁體版使用彎引號“”（{curly} 處）而非直角引號「」",
                file=path,
                line=text.count("\n", 0, idx) + 1 if idx >= 0 else None,
                suggestion="台港出版慣例為「」；若目標市場為中國大陸讀者則維持“”。",
                lang=lang,
                fixable=True,
            )
        )
    if lang == "zh-Hans" and corner > 0:
        idx = text.find("「")
        issues.append(
            Issue(
                f"{CODE}-022",
                Severity.WARN,
                f"简体版使用直角引号「」（{corner} 处）",
                file=path,
                line=text.count("\n", 0, idx) + 1 if idx >= 0 else None,
                suggestion="简体中文出版规范使用“”‘’。",
                lang=lang,
                fixable=True,
            )
        )
    if straight >= 2 and cjk_ratio(text) > 0.3:
        idx = text.find('"')
        issues.append(
            Issue(
                f"{CODE}-023",
                Severity.WARN,
                f"出現 {straight} 個直立引號 \"，未轉為正式引號",
                file=path,
                line=text.count("\n", 0, idx) + 1 if idx >= 0 else None,
                lang=lang,
                fixable=True,
            )
        )

    opens = len(re.findall(r"[「『]", text))
    closes = len(re.findall(r"[」』]", text))
    if opens != closes:
        issues.append(
            Issue(
                f"{CODE}-024",
                Severity.ERROR,
                f"引號不成對：開 {opens} / 閉 {closes}",
                file=path,
                suggestion="通常是漏打或誤刪；對話段落尤其容易出現。",
                lang=lang,
            )
        )
    return issues


def _japanese(path: str, markup: str, text: str) -> list:
    issues = []
    if re.search(r"[，．]", text) and re.search(r"[、。]", text):
        idx = re.search(r"[，．]", text).start()
        issues.append(
            Issue(
                f"{CODE}-030",
                Severity.WARN,
                "「、。」と「，．」の句読点が混在",
                file=path,
                line=text.count("\n", 0, idx) + 1,
                excerpt=excerpt_at(text, idx),
                suggestion="일반書籍は「、。」に統一してください。",
                lang="ja",
                fixable=True,
            )
        )
    for m in re.finditer(r"<ruby\b[^>]*>(.*?)</ruby>", markup, re.I | re.S):
        block = m.group(0)
        line = markup.count("\n", 0, m.start()) + 1
        if "<rt" not in block.lower():
            issues.append(
                Issue(
                    f"{CODE}-031",
                    Severity.ERROR,
                    "<ruby> に <rt> がなく、ルビが表示されません",
                    file=path,
                    line=line,
                    lang="ja",
                )
            )
        if "<rp" not in block.lower():
            issues.append(
                Issue(
                    f"{CODE}-032",
                    Severity.INFO,
                    "<ruby> に <rp> フォールバックがありません",
                    file=path,
                    line=line,
                    suggestion="<rp>（</rp> を入れるとルビ非対応端末で「漢字（かんじ）」と読めます。",
                    lang="ja",
                    fixable=True,
                )
            )
    if re.search(r"vertical-rl|vertical-lr", markup):
        issues.append(
            Issue(
                f"{CODE}-033",
                Severity.INFO,
                "縦書きが指定されています",
                file=path,
                suggestion="spine の page-progression-direction=\"rtl\"、"
                "数字の縦中横（-epub-text-combine-upright: digits 2）、"
                "画像の向きを併せて確認してください。",
                lang="ja",
            )
        )
    for m in re.finditer(r"[０-９]{3,}", text):
        issues.append(
            Issue(
                f"{CODE}-034",
                Severity.INFO,
                f"全角数字の連続「{m.group(0)}」",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                suggestion="横書きでは半角数字が一般的です。縦書きなら縦中横を検討。",
                lang="ja",
            )
        )
    return issues


def _korean(path: str, text: str) -> list:
    issues = []
    for m in re.finditer(r"[가-힣] {2,}[가-힣]", text):
        issues.append(
            Issue(
                f"{CODE}-040",
                Severity.WARN,
                "한글 사이에 연속 공백",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                excerpt=excerpt_at(text, m.start()),
                fixable=True,
            )
        )
    for m in re.finditer(r"[가-힣][,.!?][가-힣]", text):
        issues.append(
            Issue(
                f"{CODE}-041",
                Severity.WARN,
                "문장 부호 뒤에 공백이 없음",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                excerpt=excerpt_at(text, m.start()),
                suggestion="한국어는 문장 부호 뒤에 한 칸 띄웁니다.",
                lang="ko",
                fixable=True,
            )
        )
    for m in re.finditer(r"[，。；：？！]", text):
        issues.append(
            Issue(
                f"{CODE}-042",
                Severity.ERROR,
                f"전각 문장 부호「{m.group(0)}」사용 (한국어는 반각 , . 사용)",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                excerpt=excerpt_at(text, m.start()),
                lang="ko",
                fixable=True,
            )
        )
    return issues


def _english(path: str, text: str) -> list:
    issues = []
    straight_d = len(re.findall(r'"', text))
    if straight_d:
        idx = text.find('"')
        issues.append(
            Issue(
                f"{CODE}-050",
                Severity.WARN,
                f"{straight_d} straight double quotes (\") instead of typographic “ ”",
                file=path,
                line=text.count("\n", 0, idx) + 1,
                excerpt=excerpt_at(text, idx),
                suggestion="Publishers expect curly quotes; straight quotes read as unedited.",
                lang="en",
                fixable=True,
            )
        )
    for m in re.finditer(r"(?<=\w)'(?=\w)", text):
        issues.append(
            Issue(
                f"{CODE}-051",
                Severity.INFO,
                "Straight apostrophe (') inside a word; should be ’ (U+2019)",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                excerpt=excerpt_at(text, m.start()),
                lang="en",
                fixable=True,
            )
        )
    for m in re.finditer(r"(?<=[.!?\"”’])  +(?=[A-Z\"“'‘])", text):
        issues.append(
            Issue(
                f"{CODE}-052",
                Severity.WARN,
                "Double space after sentence-ending punctuation",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                suggestion="Single space; double spacing is a typewriter habit and "
                "creates visible rivers in justified ebook text.",
                lang="en",
                fixable=True,
            )
        )
    for m in re.finditer(r"\b(\d{4})\s*-\s*(\d{4})\b", text):
        issues.append(
            Issue(
                f"{CODE}-053",
                Severity.INFO,
                f"Hyphen in a numeric range: {m.group(0)} should use an en dash (–)",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                lang="en",
                fixable=True,
            )
        )
    for m in re.finditer(r"\.{3,}", text):
        issues.append(
            Issue(
                f"{CODE}-054",
                Severity.INFO,
                "Three dots instead of an ellipsis character (…)",
                file=path,
                line=text.count("\n", 0, m.start()) + 1,
                lang="en",
                fixable=True,
            )
        )
    return issues


def _cjk_latin_spacing(path: str, text: str, lang: str) -> list:
    """Report inconsistency rather than a fixed rule: both styles are defensible,
    but mixing them inside one book is not."""
    tight = len(re.findall(r"[㐀-鿿぀-ヿ가-힣][A-Za-z0-9]", text))
    spaced = len(re.findall(r"[㐀-鿿぀-ヿ가-힣] [A-Za-z0-9]", text))
    if tight and spaced and min(tight, spaced) / (tight + spaced) > 0.2:
        return [
            Issue(
                f"{CODE}-060",
                Severity.INFO,
                f"中英數之間空格不一致：無空格 {tight} 處、有空格 {spaced} 處",
                file=path,
                suggestion="擇一貫徹。建議不手動加空格，改由 CSS/閱讀器處理字距，"
                "手動空格在換行時會產生突兀的行首空白。",
                lang=lang,
            )
        ]
    return []


# ------------------------------------------------------------------------ CSS


def _css(epub: Epub, lang: str) -> list:
    issues = []
    css_items = epub.css_docs()
    if not css_items:
        return [
            Issue(
                f"{CODE}-070",
                Severity.WARN,
                "沒有任何 CSS 樣式表",
                file=epub.opf_path,
                suggestion="至少要有一份基本樣式來設定行高、段落間距與斷行規則。",
            )
        ]

    combined = "\n".join(epub.text(i.path) for i in css_items if epub.has(i.path))
    combined += "\n".join(
        m.group(0)
        for item in epub.content_docs()
        if epub.has(item.path)
        for m in re.finditer(r"<style\b.*?</style>", epub.text(item.path), re.S | re.I)
    )

    profile = PROFILES.get(lang)
    if profile:
        for prop, value in profile.required_css.items():
            if not re.search(rf"{re.escape(prop)}\s*:", combined):
                severity = Severity.ERROR if (lang == "ko" and prop == "word-break") else Severity.WARN
                issues.append(
                    Issue(
                        f"{CODE}-071",
                        severity,
                        f"{profile.name} 排版缺少 CSS `{prop}: {value}`",
                        file=css_items[0].path if css_items else epub.opf_path,
                        suggestion=_css_reason(lang, prop, value),
                        lang=lang,
                        fixable=True,
                    )
                )

    for m in re.finditer(r"position\s*:\s*fixed", combined, re.I):
        issues.append(
            Issue(
                f"{CODE}-072",
                Severity.ERROR,
                "使用 position: fixed",
                file=css_items[0].path,
                suggestion="流式版面不支援；Apple Books 會退件，Kindle 轉檔會丟棄。",
                stores=("apple", "kdp"),
            )
        )
    for m in re.finditer(r"font-size\s*:\s*(\d+)px", combined, re.I):
        issues.append(
            Issue(
                f"{CODE}-073",
                Severity.WARN,
                f"字級使用固定 px（{m.group(0)}）",
                file=css_items[0].path,
                suggestion="改用 em/rem/%；px 會讓讀者無法調整字級，"
                "也違反無障礙要求（EAA/EN 301 549）。",
                stores=("apple", "kobo"),
            )
        )
    if re.search(r"@import", combined):
        issues.append(
            Issue(
                f"{CODE}-074",
                Severity.WARN,
                "CSS 使用 @import",
                file=css_items[0].path,
                suggestion="改用 <link>；部分閱讀器不處理 @import。",
            )
        )
    if lang in ("zh-Hant", "zh-Hans", "ja") and not re.search(r"text-indent", combined):
        issues.append(
            Issue(
                f"{CODE}-075",
                Severity.INFO,
                "中日文段落未設定 text-indent",
                file=css_items[0].path,
                suggestion="中日文慣例首行縮排兩個字寬：text-indent: 2em。",
                lang=lang,
                fixable=True,
            )
        )
    if not re.search(r"line-height", combined):
        issues.append(
            Issue(
                f"{CODE}-076",
                Severity.WARN,
                "未設定 line-height",
                file=css_items[0].path,
                suggestion="中日韓文建議 1.7–1.9，西文 1.4–1.6；"
                "預設行高對 CJK 過於擁擠。",
                lang=lang or None,
            )
        )
    return issues


def _css_reason(lang: str, prop: str, value: str) -> str:
    reasons = {
        ("ko", "word-break"): "韓文以「어절」（詞節）為斷行單位。沒有 word-break: keep-all，"
        "閱讀器會在音節中間硬斷，是韓文電子書最常見的排版客訴。",
        ("ja", "line-break"): "line-break: strict 啟用禁則處理（行頭に句読点や小書き仮名を置かない）。",
        ("zh-Hant", "line-break"): "line-break: strict 可避免標點出現在行首（禁則處理）。",
        ("zh-Hans", "line-break"): "line-break: strict 可避免标点出现在行首（避头尾规则）。",
        ("en", "hyphens"): "Justified English without hyphenation produces large word gaps; "
        "set hyphens: auto together with a correct lang attribute.",
        ("en", "orphans"): "Prevents single lines stranded at a page boundary.",
        ("en", "widows"): "Prevents single lines stranded at a page boundary.",
    }
    return reasons.get((lang, prop), f"建議加入 {prop}: {value};")
