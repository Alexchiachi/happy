"""Language declaration vs. actual script consistency.

The expensive failure mode this catches: a zh-Hant book that still carries
Simplified characters after a sloppy conversion, or a CJK book with no ``lang``
attribute, which makes readers pick Han glyphs from the wrong locale — the text
is readable but visibly "foreign" to a native reader, and reviewers do notice.
"""

from __future__ import annotations

import re

from ..issues import Issue, Severity
from ..langprofile import (
    NOT_JAPANESE_HAN,
    PROFILES,
    SIMPLIFIED_ONLY,
    TRADITIONAL_ONLY,
    ZH_HANS_TRAPS,
    ZH_HANT_TRAPS,
    ZH_VOCAB_DIVERGENCE,
    detect_language,
    excerpt_at,
    is_hangul,
    is_kana,
    normalise_tag,
    profile_for,
)
from ..model import Epub, visible_text

CODE = "LANG"

#: A run of this many characters of another script triggers a "mixed language"
#: finding when it is not wrapped in its own lang attribute.
FOREIGN_RUN = 12


def check(epub: Epub, target_lang: str = "") -> list:
    issues = []
    declared = epub.declared_language()
    corpus = _corpus(epub)
    detection = detect_language(corpus)

    expected = target_lang or _canonical(declared) or detection.lang

    issues += _declaration_vs_content(epub, declared, detection, expected)
    issues += _doc_lang_attributes(epub, expected)
    if expected in ("zh-Hant", "zh-Hans"):
        issues += _chinese_purity(epub, expected)
        issues += _conversion_traps(epub, expected)
        issues += _vocab_divergence(epub, expected)
    if expected == "ja":
        issues += _japanese_purity(epub)
    if expected == "ko":
        issues += _korean_purity(epub)
    if expected == "en":
        issues += _english_purity(epub)
    return issues


def _canonical(tag: str) -> str:
    p = profile_for(tag)
    return p.code if p else ""


def _corpus(epub: Epub, limit: int = 200_000) -> str:
    parts = []
    size = 0
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        text = visible_text(epub.text(item.path))
        parts.append(text)
        size += len(text)
        if size > limit:
            break
    return "\n".join(parts)


def _declaration_vs_content(epub, declared, detection, expected) -> list:
    issues = []
    if not declared:
        return issues
    canonical = _canonical(declared)
    if detection.lang is None:
        issues.append(
            Issue(
                f"{CODE}-001",
                Severity.WARN,
                "內文文字量太少，無法驗證語言宣告是否正確",
                file=epub.opf_path,
            )
        )
        return issues

    if canonical and canonical != detection.lang and detection.confidence >= 0.6:
        issues.append(
            Issue(
                f"{CODE}-002",
                Severity.BLOCKER,
                f"dc:language 宣告為 {declared}（{canonical}），"
                f"但內文偵測為 {detection.lang}（信心 {detection.confidence:.0%}，{detection.reason}）",
                file=epub.opf_path,
                suggestion="語言標記錯誤會讓閱讀器選錯漢字字形、朗讀用錯語音、"
                "並在書店被歸到錯誤的語言分類。請修正 dc:language 或確認內容檔沒放錯。",
                stores=("kdp", "apple", "google", "kobo"),
                lang=canonical or None,
            )
        )
    elif not canonical and declared.lower().startswith("zh"):
        issues.append(
            Issue(
                f"{CODE}-003",
                Severity.ERROR,
                f"dc:language={declared} 未指明繁簡，內文偵測為 {detection.lang}",
                file=epub.opf_path,
                suggestion=f"改為 {detection.lang}。",
                fixable=True,
                lang=detection.lang,
            )
        )
    return issues


