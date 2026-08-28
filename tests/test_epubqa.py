#!/usr/bin/env python3
"""Test suite for epubqa. Standard library only:  python3 -m unittest discover tests"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from epubqa import fixes
from epubqa.checks.assets import image_info
from epubqa.cli import build_report
from epubqa.issues import Severity
from epubqa.langprofile import (
    SIMPLIFIED_ONLY,
    TRADITIONAL_ONLY,
    ZH_VOCAB_DIVERGENCE,
    detect_language,
    profile_for,
)
from epubqa.model import Epub, visible_text
from tools.make_fixtures import BOOKS, build, make_jpeg


class FixtureCase(unittest.TestCase):
    """Builds the five sample books once for the whole suite."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="epubqa-test-")
        cls.paths = {code: build(spec, cls.tmp) for code, spec in BOOKS.items()}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def codes(self, report) -> set:
        return {i.code for i in report.issues}

    def variant(self, code: str, name: str, edits: dict) -> str:
        """A copy of a fixture with some entries rewritten, added or dropped.

        A value of ``None`` deletes the entry; ``str``/``bytes`` replace or add
        it. Keeps mimetype first and stored, as the OCF spec requires.
        """
        src = self.paths[code]
        dest = os.path.join(self.tmp, f"{name}.epub")
        with zipfile.ZipFile(src) as zin:
            entries = [(i.filename, zin.read(i.filename)) for i in zin.infolist()]
        original = dict(entries)
        kept = [(n, edits.get(n, d)) for n, d in entries if edits.get(n, d) is not None]
        kept += [(n, v) for n, v in edits.items() if v is not None and n not in original]
        with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zout:
            mime = zipfile.ZipInfo("mimetype")
            mime.compress_type = zipfile.ZIP_STORED
            zout.writestr(mime, b"application/epub+zip")
            for n, data in kept:
                if n == "mimetype":
                    continue
                zout.writestr(n, data)
        return dest


# --------------------------------------------------------------- detection


class TestDetection(unittest.TestCase):
    def test_traditional_and_simplified_sets_are_disjoint(self):
        self.assertEqual(TRADITIONAL_ONLY & SIMPLIFIED_ONLY, set())

    def test_no_false_positives_on_clean_traditional_prose(self):
        """Regression: 了 was flagged as Simplified because 瞭 simplifies to 了.

        了 appears in nearly every Chinese sentence, so a single bad entry buried
        a real book's report under hundreds of bogus findings. Every character
        below is ordinary Traditional Chinese.
        """
        prose = (
            "我們不要就這樣算了，但也不要一直記得。他划著船來了，"
            "伙伴們坐在茶几旁曬太陽，掛念著那張面孔。"
            "只有乾淨的風從裡面吹過，以後的事誰知道呢？"
            "他幹活的樣子，準確得像一台鐘。"
        )
        self.assertEqual([c for c in prose if c in SIMPLIFIED_ONLY], [])
        self.assertEqual(detect_language(prose).lang, "zh-Hant")

    def test_still_detects_genuine_simplified(self):
        simplified = "我们不要就这样算了，他划着船来了，伙伴们坐在茶几旁晒太阳。"
        self.assertEqual(detect_language(simplified).lang, "zh-Hans")
        self.assertTrue([c for c in simplified if c in SIMPLIFIED_ONLY])

    def test_detects_each_language(self):
        cases = [
            ("The quick brown fox jumps over the lazy dog repeatedly.", "en"),
            ("這是一本關於風土與儀式的書，內容談論傳統與現代的對話。", "zh-Hant"),
            ("这是一本关于风土与仪式的书，内容谈论传统与现代的对话。", "zh-Hans"),
            ("これは風土と儀式についての本です。伝統と現代の対話を語ります。", "ja"),
            ("이것은 풍토와 의식에 관한 책입니다. 전통과 현대의 대화를 다룹니다.", "ko"),
        ]
        for text, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(detect_language(text).lang, expected)

    def test_kana_wins_over_shared_kanji(self):
        # Text that is mostly Han but contains kana must classify as Japanese.
        self.assertEqual(detect_language("東京都水道局の記録です。").lang, "ja")

    def test_profile_aliases(self):
        self.assertEqual(profile_for("zh-TW").code, "zh-Hant")
        self.assertEqual(profile_for("zh-Hant-HK").code, "zh-Hant")
        self.assertEqual(profile_for("zh-CN").code, "zh-Hans")
        self.assertEqual(profile_for("en-GB").code, "en")
        self.assertEqual(profile_for("ja-JP").code, "ja")
        # A bare "zh" is genuinely ambiguous and must not be guessed.
        self.assertIsNone(profile_for("zh"))


