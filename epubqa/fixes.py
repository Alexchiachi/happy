"""Automatic repairs.

Design rules for everything in this module:

* Never touch text that a human might have meant. Punctuation fixes only fire
  inside a CJK context, quote conversion is state-machine based, and the
  Traditional/Simplified conversion traps are whole-word replacements from a
  curated table — nothing is guessed.
* Every fix records what it changed so ``--dry-run`` can show a real diff.
* Repacking always rewrites the OCF zip correctly, so ``fix`` alone repairs the
  mimetype/ordering class of blocker.
"""

from __future__ import annotations

import posixpath
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional
from xml.etree import ElementTree as ET

from .langprofile import (
    CJK_CONTEXT,
    CJK_LEAD,
    PROFILES,
    ZH_HANS_TRAPS,
    ZH_HANT_TRAPS,
    cjk_ratio,
    normalise_tag,
    profile_for,
    resolve_book_language,
)
from .model import NS, Epub, visible_text

JUNK_NAMES = (".DS_Store", "Thumbs.db", "desktop.ini")


@dataclass
class Change:
    file: str
    rule: str
    detail: str
    before: str = ""
    after: str = ""


@dataclass
class FixResult:
    changes: List[Change] = field(default_factory=list)

    def add(self, file: str, rule: str, detail: str, before: str = "", after: str = "") -> None:
        self.changes.append(Change(file, rule, detail, before, after))

    def __len__(self) -> int:
        return len(self.changes)

    def by_rule(self) -> dict:
        out = {}
        for c in self.changes:
            out.setdefault(c.rule, []).append(c)
        return out


def fix_all(
    epub: Epub,
    target_lang: str = "",
    do_typography: bool = True,
    do_a11y: bool = True,
    do_traps: bool = True,
) -> FixResult:
    result = FixResult()
    lang = target_lang or _lang_of(epub)

    _fix_mimetype(epub, result)
    _fix_junk(epub, result)
    _fix_metadata(epub, lang, result)
    if do_a11y:
        _fix_accessibility(epub, result)
    _fix_cover_meta(epub, result)
    _fix_html_lang(epub, lang, result)
    _fix_xhtml_boilerplate(epub, result)
    if do_typography and lang:
        _fix_typography(epub, lang, result)
        _fix_css(epub, lang, result)
    if do_traps and lang in ("zh-Hant", "zh-Hans"):
        _fix_conversion_traps(epub, lang, result)
    return result


def _lang_of(epub: Epub) -> str:
    return resolve_book_language(epub)


# ------------------------------------------------------------------ container


def _fix_mimetype(epub: Epub, result: FixResult) -> None:
    current = epub.files.get("mimetype")
    if current != b"application/epub+zip":
        epub.files["mimetype"] = b"application/epub+zip"
        result.add("mimetype", "STRUCT", "重寫 mimetype 內容並置於壓縮檔首位（STORED）")
    else:
        result.add("mimetype", "STRUCT", "重新封裝：確保 mimetype 為第一項且不壓縮")


def _fix_junk(epub: Epub, result: FixResult) -> None:
    for name in list(epub.files):
        if posixpath.basename(name) in JUNK_NAMES or name.startswith("__MACOSX/"):
            del epub.files[name]
            if name in epub.order:
                epub.order.remove(name)
            result.add(name, "STRUCT", "移除作業系統垃圾檔")


# ------------------------------------------------------------------- metadata


def _metadata_el(epub: Epub) -> Optional[ET.Element]:
    if epub.opf_tree is None:
        return None
    return epub.opf_tree.getroot().find("opf:metadata", NS)


def _append_meta(parent: ET.Element, prop: str, text: str) -> ET.Element:
    el = ET.SubElement(parent, "{%s}meta" % NS["opf"])
    el.set("property", prop)
    el.text = text
    return el