def _doc_lang_attributes(epub: Epub, expected: str) -> list:
    """Every content document needs lang + xml:lang on <html>."""
    issues = []
    want = expected or _canonical(epub.declared_language())
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        m = re.search(r"<html\b[^>]*>", markup, re.I | re.S)
        if not m:
            continue
        tag = m.group(0)
        line = markup.count("\n", 0, m.start()) + 1
        lang = re.search(r'(?<!xml:)\blang="([^"]*)"', tag)
        xml_lang = re.search(r'\bxml:lang="([^"]*)"', tag)

        if not lang and not xml_lang:
            if want in ("zh-Hant", "zh-Hans", "ja", "ko"):
                why = (
                    "中日韓共用同一批漢字碼位（Han unification），沒有 lang 屬性時"
                    "閱讀器會用系統語言挑字形，日文書可能顯示成中文字形。"
                )
            else:
                why = "缺少 lang 會使斷字（hyphenation）與朗讀語音選擇失準。"
            issues.append(
                Issue(
                    f"{CODE}-010",
                    Severity.ERROR,
                    "<html> 缺少 lang 與 xml:lang 屬性",
                    file=item.path,
                    line=line,
                    suggestion=f'加上 lang="{want}" xml:lang="{want}"。' + why,
                    stores=("apple", "google", "kobo"),
                    fixable=True,
                    lang=want or None,
                )
            )
            continue
        if not lang:
            issues.append(
                Issue(
                    f"{CODE}-011",
                    Severity.WARN,
                    "<html> 只有 xml:lang，缺少 lang",
                    file=item.path,
                    line=line,
                    suggestion="兩者都要：XHTML 序列化時閱讀器可能只讀其中一個。",
                    fixable=True,
                )
            )
        if not xml_lang:
            issues.append(
                Issue(
                    f"{CODE}-012",
                    Severity.WARN,
                    "<html> 只有 lang，缺少 xml:lang",
                    file=item.path,
                    line=line,
                    fixable=True,
                )
            )
        if lang and xml_lang and normalise_tag(lang.group(1)) != normalise_tag(xml_lang.group(1)):
            issues.append(
                Issue(
                    f"{CODE}-013",
                    Severity.ERROR,
                    f'lang="{lang.group(1)}" 與 xml:lang="{xml_lang.group(1)}" 不一致',
                    file=item.path,
                    line=line,
                    fixable=True,
                )
            )
        actual = lang.group(1) if lang else xml_lang.group(1)
        if want and normalise_tag(actual) != normalise_tag(want) and _canonical(actual) != want:
            issues.append(
                Issue(
                    f"{CODE}-014",
                    Severity.ERROR,
                    f'<html lang="{actual}"> 與 dc:language（{want}）不一致',
                    file=item.path,
                    line=line,
                    fixable=True,
                    lang=want,
                )
            )
    return issues


def _foreign_runs(text: str, predicate) -> list:
    """Find runs of characters satisfying ``predicate`` longer than FOREIGN_RUN."""
    hits = []
    run_start = None
    run_len = 0
    for idx, ch in enumerate(text):
        if predicate(ch):
            if run_start is None:
                run_start = idx
            run_len += 1
        elif ch.isspace() or ch in "、。，．・「」『』（）":
            continue  # punctuation does not break a run
        else:
            if run_start is not None and run_len >= FOREIGN_RUN:
                hits.append((run_start, run_len))
            run_start, run_len = None, 0
    if run_start is not None and run_len >= FOREIGN_RUN:
        hits.append((run_start, run_len))
    return hits


def _scan_docs(epub: Epub):
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        yield item, markup, visible_text(markup)


def _chinese_purity(epub: Epub, expected: str) -> list:
    """Detect characters from the wrong orthography — the classic symptom of a
    half-finished OpenCC run or copy-paste from the other edition."""
    issues = []
    wrong_set = SIMPLIFIED_ONLY if expected == "zh-Hant" else TRADITIONAL_ONLY
    wrong_name = "簡體" if expected == "zh-Hant" else "繁體"

    for item, markup, text in _scan_docs(epub):
        found = {}
        for idx, ch in enumerate(text):
            if ch in wrong_set:
                found.setdefault(ch, []).append(idx)
        if not found:
            continue
        total = sum(len(v) for v in found.values())
        sample = sorted(found.items(), key=lambda kv: -len(kv[1]))[:8]
        first_idx = min(v[0] for v in found.values())
        issues.append(
            Issue(
                f"{CODE}-020",
                Severity.ERROR,
                f"{expected} 版本中出現 {total} 個{wrong_name}字："
                + "、".join(f"{ch}×{len(pos)}" for ch, pos in sample),
                file=item.path,
                line=text.count("\n", 0, first_idx) + 1,
                excerpt=excerpt_at(text, first_idx),
                suggestion=f"逐一改為{'繁體' if expected == 'zh-Hant' else '简体'}字。"
                "混用會被讀者一眼看出，也是退書與負評的常見原因。",
                lang=expected,
            )
        )
    return issues


def _conversion_traps(epub: Epub, expected: str) -> list:
    """One-to-many conversion errors: valid characters, wrong word."""
    issues = []
    traps = ZH_HANT_TRAPS if expected == "zh-Hant" else ZH_HANS_TRAPS
    for item, markup, text in _scan_docs(epub):
        for trap in traps:
            for m in re.finditer(re.escape(trap.wrong), text):
                issues.append(
                    Issue(
                        f"{CODE}-021",
                        Severity.ERROR,
                        f"繁簡轉換一對多錯誤：「{trap.wrong}」應為「{trap.right}」",
                        file=item.path,
                        line=text.count("\n", 0, m.start()) + 1,
                        excerpt=excerpt_at(text, m.start()),
                        suggestion=f"{trap.note}。此類錯誤字元本身合法，拼寫檢查抓不到。",
                        lang=expected,
                        fixable=True,
                    )
                )
    return issues