class TestBodyPlaceholders(unittest.TestCase):
    """Found on a real book whose colophon still read 出版日期：〔待補〕."""

    def matches(self, text: str) -> list:
        from epubqa.checks.metadata import BODY_PLACEHOLDERS

        return [m.group(0) for m in BODY_PLACEHOLDERS.finditer(text)]

    def test_catches_unfilled_colophon_fields(self):
        colophon = (
            "書名：我們不要就這樣算了\n"
            "出版：〔待補：自費出版平台，如 Amazon KDP〕\n"
            "出版日期：〔待補〕\n"
            "ISBN / ASIN：〔待補；KDP 會自動配發 ASIN〕\n"
            "聯絡方式：〔待補〕\n"
        )
        self.assertEqual(len(self.matches(colophon)), 4)

    def test_catches_template_and_lorem(self):
        self.assertTrue(self.matches("Published by {{PUBLISHER_NAME}} in 2026."))
        self.assertTrue(self.matches("Lorem ipsum dolor sit amet."))
        self.assertTrue(self.matches("By [YOUR NAME HERE]"))
        self.assertTrue(self.matches("出版日期：［待定］"))

    def test_no_false_positives_on_real_prose(self):
        """Anonymisation and cloze blanks are ordinary CJK writing, not filler."""
        prose = (
            "○○先生はそのとき何も言わなかった。＿＿＿に当てはまる語を書きなさい。\n"
            "他說：「這件事我們（暫時）不談。」ＸＸＸ 醫師搖了搖頭。\n"
            "TK 是他名字的縮寫。答案是 ____ 分。\n"
            "把「療癒」這個項目，從你的人生清單上，劃掉。"
        )
        self.assertEqual(self.matches(prose), [])


class TestIssueCodes(unittest.TestCase):
    def test_codes_are_unique(self):
        """Codes are the stable handle for suppression and run-to-run diffing,
        so two different findings must never share one."""
        import collections
        import pathlib
        import re

        seen = collections.defaultdict(list)
        checks_dir = pathlib.Path(__file__).resolve().parent.parent / "epubqa" / "checks"
        for path in sorted(checks_dir.glob("*.py")):
            src = path.read_text(encoding="utf-8")
            prefix = re.search(r'^CODE = "(\w+)"', src, re.M)
            if not prefix:
                continue
            for m in re.finditer(r'f"\{CODE\}-(\d+)"', src):
                seen[f"{prefix.group(1)}-{m.group(1)}"].append(path.name)
        dupes = {k: v for k, v in seen.items() if len(v) > 1}
        self.assertEqual(dupes, {}, f"duplicate issue codes: {dupes}")
        self.assertGreater(len(seen), 100)

    def test_fixable_flag_matches_reality(self):
        """A finding marked fixable must actually be repaired by the fixer.

        TYPO-016 (a lone em dash) is deliberately NOT fixable: it can be an
        intentional separator, so it is reported for a human to judge.
        """
        import pathlib
        import re

        typo = (
            pathlib.Path(__file__).resolve().parent.parent
            / "epubqa"
            / "checks"
            / "typography.py"
        ).read_text(encoding="utf-8")
        block = typo[typo.index('f"{CODE}-016"') : typo.index('f"{CODE}-016"') + 800]
        self.assertNotIn("fixable=True", block)