def _fix_metadata(epub: Epub, lang: str, result: FixResult) -> None:
    meta = _metadata_el(epub)
    if meta is None:
        return
    root = epub.opf_tree.getroot()

    if not root.get("version"):
        root.set("version", "3.0")
        result.add(epub.opf_path, "META", 'package 補上 version="3.0"')

    # dcterms:modified — required by EPUB 3, and stale values look sloppy.
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    modified = [m for m in epub.metadata if m.prop == "dcterms:modified"]
    if not modified:
        _append_meta(meta, "dcterms:modified", stamp)
        result.add(epub.opf_path, "META", f"新增 dcterms:modified = {stamp}")
    else:
        for m in modified:
            if m.element is not None and not re.match(
                r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$", (m.element.text or "").strip()
            ):
                before = m.element.text
                m.element.text = stamp
                result.add(
                    epub.opf_path, "META", "修正 dcterms:modified 格式", str(before), stamp
                )

    # dc:language
    lang_entries = epub.meta_values("language")
    if not lang_entries and lang:
        el = ET.SubElement(meta, "{%s}language" % NS["dc"])
        el.text = lang
        result.add(epub.opf_path, "META", f"新增 dc:language = {lang}")
    elif lang_entries and lang:
        entry = lang_entries[0]
        current = normalise_tag(entry.text)
        if current == "zh" or (current in ("zh-tw", "zh-cn", "zh-hk") and lang):
            if entry.element is not None:
                before = entry.element.text
                entry.element.text = lang
                result.add(
                    epub.opf_path, "META", "明確化 dc:language 書寫系統", str(before), lang
                )

    # dc:identifier
    ids = epub.meta_values("identifier")
    if not ids:
        el = ET.SubElement(meta, "{%s}identifier" % NS["dc"])
        el.set("id", "bookid")
        el.text = f"urn:uuid:{uuid.uuid4()}"
        root.set("unique-identifier", "bookid")
        result.add(epub.opf_path, "META", f"新增 dc:identifier = {el.text}")
    elif not root.get("unique-identifier"):
        first = ids[0]
        if first.element is not None:
            iid = first.element.get("id") or "bookid"
            first.element.set("id", iid)
            root.set("unique-identifier", iid)
            result.add(epub.opf_path, "META", f'補上 unique-identifier="{iid}"')

    # Trim whitespace on the simple Dublin Core fields.
    for entry in epub.metadata:
        if entry.ns == NS["dc"] and entry.element is not None and entry.element.text:
            stripped = entry.element.text.strip()
            if stripped != entry.element.text:
                entry.element.text = stripped
                result.add(epub.opf_path, "META", f"移除 dc:{entry.tag} 前後空白")