#: Book, film and article titles are proper nouns: 《明天不是默認值》 must survive
#: a localisation pass untouched, however mainland the wording reads.
_TITLE_BRACKETS = re.compile(r"《[^》]{0,80}》|〈[^〉]{0,80}〉")


def _title_spans(text: str) -> list:
    return [m.span() for m in _TITLE_BRACKETS.finditer(text)]


def _inside(pos: int, spans) -> bool:
    return any(start <= pos < end for start, end in spans)


def _vocab_divergence(epub: Epub, expected: str) -> list:
    """Region vocabulary that is technically correct but reads as the other market."""
    if expected != "zh-Hant":
        return []
    issues = []
    for item, markup, text in _scan_docs(epub):
        titles = _title_spans(text)
        for cn, tw, note in ZH_VOCAB_DIVERGENCE:
            for m in re.finditer(re.escape(cn), text):
                if _inside(m.start(), titles):
                    continue
                issues.append(
                    Issue(
                        f"{CODE}-022",
                        Severity.INFO,
                        f"用詞偏中國大陸慣用：「{cn}」→ 台港常用「{tw}」",
                        file=item.path,
                        line=text.count("\n", 0, m.start()) + 1,
                        excerpt=excerpt_at(text, m.start()),
                        suggestion=f"{note}。若目標市場是台港，建議在地化用詞。",
                        lang=expected,
                    )
                )
    return issues


def _japanese_purity(epub: Epub) -> list:
    issues = []
    for item, markup, text in _scan_docs(epub):
        bad = {}
        for idx, ch in enumerate(text):
            if ch in NOT_JAPANESE_HAN:
                bad.setdefault(ch, []).append(idx)
        if bad:
            total = sum(len(v) for v in bad.values())
            first_idx = min(v[0] for v in bad.values())
            issues.append(
                Issue(
                    f"{CODE}-030",
                    Severity.ERROR,
                    f"日本語版に中国語簡体字が {total} 文字混入："
                    + "、".join(list(bad)[:10]),
                    file=item.path,
                    line=text.count("\n", 0, first_idx) + 1,
                    excerpt=excerpt_at(text, first_idx),
                    suggestion="日本語の新字体に置き換えてください（例：这→この、说→話）。",
                    lang="ja",
                )
            )
        for start, length in _foreign_runs(text, is_hangul):
            issues.append(
                Issue(
                    f"{CODE}-031",
                    Severity.WARN,
                    f"ハングルの連続 {length} 文字が lang 指定なしで出現",
                    file=item.path,
                    line=text.count("\n", 0, start) + 1,
                    excerpt=excerpt_at(text, start),
                    suggestion='引用なら <span lang="ko"> で囲むとフォントと読み上げが正しくなります。',
                    lang="ja",
                )
            )
    return issues


def _korean_purity(epub: Epub) -> list:
    issues = []
    for item, markup, text in _scan_docs(epub):
        for start, length in _foreign_runs(text, is_kana):
            issues.append(
                Issue(
                    f"{CODE}-040",
                    Severity.WARN,
                    f"가나 문자가 {length}자 연속으로 나타남 (lang 지정 없음)",
                    file=item.path,
                    line=text.count("\n", 0, start) + 1,
                    excerpt=excerpt_at(text, start),
                    suggestion='인용이라면 <span lang="ja">로 감싸 주세요.',
                    lang="ko",
                )
            )
        # Hanja without ruby is fine, but flag heavy usage for readability review.
        hanja = sum(1 for ch in text if "一" <= ch <= "鿿")
        hangul = sum(1 for ch in text if is_hangul(ch))
        if hangul and hanja / max(hangul, 1) > 0.05:
            issues.append(
                Issue(
                    f"{CODE}-041",
                    Severity.INFO,
                    f"한자 비율이 높음 (한자 {hanja} / 한글 {hangul})",
                    file=item.path,
                    suggestion="일반 독자 대상이라면 한글 병기 또는 <ruby> 사용을 검토하세요.",
                    lang="ko",
                )
            )
    return issues


def _english_purity(epub: Epub) -> list:
    issues = []
    for item, markup, text in _scan_docs(epub):
        cjk = [i for i, ch in enumerate(text) if "぀" <= ch <= "鿿" or is_hangul(ch)]
        if len(cjk) > 20:
            issues.append(
                Issue(
                    f"{CODE}-050",
                    Severity.WARN,
                    f"English edition contains {len(cjk)} CJK characters",
                    file=item.path,
                    line=text.count("\n", 0, cjk[0]) + 1,
                    excerpt=excerpt_at(text, cjk[0]),
                    suggestion="Untranslated source text left behind, or quotations that "
                    'need <span lang="zh-Hant"> / lang="ja" wrappers for correct glyphs.',
                    lang="en",
                )
            )
    return issues