class TestImageHeaders(unittest.TestCase):
    def test_jpeg_dimensions(self):
        info = image_info(make_jpeg(1600, 2560))
        self.assertEqual(info["format"], "jpeg")
        self.assertEqual((info["width"], info["height"]), (1600, 2560))
        self.assertFalse(info["cmyk"])

    def test_cmyk_detected(self):
        self.assertTrue(image_info(make_jpeg(800, 1280, cmyk=True))["cmyk"])

    def test_png_dimensions(self):
        import struct
        import zlib

        ihdr = struct.pack(">II", 1200, 1800) + bytes([8, 2, 0, 0, 0])
        chunk = struct.pack(">I", len(ihdr)) + b"IHDR" + ihdr
        png = b"\x89PNG\r\n\x1a\n" + chunk
        info = image_info(png)
        self.assertEqual((info["width"], info["height"]), (1200, 1800))


class TestVisibleText(unittest.TestCase):
    def test_offsets_are_preserved(self):
        markup = "<p>hello</p>\n<p>world</p>"
        text = visible_text(markup)
        self.assertEqual(len(text), len(markup))
        self.assertEqual(text.count("\n"), markup.count("\n"))
        self.assertIn("hello", text)

    def test_script_and_style_stripped(self):
        markup = "<style>p{color:red}</style><p>keep</p>"
        text = visible_text(markup)
        self.assertNotIn("color", text)
        self.assertIn("keep", text)


# ------------------------------------------------------------------ checks


class TestChecks(FixtureCase):
    def test_every_fixture_reports_the_planted_blockers(self):
        for code, path in self.paths.items():
            with self.subTest(lang=code):
                report = build_report(Epub(path))
                found = self.codes(report)
                # mimetype not first / compressed
                self.assertIn("STRUCT-001", found)
                # OS junk file
                self.assertIn("STRUCT-005", found)
                # missing dcterms:modified
                self.assertIn("META-040", found)
                # no cover-image property
                self.assertIn("META-060", found)
                # chap2 has no lang attribute
                self.assertIn("LANG-010", found)
                # no accessibility metadata
                self.assertIn("A11Y-002", found)

    def test_zh_hant_finds_simplified_leftovers_and_traps(self):
        report = build_report(Epub(self.paths["zh-Hant"]))
        found = self.codes(report)
        self.assertIn("LANG-020", found)  # simplified characters present
        self.assertIn("LANG-021", found)  # one-to-many conversion traps
        self.assertIn("LANG-022", found)  # mainland vocabulary
        traps = [i.message for i in report.issues if i.code == "LANG-021"]
        self.assertTrue(any("頭髮" in m for m in traps), traps)
        self.assertTrue(any("輕鬆" in m for m in traps), traps)

    def test_zh_hans_flags_corner_brackets(self):
        report = build_report(Epub(self.paths["zh-Hans"]))
        self.assertIn("TYPO-022", self.codes(report))

    def test_bare_zh_language_tag_is_an_error(self):
        report = build_report(Epub(self.paths["zh-Hans"]))
        self.assertIn("META-022", self.codes(report))

    def test_zh_tw_suggests_script_subtag(self):
        report = build_report(Epub(self.paths["zh-Hant"]))
        self.assertIn("META-023", self.codes(report))

    def test_japanese_flags_mixed_punctuation_and_simplified(self):
        report = build_report(Epub(self.paths["ja"]))
        found = self.codes(report)
        self.assertIn("TYPO-030", found)  # 、。 vs ，．
        self.assertIn("LANG-030", found)  # PRC simplified characters
        self.assertIn("TYPO-032", found)  # ruby without rp

    def test_korean_requires_word_break_keep_all(self):
        report = build_report(Epub(self.paths["ko"]))
        keep_all = [i for i in report.issues if "word-break" in i.message]
        self.assertTrue(keep_all)
        # This is the defect Korean readers complain about, so it is not a nit.
        self.assertEqual(keep_all[0].severity, Severity.ERROR)

    def test_korean_flags_fullwidth_punctuation(self):
        report = build_report(Epub(self.paths["ko"]))
        self.assertIn("TYPO-042", self.codes(report))

    def test_english_flags_straight_quotes(self):
        report = build_report(Epub(self.paths["en"]))
        self.assertIn("TYPO-050", self.codes(report))

    def test_english_does_not_get_cjk_punctuation_rules(self):
        report = build_report(Epub(self.paths["en"]))
        cjk_only = {"TYPO-010", "TYPO-011", "TYPO-013", "TYPO-042"}
        self.assertEqual(self.codes(report) & cjk_only, set())

    def test_cover_dimension_check_runs_once_declared(self):
        # The fixture cover is 600x900: too small and the wrong ratio.
        path = self.paths["en"]
        epub = Epub(path)
        fixes.fix_all(epub, target_lang="en")
        dest = os.path.join(self.tmp, "cover-check.epub")
        epub.save(dest)
        found = self.codes(build_report(Epub(dest)))
        self.assertIn("ASSET-014", found)  # short edge below 1600px

    def test_language_mismatch_is_a_blocker(self):
        """A book declaring ja but containing Korean must be blocked."""
        path = os.path.join(self.tmp, "mismatch.epub")
        spec = dict(BOOKS["ko"])
        spec["language"] = "ja"
        spec["filename"] = "mismatch.epub"
        build(spec, self.tmp)
        report = build_report(Epub(path))
        blockers = [i for i in report.issues if i.code == "LANG-002"]
        self.assertTrue(blockers, "expected a declared-vs-detected language blocker")
        self.assertEqual(blockers[0].severity, Severity.BLOCKER)