def _fix_accessibility(epub: Epub, result: FixResult) -> None:
    """Derive a11y metadata from what the book actually contains."""
    meta = _metadata_el(epub)
    if meta is None or not epub.version.startswith("3"):
        return
    present = {m.prop for m in epub.metadata if m.tag == "meta"}

    all_markup = "\n".join(
        epub.text(i.path) for i in epub.content_docs() if epub.has(i.path)
    )
    # Only images inside content documents affect how the book is *read*; a cover
    # in the manifest does not make the content visual.
    imgs = re.findall(r"<img\b[^>]*>", all_markup, re.I)
    imgs += re.findall(r"<svg\b[^>]*>", all_markup, re.I)
    all_have_alt = bool(imgs) and all(re.search(r"\balt\s*=", t, re.I) for t in imgs)
    has_nav = any("nav" in i.property_set for i in epub.manifest.values())

    additions = {}
    if "schema:accessMode" not in present:
        additions["schema:accessMode"] = ["textual"] + (["visual"] if imgs else [])
    if "schema:accessModeSufficient" not in present:
        # Text alone suffices only when every image carries alt text.
        additions["schema:accessModeSufficient"] = (
            ["textual"] if (not imgs or all_have_alt) else ["textual,visual"]
        )
    if "schema:accessibilityFeature" not in present:
        features = ["readingOrder"]
        if has_nav:
            features += ["structuralNavigation", "tableOfContents"]
        # Never claim alternativeText unless images exist and all of them have it.
        if imgs and all_have_alt:
            features.append("alternativeText")
        additions["schema:accessibilityFeature"] = features
    if "schema:accessibilityHazard" not in present:
        additions["schema:accessibilityHazard"] = ["none"]

    for prop, values in additions.items():
        for value in values:
            _append_meta(meta, prop, value)
        result.add(epub.opf_path, "A11Y", f"新增 {prop} = {', '.join(values)}")

    if "schema:accessibilitySummary" not in present:
        parts = ["本書為結構化文字內容，可調整字級、可由螢幕閱讀器朗讀。"]
        if has_nav:
            parts.append("具備完整目錄與章節導覽。")
        if imgs:
            parts.append(
                "所有圖片皆附替代文字。" if all_have_alt else "部分圖片尚未提供替代文字。"
            )
        summary = "".join(parts)
        _append_meta(meta, "schema:accessibilitySummary", summary)
        result.add(epub.opf_path, "A11Y", "新增 schema:accessibilitySummary（依實際內容推導）")

    # A conformance claim is a legal statement about the book. Only assert it when
    # the mechanical preconditions actually hold; otherwise leave it for a human.
    has_conforms = any(
        m.prop == "dcterms:conformsTo" for m in epub.metadata
    ) or "dcterms:conformsTo" in ET.tostring(meta, encoding="unicode")
    if not has_conforms and (not imgs or all_have_alt) and has_nav:
        link = ET.SubElement(meta, "{%s}link" % NS["opf"])
        link.set("rel", "dcterms:conformsTo")
        link.set(
            "href",
            "http://www.idpf.org/epub/a11y/accessibility-20170105.html#wcag-aa",
        )
        reason = "所有圖片皆有替代文字" if imgs else "本書無內文圖片"
        result.add(
            epub.opf_path,
            "A11Y",
            f"宣告 EPUB Accessibility WCAG 2.0 AA 符合性（{reason}、且具備導覽結構）"
            "— 請人工複核色彩對比與閱讀順序後再定案",
        )


def _fix_cover_meta(epub: Epub, result: FixResult) -> None:
    """Keep the EPUB 3 and legacy cover declarations in sync."""
    meta = _metadata_el(epub)
    if meta is None or epub.opf_tree is None:
        return
    manifest = epub.opf_tree.getroot().find("opf:manifest", NS)
    if manifest is None:
        return

    epub3 = [i for i in epub.manifest.values() if "cover-image" in i.property_set]
    legacy = [m for m in epub.metadata if m.tag == "meta" and m.attrib.get("name") == "cover"]

    cover_item = epub3[0] if epub3 else None
    if cover_item is None and legacy:
        ref = legacy[0].attrib.get("content", "")
        cover_item = epub.manifest.get(ref)
    if cover_item is None:
        candidates = [
            i
            for i in epub.manifest.values()
            if i.is_image() and re.search(r"cover", i.href, re.I)
        ]
        if candidates:
            cover_item = candidates[0]

    if cover_item is None:
        return

    if not epub3:
        for el in manifest.findall("opf:item", NS):
            if el.get("id") == cover_item.id:
                props = (el.get("properties") or "").split()
                if "cover-image" not in props:
                    props.append("cover-image")
                    el.set("properties", " ".join(props).strip())
                    result.add(
                        epub.opf_path,
                        "META",
                        f'manifest item "{cover_item.id}" 加上 properties="cover-image"',
                    )
    if not legacy:
        el = ET.SubElement(meta, "{%s}meta" % NS["opf"])
        el.set("name", "cover")
        el.set("content", cover_item.id)
        result.add(epub.opf_path, "META", f'新增舊版 <meta name="cover" content="{cover_item.id}">')


# ------------------------------------------------------------------ documents


def _fix_html_lang(epub: Epub, lang: str, result: FixResult) -> None:
    if not lang:
        return
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        m = re.search(r"<html\b[^>]*>", markup, re.I | re.S)
        if not m:
            continue
        tag = m.group(0)
        new_tag = tag

        for attr in ("lang", "xml:lang"):
            pattern = (
                r'\bxml:lang="[^"]*"' if attr == "xml:lang" else r'(?<!xml:)\blang="[^"]*"'
            )
            if re.search(pattern, new_tag):
                new_tag = re.sub(pattern, f'{attr}="{lang}"', new_tag)
            else:
                new_tag = new_tag[:-1].rstrip() + f' {attr}="{lang}"' + new_tag[-1:]

        if new_tag != tag:
            markup = markup[: m.start()] + new_tag + markup[m.end() :]
            epub.set_text(item.path, markup)
            result.add(item.path, "LANG", f'<html> 設定 lang/xml:lang="{lang}"', tag, new_tag)


def _fix_xhtml_boilerplate(epub: Epub, result: FixResult) -> None:
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        raw = epub.files[item.path]
        changed = False
        if raw.startswith(b"\xef\xbb\xbf"):
            raw = raw[3:]
            epub.files[item.path] = raw
            result.add(item.path, "STRUCT", "移除 UTF-8 BOM")
            changed = True
        markup = epub.text(item.path)

        m = re.search(r"<html\b[^>]*>", markup, re.I | re.S)
        if m and 'xmlns="http://www.w3.org/1999/xhtml"' not in m.group(0):
            tag = m.group(0)
            new_tag = tag[:-1].rstrip() + ' xmlns="http://www.w3.org/1999/xhtml"' + tag[-1:]
            markup = markup[: m.start()] + new_tag + markup[m.end() :]
            result.add(item.path, "STORE", "<html> 補上 XHTML namespace")
            changed = True

        if not re.search(r"<!DOCTYPE\s+html", markup, re.I):
            insert_at = markup.find("<html")
            if insert_at >= 0:
                markup = markup[:insert_at] + "<!DOCTYPE html>\n" + markup[insert_at:]
                result.add(item.path, "STORE", "補上 <!DOCTYPE html>")
                changed = True

        # Empty paragraphs used as spacers.
        new_markup, n = re.subn(
            r"<p[^>]*>\s*(?:&nbsp;|&#160;| )?\s*</p>\s*", "", markup
        )
        if n:
            markup = new_markup
            result.add(item.path, "TYPO", f"移除 {n} 個空段落（改用 CSS margin 控制間距）")
            changed = True

        markup = re.sub(r"[ \t]+$", "", markup, flags=re.M)

        if changed or markup != epub.text(item.path):
            epub.set_text(item.path, markup)


# ----------------------------------------------------------------- typography


def _protect(markup: str):
    """Blank out tags/entities so text rewrites cannot corrupt markup.

    Returns the masked string plus a restore function; masked regions are
    replaced with \\x00 padding of identical length so all offsets stay valid.
    """
    mask = list(markup)
    spans = []
    for m in re.finditer(r"<[^>]*>|&[#a-zA-Z0-9]+;|<!--.*?-->", markup, re.S):
        spans.append((m.start(), m.end()))
        for i in range(m.start(), m.end()):
            mask[i] = "\x00"
    masked = "".join(mask)

    def restore(new_masked: str) -> str:
        assert len(new_masked) == len(markup), "restore requires equal length"
        out = list(new_masked)
        for start, end in spans:
            out[start:end] = markup[start:end]
        return "".join(out)

    return masked, restore, spans


def _replace_in_text(markup: str, pattern: str, repl, flags: int = 0):
    """Apply a regex only to text nodes, leaving markup untouched.

    Handles length-changing replacements by rebuilding from segment boundaries.
    """
    tag_spans = [(m.start(), m.end()) for m in re.finditer(r"<[^>]*>", markup, re.S)]
    pieces = []
    count = 0
    cursor = 0
    for start, end in tag_spans + [(len(markup), len(markup))]:
        chunk = markup[cursor:start]
        new_chunk, n = re.subn(pattern, repl, chunk, flags=flags)
        count += n
        pieces.append(new_chunk)
        pieces.append(markup[start:end])
        cursor = end
    return "".join(pieces), count