# -------------------------------------------------------------------- fixes


class TestFixes(FixtureCase):
    def fixed(self, code: str):
        epub = Epub(self.paths[code])
        result = fixes.fix_all(epub)
        dest = os.path.join(self.tmp, f"fixed-{code}.epub")
        epub.save(dest)
        return dest, result

    def test_fix_clears_all_blockers_for_every_language(self):
        for code in BOOKS:
            with self.subTest(lang=code):
                before = build_report(Epub(self.paths[code]))
                dest, _ = self.fixed(code)
                after = build_report(Epub(dest))
                self.assertGreater(before.counts()[Severity.BLOCKER], 0)
                self.assertEqual(
                    after.counts()[Severity.BLOCKER],
                    0,
                    [i.message for i in after.issues if i.severity == Severity.BLOCKER],
                )

    def test_saved_epub_has_conformant_ocf_layout(self):
        for code in BOOKS:
            with self.subTest(lang=code):
                dest, _ = self.fixed(code)
                with zipfile.ZipFile(dest) as zf:
                    first = zf.infolist()[0]
                    self.assertEqual(first.filename, "mimetype")
                    self.assertEqual(first.compress_type, zipfile.ZIP_STORED)
                    self.assertEqual(zf.read("mimetype"), b"application/epub+zip")

    def test_fix_is_idempotent(self):
        dest, _ = self.fixed("zh-Hant")
        epub = Epub(dest)
        second = fixes.fix_all(epub)
        content_changes = [
            c for c in second.changes if c.rule in ("TYPO", "LANG") and "設定 lang" not in c.detail
        ]
        self.assertEqual(content_changes, [], [c.detail for c in content_changes])

    def test_conversion_traps_are_repaired(self):
        dest, _ = self.fixed("zh-Hant")
        epub = Epub(dest)
        text = epub.text("OEBPS/chap2.xhtml")
        for wrong, right in (("頭發", "頭髮"), ("輕松", "輕鬆"), ("那里", "那裡"), ("以后", "以後")):
            self.assertNotIn(wrong, text)
            self.assertIn(right, text)

    def test_typography_fixes_do_not_corrupt_markup(self):
        for code in BOOKS:
            with self.subTest(lang=code):
                dest, _ = self.fixed(code)
                epub = Epub(dest)
                for item in epub.content_docs():
                    from xml.etree import ElementTree as ET

                    ET.fromstring(epub.files[item.path])  # raises if malformed

    def test_english_quotes_become_curly_and_balanced(self):
        dest, _ = self.fixed("en")
        text = Epub(dest).text("OEBPS/chap1.xhtml")
        self.assertNotIn('"', text.split("<body>")[1])
        self.assertEqual(text.count("“"), text.count("”"))

    def test_korean_punctuation_converted_then_spaced(self):
        dest, _ = self.fixed("ko")
        text = Epub(dest).text("OEBPS/chap1.xhtml")
        self.assertNotIn("，", text)
        self.assertNotIn("。", text)
        self.assertIn("말했다, 이것은", text)  # halfwidth + following space

    def test_cjk_punctuation_converted(self):
        dest, _ = self.fixed("zh-Hans")
        text = Epub(dest).text("OEBPS/chap2.xhtml")
        self.assertIn("采挖那天，", text)

    def test_a11y_never_claims_alt_text_without_images(self):
        dest, _ = self.fixed("en")
        opf = Epub(dest).text("OEBPS/content.opf")
        # The fixtures have no <img> in content, so alternativeText must not appear.
        self.assertNotIn("alternativeText", opf)
        self.assertIn("schema:accessMode", opf)
        self.assertIn("schema:accessibilityHazard", opf)

    def test_lang_attributes_added_to_every_document(self):
        dest, _ = self.fixed("ja")
        epub = Epub(dest)
        for item in epub.content_docs():
            self.assertIn('lang="ja"', epub.text(item.path))

    def test_dry_run_does_not_write(self):
        epub = Epub(self.paths["en"])
        before = os.path.getsize(self.paths["en"])
        fixes.fix_all(epub)
        self.assertEqual(os.path.getsize(self.paths["en"]), before)

    def test_css_fix_never_injects_text_indent(self):
        # text-indent is inherited: writing it here would leak into every block
        # container — inline-block badges, diagram divs — and break the book's
        # own layout. TYPO-075 reports it; the fixer must not apply it.
        for code in BOOKS:
            with self.subTest(lang=code):
                dest, _ = self.fixed(code)
                css = Epub(dest).text("OEBPS/style.css")
                self.assertNotIn("text-indent", css)

    def test_css_fix_only_targets_body(self):
        # A wider selector list (p, li, blockquote…) would out-specify the
        # author's own rules instead of merely providing a baseline.
        for code in BOOKS:
            with self.subTest(lang=code):
                dest, _ = self.fixed(code)
                css = Epub(dest).text("OEBPS/style.css")
                added = css.split("/* --- epubqa:")[1:]
                self.assertTrue(added, "expected an epubqa CSS baseline block")
                for block in added:
                    selector = block.split("*/", 1)[1].split("{", 1)[0].strip()
                    self.assertEqual(selector, "body")


class TestNavContentModel(FixtureCase):
    """A book that passed every check here was rejected by a store.

    Its validator is epubcheck, which enforces the navigation document's
    content model: spans and anchors inside <nav> must contain text. Six
    empty `<span class="tocnum">` spacers, one per unnumbered entry, each an
    RSC-005 error.
    """

    NAV = """<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"
      lang="zh-Hant" xml:lang="zh-Hant">
<head><title>目錄</title></head><body>
<nav epub:type="toc" id="toc"><h1>目錄</h1><ol>
<li><a href="chap1.xhtml">%s第一章</a></li>
<li><a href="chap2.xhtml"><span class="n">貳</span>第二章</a></li>
</ol></nav>
</body></html>
"""

    def codes_for(self, nav_markup, name):
        path = self.variant("zh-Hant", name, {"OEBPS/nav.xhtml": nav_markup})
        return [i for i in build_report(Epub(path), "zh-Hant").issues if i.code == "STRUCT-046"]

    def test_empty_span_in_nav_is_a_blocker(self):
        hits = self.codes_for(self.NAV % '<span class="n"></span>', "nav-empty-span")
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0].severity, Severity.BLOCKER)
        self.assertEqual(hits[0].file, "OEBPS/nav.xhtml")

    def test_empty_anchor_in_nav_is_a_blocker(self):
        nav = self.NAV % ""
        nav = nav.replace('<li><a href="chap1.xhtml">第一章</a></li>',
                          '<li><a href="chap1.xhtml"></a></li>')
        self.assertEqual(len(self.codes_for(nav, "nav-empty-a")), 1)

    def test_populated_spans_are_fine(self):
        self.assertEqual(self.codes_for(self.NAV % '<span class="n">壹</span>', "nav-ok"), [])

    def test_empty_span_outside_nav_is_not_reported(self):
        # Only the navigation document has this restriction; an empty span in
        # ordinary content is valid XHTML and must not be flagged.
        nav = self.NAV % ""
        nav = nav.replace("</nav>", '</nav><p><span class="spacer"></span></p>')
        self.assertEqual(self.codes_for(nav, "nav-outside"), [])