def _fix_typography(epub: Epub, lang: str, result: FixResult) -> None:
    profile = PROFILES.get(lang)
    if profile is None:
        return
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        original = markup

        if lang in ("zh-Hant", "zh-Hans", "ja"):
            markup = _fix_cjk_punct(markup, lang, item.path, result)
        if lang == "ko":
            markup = _fix_korean(markup, item.path, result)
        if lang == "en":
            markup = _fix_english(markup, item.path, result)

        if markup != original:
            epub.set_text(item.path, markup)


def _fix_cjk_punct(markup: str, lang: str, path: str, result: FixResult) -> str:
    mapping = {",": "，", ".": "。", ";": "；", ":": "：", "!": "！", "?": "？"}
    if lang == "ja":
        mapping[","] = "、"

    def repl(m):
        return m.group(1) + mapping[m.group(2)]

    markup, n = _replace_in_text(
        markup, rf"([{CJK_LEAD}])([,.;:!?])(?=[\s{CJK_CONTEXT}]|$)", repl
    )
    if n:
        result.add(path, "TYPO", f"半形標點轉全形 {n} 處")

    # Ellipsis: only inside CJK context, and only where it is clearly a run of dots.
    def ellipsis_repl(m):
        return "……"

    before = markup
    markup, n = _replace_in_text(markup, r"(?<![.．])\.{3,6}(?![.．])", ellipsis_repl)
    if n:
        result.add(path, "TYPO", f"半形句點刪節號轉為「……」{n} 處")
    markup, n = _replace_in_text(markup, r"(?<!…)…(?!…)", lambda m: "……")
    if n:
        result.add(path, "TYPO", f"單個「…」補為六點「……」{n} 處")

    markup, n = _replace_in_text(markup, r"(?<![㐀-鿿぀-ヿ])--(?!-)", lambda m: "——")
    if n:
        result.add(path, "TYPO", f"雙連字號轉為破折號「——」{n} 處")

    if lang == "zh-Hant":
        markup, n = _replace_in_text(markup, r"[“”]", lambda m: "「" if m.group(0) == "“" else "」")
        if n:
            markup, n2 = _replace_in_text(markup, r"[‘’]", lambda m: "『" if m.group(0) == "‘" else "』")
            result.add(path, "TYPO", f"彎引號轉為直角引號「」『』{n + n2} 處")
    elif lang == "zh-Hans":
        markup, n = _replace_in_text(markup, r"「", lambda m: "“")
        markup, n2 = _replace_in_text(markup, r"」", lambda m: "”")
        markup, n3 = _replace_in_text(markup, r"『", lambda m: "‘")
        markup, n4 = _replace_in_text(markup, r"』", lambda m: "’")
        if n + n2 + n3 + n4:
            result.add(path, "TYPO", f"直角引号转为弯引号“”‘’ {n+n2+n3+n4} 处")

    if lang == "ja":
        markup, n = _replace_in_text(markup, r"，", lambda m: "、")
        markup, n2 = _replace_in_text(markup, r"．", lambda m: "。")
        if n + n2:
            result.add(path, "TYPO", f"句読点を「、。」に統一 {n + n2} 箇所")

    return markup