class TestAdvisoryPrecision(FixtureCase):
    """Advisories that used to fire on correct books.

    Every one of these was a false positive found on a real title; a checker
    that cries wolf on good work teaches authors to ignore it.
    """

    def report_for(self, path, lang="zh-Hant"):
        return build_report(Epub(path), lang)

    def test_mainland_vocabulary_ignored_inside_work_titles(self):
        chapter = """<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-Hant" xml:lang="zh-Hant">
<head><title>x</title></head><body>
<p>二部曲《明天不是默認值》即將開始。</p>
</body></html>
"""
        path = self.variant("zh-Hant", "titles", {"OEBPS/chap2.xhtml": chapter})
        hits = [
            i
            for i in self.report_for(path).issues
            if i.code == "LANG-022" and i.file == "OEBPS/chap2.xhtml"
        ]
        self.assertEqual(hits, [], [i.message for i in hits])

    def test_mainland_vocabulary_still_flagged_in_ordinary_prose(self):
        chapter = """<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-Hant" xml:lang="zh-Hant">
<head><title>x</title></head><body>
<p>這個項目的軟件很好用。</p>
</body></html>
"""
        path = self.variant("zh-Hant", "prose", {"OEBPS/chap2.xhtml": chapter})
        hits = {
            i.message
            for i in self.report_for(path).issues
            if i.code == "LANG-022" and i.file == "OEBPS/chap2.xhtml"
        }
        self.assertEqual(len(hits), 2, hits)

    def test_shuju_is_not_treated_as_mainland_only(self):
        # 「數據」 is standard in Taiwan too; flagging it was a false positive.
        self.assertNotIn("數據", {cn for cn, _tw, _note in ZH_VOCAB_DIVERGENCE})

    def test_page_list_only_expected_when_a_print_source_is_declared(self):
        digital = self.report_for(self.paths["zh-Hant"])
        self.assertNotIn("A11Y-021", self.codes(digital))

        with zipfile.ZipFile(self.paths["zh-Hant"]) as z:
            text = z.read("OEBPS/content.opf").decode("utf-8")
        text = text.replace("</metadata>", "<dc:source>978-9-570-00000-0</dc:source></metadata>")
        path = self.variant("zh-Hant", "printsource", {"OEBPS/content.opf": text})
        self.assertIn("A11Y-021", self.codes(self.report_for(path)))

    def test_span_density_ignores_the_table_of_contents(self):
        # One class-driven span per entry is how a nav document is supposed to
        # look; the ratio only means something in prose.
        nav = """<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"
      lang="zh-Hant" xml:lang="zh-Hant">
<head><title>目錄</title></head><body>
<nav epub:type="toc" id="toc"><h1>目錄</h1><ol>
<li><a href="chap1.xhtml"><span class="n">壹</span><span class="t">風土</span></a></li>
<li><a href="chap2.xhtml"><span class="n">貳</span><span class="t">儀式</span></a></li>
</ol></nav>
</body></html>
"""
        path = self.variant("zh-Hant", "densenav", {"OEBPS/nav.xhtml": nav})
        hits = [i for i in self.report_for(path).issues if i.code == "STORE-021"]
        self.assertEqual(hits, [], [i.file for i in hits])

    def test_font_licence_reminder_stops_once_the_licence_ships(self):
        font = ("OEBPS/NotoSerifTC.woff2", b"wOF2" + b"\0" * 64)
        manifest_item = '<item id="f1" href="NotoSerifTC.woff2" media-type="font/woff2"/>'
        with zipfile.ZipFile(self.paths["zh-Hant"]) as z:
            opf = z.read("OEBPS/content.opf").decode("utf-8")
        opf_with_font = opf.replace("</manifest>", manifest_item + "</manifest>")

        without = self.variant(
            "zh-Hant", "font-nolicence",
            {"OEBPS/content.opf": opf_with_font, font[0]: font[1]},
        )
        self.assertIn("ASSET-037", self.codes(self.report_for(without)))

        licence_item = '<item id="ofl" href="OFL.txt" media-type="text/plain"/>'
        with_licence = self.variant(
            "zh-Hant", "font-licence",
            {
                "OEBPS/content.opf": opf_with_font.replace(
                    "</manifest>", licence_item + "</manifest>"
                ),
                font[0]: font[1],
                "OEBPS/OFL.txt": "SIL OPEN FONT LICENSE Version 1.1",
            },
        )
        self.assertNotIn("ASSET-037", self.codes(self.report_for(with_licence)))

    def test_prune_never_deletes_a_bundled_font_licence(self):
        licence_item = '<item id="ofl" href="OFL.txt" media-type="text/plain"/>'
        with zipfile.ZipFile(self.paths["en"]) as z:
            opf = z.read("OEBPS/content.opf").decode("utf-8")
        path = self.variant(
            "en", "prune-licence",
            {
                "OEBPS/content.opf": opf.replace("</manifest>", licence_item + "</manifest>"),
                "OEBPS/OFL.txt": "SIL OPEN FONT LICENSE Version 1.1",
            },
        )
        epub = Epub(path)
        fixes.optimize(epub, prune=True)
        dest = os.path.join(self.tmp, "pruned-licence.epub")
        epub.save(dest)
        self.assertIn("OEBPS/OFL.txt", set(zipfile.ZipFile(dest).namelist()))


class TestOptimize(FixtureCase):
    def test_prune_removes_orphans_but_never_the_cover(self):
        epub = Epub(self.paths["en"])
        fixes.optimize(epub, prune=True)
        dest = os.path.join(self.tmp, "opt.epub")
        epub.save(dest)
        names = set(zipfile.ZipFile(dest).namelist())
        self.assertIn("OEBPS/cover.jpg", names)
        self.assertNotIn("OEBPS/unused.jpg", names)
        self.assertNotIn(".DS_Store", names)

    def test_optimize_keeps_the_book_readable(self):
        epub = Epub(self.paths["ja"])
        fixes.optimize(epub, prune=True)
        dest = os.path.join(self.tmp, "opt-ja.epub")
        epub.save(dest)
        after = Epub(dest)
        self.assertEqual(len(after.content_docs()), 3)
        self.assertTrue(all(after.has(i.path) for i in after.content_docs()))


class TestReporters(FixtureCase):
    def test_all_formats_render(self):
        from epubqa import report as report_mod

        report = build_report(Epub(self.paths["zh-Hant"]))
        self.assertIn("上架前檢查", report_mod.render_terminal(report))
        self.assertIn("LANG-021", report_mod.render_markdown(report))
        html = report_mod.render_html(report)
        self.assertIn("<style>", html)
        self.assertIn("prefers-color-scheme", html)
        import json

        payload = json.loads(report_mod.render_json(report))
        self.assertEqual(payload["detected_language"], "zh-Hant")
        self.assertTrue(payload["issues"])

    def test_html_escapes_content(self):
        from epubqa import report as report_mod
        from epubqa.issues import Issue, Report

        rep = Report(epub_path="x.epub")
        rep.add(Issue("T-1", Severity.WARN, "<script>alert(1)</script>"))
        self.assertNotIn("<script>alert", report_mod.render_html(rep))


if __name__ == "__main__":
    unittest.main(verbosity=2)