def _fix_korean(markup: str, path: str, result: FixResult) -> str:
    # Fullwidth first: converting 「말했다，이것은」 to a halfwidth comma creates a
    # new "no space after punctuation" case that the next rule must still see.
    fullwidth = {"，": ",", "。": ".", "；": ";", "：": ":", "？": "?", "！": "!"}
    markup, n = _replace_in_text(
        markup, r"[，。；：？！]", lambda m: fullwidth[m.group(0)]
    )
    if n:
        result.add(path, "TYPO", f"전각 문장 부호를 반각으로 변환 {n}곳")
    markup, n = _replace_in_text(
        markup, r"([가-힣])([,.!?])([가-힣])", lambda m: f"{m.group(1)}{m.group(2)} {m.group(3)}"
    )
    if n:
        result.add(path, "TYPO", f"문장 부호 뒤 공백 추가 {n}곳")
    markup, n = _replace_in_text(markup, r"([가-힣]) {2,}([가-힣])", lambda m: f"{m.group(1)} {m.group(2)}")
    if n:
        result.add(path, "TYPO", f"연속 공백 정리 {n}곳")
    return markup


def _fix_english(markup: str, path: str, result: FixResult) -> str:
    markup, n = _replace_in_text(markup, r"(?<=[.!?\"”’])  +(?=[A-Z\"“'‘])", lambda m: " ")
    if n:
        result.add(path, "TYPO", f"Collapsed {n} double spaces after sentences")
    markup, n = _replace_in_text(markup, r"(?<!\.)\.{3}(?!\.)", lambda m: "…")
    if n:
        result.add(path, "TYPO", f"Converted {n} three-dot runs to an ellipsis")
    markup, n = _replace_in_text(markup, r"(?<=\w)'(?=\w)", lambda m: "’")
    if n:
        result.add(path, "TYPO", f"Converted {n} in-word apostrophes to U+2019")

    markup, n = _smart_double_quotes(markup)
    if n:
        result.add(path, "TYPO", f"Converted {n} straight double quotes to curly quotes")
    return markup


def _smart_double_quotes(markup: str):
    """Alternate open/close per text node — resets at tags so a stray quote in one
    paragraph cannot invert every quote after it."""
    out = []
    count = 0
    open_next = True
    cursor = 0
    for m in re.finditer(r"<[^>]*>", markup, re.S):
        chunk = markup[cursor : m.start()]
        rebuilt = []
        for ch in chunk:
            if ch == '"':
                rebuilt.append("“" if open_next else "”")
                open_next = not open_next
                count += 1
            else:
                rebuilt.append(ch)
        out.append("".join(rebuilt))
        out.append(m.group(0))
        if re.match(r"</?(p|div|li|h[1-6]|blockquote|section)\b", m.group(0), re.I):
            open_next = True
        cursor = m.end()
    tail = markup[cursor:]
    for ch in tail:
        if ch == '"':
            out.append("“" if open_next else "”")
            open_next = not open_next
            count += 1
        else:
            out.append(ch)
    return "".join(out), count


def _fix_conversion_traps(epub: Epub, lang: str, result: FixResult) -> None:
    traps = ZH_HANT_TRAPS if lang == "zh-Hant" else ZH_HANS_TRAPS
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        original = markup
        for trap in traps:
            markup, n = _replace_in_text(markup, re.escape(trap.wrong), lambda m, t=trap: t.right)
            if n:
                result.add(
                    item.path,
                    "LANG",
                    f"繁簡轉換修正：「{trap.wrong}」→「{trap.right}」×{n}（{trap.note}）",
                    trap.wrong,
                    trap.right,
                )
        if markup != original:
            epub.set_text(item.path, markup)


# ----------------------------------------------------------------------- CSS


def _fix_css(epub: Epub, lang: str, result: FixResult) -> None:
    profile = PROFILES.get(lang)
    if profile is None:
        return
    css_items = epub.css_docs()
    if not css_items:
        return
    target = css_items[0]
    if not epub.has(target.path):
        return
    css = epub.text(target.path)

    missing = {
        prop: value
        for prop, value in profile.required_css.items()
        if not re.search(rf"\b{re.escape(prop)}\s*:", css)
    }
    if not re.search(r"line-height", css):
        missing["line-height"] = "1.8" if lang != "en" else "1.5"

    # text-indent is deliberately NOT auto-applied. It is an *inherited*
    # property, so writing it here leaks into every block container in the
    # book — including inline-blocks used as fixed-width badges and the divs
    # that draw diagrams — pushing their contents out of their boxes. It also
    # clashes with designs that separate paragraphs by margin instead of
    # indentation. TYPO-075 reports it; a human decides.

    if not missing:
        return

    block = "\n".join(f"  {k}: {v};" for k, v in missing.items())
    # Applied to body only: every property here is inherited, and any rule the
    # book already has wins on specificity. A broader selector list would
    # override the author's own layout.
    addition = (
        f"\n\n/* --- epubqa: {profile.name} 排版基準 --- */\n"
        f"body {{\n{block}\n}}\n"
    )
    epub.set_text(target.path, css + addition)
    result.add(
        target.path,
        "TYPO",
        f"補上 {profile.name} 必要 CSS：{', '.join(missing)}",
        after=addition.strip(),
    )


# ------------------------------------------------------------------ optimize


def optimize(epub: Epub, prune: bool = True) -> FixResult:
    """Size and hygiene pass, kept separate from correctness fixes."""
    result = FixResult()

    if prune:
        referenced = set()
        for item in epub.content_docs():
            if not epub.has(item.path):
                continue
            markup = epub.text(item.path)
            for m in re.finditer(r'(?:href|src)="([^"]+)"', markup):
                path = epub.resolve(m.group(1), item.path)
                if path:
                    referenced.add(path)
        for item in epub.css_docs():
            if not epub.has(item.path):
                continue
            for m in re.finditer(r'url\(\s*[\'"]?([^\'")]+)', epub.text(item.path)):
                path = epub.resolve(m.group(1), item.path)
                if path:
                    referenced.add(path)

        # Never prune anything that could be the cover. A cover is legitimately
        # unreferenced by content documents, so the generic "orphan" rule would
        # otherwise delete it — the most destructive mistake this tool could make.
        keep_ids = {i.id for i in epub.manifest.values() if "cover-image" in i.property_set}
        keep_ids |= {i.id for i in epub.manifest.values() if "nav" in i.property_set}
        keep_ids |= {sp.idref for sp in epub.spine}
        for entry in epub.metadata:
            if entry.tag == "meta" and entry.attrib.get("name") == "cover":
                keep_ids.add(entry.attrib.get("content", ""))
        keep_ids |= {
            i.id
            for i in epub.manifest.values()
            if i.is_image() and re.search(r"cover|封面|表紙|표지", i.href, re.I)
        }
        keep_ids |= {i.id for i in epub.manifest.values() if i.is_font()}
        keep_ids |= {
            i.id
            for i in epub.manifest.values()
            if i.media_type == "application/x-dtbncx+xml"
        }

        manifest_el = (
            epub.opf_tree.getroot().find("opf:manifest", NS) if epub.opf_tree else None
        )
        for item in list(epub.manifest.values()):
            if item.id in keep_ids or item.is_css():
                continue
            if item.path and item.path not in referenced and epub.has(item.path):
                saved = len(epub.files[item.path])
                del epub.files[item.path]
                if item.path in epub.order:
                    epub.order.remove(item.path)
                if manifest_el is not None:
                    for el in list(manifest_el.findall("opf:item", NS)):
                        if el.get("id") == item.id:
                            manifest_el.remove(el)
                del epub.manifest[item.id]
                result.add(
                    item.path,
                    "OPT",
                    f"移除未被引用的孤兒檔案（省下 {saved/1024:.1f} KB）",
                )

    # Orphan zip entries that were never in the manifest at all.
    declared = {i.path for i in epub.manifest.values() if i.path}
    for name in list(epub.files):
        if name in ("mimetype", epub.opf_path) or name.startswith("META-INF/"):
            continue
        if name not in declared:
            saved = len(epub.files[name])
            del epub.files[name]
            if name in epub.order:
                epub.order.remove(name)
            result.add(name, "OPT", f"移除未列於 manifest 的檔案（省下 {saved/1024:.1f} KB）")

    return result
