"""Command line interface.

    epubqa check    book.epub               檢查
    epubqa fix      book.epub -o out.epub   自動修正
    epubqa optimize book.epub -o out.epub   瘦身與清理
    epubqa batch    dist/                   批次檢查多語版本並比對一致性
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

from . import fixes, report as report_mod
from .checks import REGISTRY, run_all
from .issues import Report, Severity
from .langprofile import PROFILES, detect_language, profile_for
from .model import Epub, EpubError, visible_text

EXIT_OK = 0
EXIT_ISSUES = 1
EXIT_BLOCKED = 2
EXIT_ERROR = 3


def build_report(epub: Epub, target_lang: str = "", only=None, skip=None) -> Report:
    corpus = "\n".join(
        visible_text(epub.text(i.path)) for i in epub.content_docs() if epub.has(i.path)
    )
    detection = detect_language(corpus)
    rep = Report(
        epub_path=epub.path,
        declared_lang=epub.declared_language() or None,
        detected_lang=detection.lang,
        epub_version=epub.version or None,
    )
    rep.stats = {
        "size_mb": epub.file_size() / 1024 / 1024,
        "uncompressed_mb": epub.uncompressed_size() / 1024 / 1024,
        "chars": len([c for c in corpus if not c.isspace()]),
        "documents": len(epub.content_docs()),
        "images": len([i for i in epub.manifest.values() if i.is_image()]),
        "fonts": len([i for i in epub.manifest.values() if i.is_font()]),
        "detection_confidence": round(detection.confidence, 3),
        "detection_reason": detection.reason,
    }
    rep.extend(run_all(epub, target_lang or "", only=only, skip=skip))
    return rep


def _emit(rep: Report, args) -> None:
    fmt = args.format
    if fmt == "text":
        out = report_mod.render_terminal(rep, verbose=args.verbose)
    elif fmt == "json":
        out = report_mod.render_json(rep)
    elif fmt == "markdown":
        out = report_mod.render_markdown(rep)
    elif fmt == "html":
        out = report_mod.render_html(rep)
    else:
        out = report_mod.render_terminal(rep, verbose=args.verbose)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(out)
        print(f"報告已寫入 {args.output}")
        if fmt != "text":
            print(report_mod.render_terminal(rep, verbose=False, max_per_category=3))
    else:
        print(out)


def _exit_code(rep: Report, strict: bool) -> int:
    counts = rep.counts()
    if counts[Severity.BLOCKER]:
        return EXIT_BLOCKED
    if counts[Severity.ERROR]:
        return EXIT_ISSUES
    if strict and counts[Severity.WARN]:
        return EXIT_ISSUES
    return EXIT_OK


# ------------------------------------------------------------------ commands


def cmd_check(args) -> int:
    try:
        epub = Epub(args.epub)
    except EpubError as exc:
        print(f"✗ 無法讀取 EPUB：{exc}", file=sys.stderr)
        return EXIT_ERROR

    rep = build_report(
        epub,
        target_lang=args.lang or "",
        only=set(args.only) if args.only else None,
        skip=set(args.skip) if args.skip else None,
    )
    if args.epubcheck:
        rep.extend(_run_epubcheck(args.epub, args.epubcheck))
    _emit(rep, args)
    return _exit_code(rep, args.strict)


def cmd_fix(args) -> int:
    try:
        epub = Epub(args.epub)
    except EpubError as exc:
        print(f"✗ 無法讀取 EPUB：{exc}", file=sys.stderr)
        return EXIT_ERROR

    before = build_report(epub, target_lang=args.lang or "")
    result = fixes.fix_all(
        epub,
        target_lang=args.lang or "",
        do_typography=not args.no_typography,
        do_a11y=not args.no_a11y,
        do_traps=not args.no_convert,
    )

    print(f"\n  自動修正：{os.path.basename(args.epub)}")
    print("  " + "─" * 64)
    if not result.changes:
        print("  沒有可自動修正的項目。")
    for rule, changes in sorted(result.by_rule().items()):
        print(f"\n  [{rule}] {len(changes)} 項")
        for c in changes:
            print(f"    · {c.file}: {c.detail}")

    if args.dry_run:
        print("\n  （--dry-run：未寫出檔案）\n")
        return EXIT_OK

    dest = args.output or _suffixed(args.epub, "-fixed")
    epub.save(dest)
    print(f"\n  已寫出 {dest}")

    after_epub = Epub(dest)
    after = build_report(after_epub, target_lang=args.lang or "")
    b, a = before.counts(), after.counts()
    print("  " + "─" * 64)
    print(
        f"  阻擋 {b[Severity.BLOCKER]} → {a[Severity.BLOCKER]}   "
        f"錯誤 {b[Severity.ERROR]} → {a[Severity.ERROR]}   "
        f"警告 {b[Severity.WARN]} → {a[Severity.WARN]}   "
        f"建議 {b[Severity.INFO]} → {a[Severity.INFO]}"
    )
    remaining = a[Severity.BLOCKER] + a[Severity.ERROR]
    if remaining:
        print(f"  仍有 {remaining} 項需要人工處理，執行 `epubqa check {dest}` 查看。\n")
    else:
        print("  ✓ 已無阻擋或錯誤項目。\n")
    return _exit_code(after, args.strict)


def cmd_optimize(args) -> int:
    try:
        epub = Epub(args.epub)
    except EpubError as exc:
        print(f"✗ 無法讀取 EPUB：{exc}", file=sys.stderr)
        return EXIT_ERROR

    original_size = epub.file_size()
    result = fixes.optimize(epub, prune=not args.no_prune)

    print(f"\n  優化：{os.path.basename(args.epub)}")
    print("  " + "─" * 64)
    if not result.changes:
        print("  沒有可移除的孤兒檔案。")
    for c in result.changes:
        print(f"    · {c.file}: {c.detail}")

    if args.dry_run:
        print("\n  （--dry-run：未寫出檔案）\n")
        return EXIT_OK

    dest = args.output or _suffixed(args.epub, "-optimized")
    epub.save(dest)
    new_size = os.path.getsize(dest)
    saved = original_size - new_size
    print(f"\n  {original_size/1024/1024:.2f} MB → {new_size/1024/1024:.2f} MB", end="")
    if saved > 0:
        print(f"（省下 {saved/1024:.1f} KB，KDP 傳送費約省 US${saved/1024/1024*0.15:.3f}/本）")
    else:
        print()
    print(f"  已寫出 {dest}\n")

    _report_further_savings(epub)
    return EXIT_OK


def _report_further_savings(epub: Epub) -> None:
    """Recompression needs external tools; surface the opportunity, don't guess."""
    from .checks.assets import image_info

    big_images = [
        (i.path, len(epub.files[i.path]))
        for i in epub.manifest.values()
        if i.is_image() and epub.has(i.path) and len(epub.files[i.path]) > 300 * 1024
    ]
    big_fonts = [
        (i.path, len(epub.files[i.path]))
        for i in epub.manifest.values()
        if i.is_font() and epub.has(i.path) and len(epub.files[i.path]) > 1024 * 1024
    ]
    if big_images or big_fonts:
        print("  仍可進一步縮小（需外部工具，本工具不會有損改動你的素材）：")
    for path, size in sorted(big_images, key=lambda x: -x[1])[:10]:
        print(f"    · {path} — {size/1024:.0f} KB")
    if big_images:
        print("      建議：cjpeg -quality 82 / oxipng -o4；或 mogrify -resize 1600x -quality 82")
    for path, size in sorted(big_fonts, key=lambda x: -x[1])[:10]:
        print(f"    · {path} — {size/1024/1024:.1f} MB")
    if big_fonts:
        print("      建議：pyftsubset FONT.otf --text-file=all-text.txt --flavor=woff2")
    if big_images or big_fonts:
        print()


def cmd_batch(args) -> int:
    """Check every EPUB in a directory and cross-compare the language editions."""
    paths = []
    for root, _dirs, files in os.walk(args.directory):
        for name in sorted(files):
            if name.lower().endswith(".epub"):
                paths.append(os.path.join(root, name))
    if not paths:
        print(f"✗ {args.directory} 下找不到 .epub 檔", file=sys.stderr)
        return EXIT_ERROR

    reports = []
    for path in paths:
        try:
            epub = Epub(path)
        except EpubError as exc:
            print(f"  ✗ {os.path.basename(path)}: {exc}")
            continue
        rep = build_report(epub)
        reports.append((rep, epub))

    print(f"\n  多語版本批次檢查（{len(reports)} 本）")
    print("  " + "─" * 74)
    print(
        "  "
        + _pad("檔案", 28)
        + _pad("語言", 12)
        + _pad("阻擋", 6)
        + _pad("錯誤", 6)
        + _pad("警告", 6)
        + _pad("大小", 10)
    )
    print("  " + "─" * 74)
    for rep, epub in reports:
        c = rep.counts()
        name = os.path.basename(rep.epub_path)
        name = name if len(name) <= 27 else name[:24] + "..."
        print(
            "  "
            + _pad(name, 28)
            + _pad(str(rep.declared_lang or "—"), 12)
            + _pad(str(c[Severity.BLOCKER]), 6)
            + _pad(str(c[Severity.ERROR]), 6)
            + _pad(str(c[Severity.WARN]), 6)
            + f"{rep.stats['size_mb']:.2f} MB"
        )
    print("  " + "─" * 74)

    _cross_edition(reports)

    if args.output:
        os.makedirs(args.output, exist_ok=True)
        for rep, _ in reports:
            base = os.path.splitext(os.path.basename(rep.epub_path))[0]
            dest = os.path.join(args.output, f"{base}.html")
            with open(dest, "w", encoding="utf-8") as fh:
                fh.write(report_mod.render_html(rep))
        print(f"  各語版報告已寫入 {args.output}/\n")

    worst = max((r.worst for r, _ in reports), default=Severity.INFO)
    if worst >= Severity.BLOCKER:
        return EXIT_BLOCKED
    if worst >= Severity.ERROR:
        return EXIT_ISSUES
    return EXIT_OK


def _cross_edition(reports) -> None:
    """Consistency across language editions — the thing single-file checks miss."""
    print("\n  跨語版一致性")
    print("  " + "─" * 74)

    langs = [r.declared_lang for r, _ in reports]
    dupes = {l for l in langs if l and langs.count(l) > 1}
    if dupes:
        print(f"  ▲ 有重複的語言標記：{', '.join(sorted(dupes))} — 每語應各一本、各自獨立 ISBN。")

    expected = {"en", "zh-Hant", "zh-Hans", "ja", "ko"}
    present = set()
    for r, _ in reports:
        p = profile_for(r.declared_lang or "")
        if p:
            present.add(p.code)
    missing = expected - present
    if missing:
        print(f"  ▲ 尚缺語言版本：{', '.join(sorted(missing))}")
    else:
        print("  ✓ 五個語言版本齊備（en / zh-Hant / zh-Hans / ja / ko）")

    ids = {}
    for r, epub in reports:
        for entry in epub.meta_values("identifier"):
            ids.setdefault(entry.text.strip(), []).append(os.path.basename(r.epub_path))
    shared = {k: v for k, v in ids.items() if len(v) > 1}
    for value, files in shared.items():
        print(f"  ✗ 識別碼重複：{value} 同時用於 {', '.join(files)} — 各語版必須有獨立識別碼。")

    counts = {}
    for r, epub in reports:
        p = profile_for(r.declared_lang or "")
        counts[p.code if p else (r.declared_lang or "?")] = r.stats["chars"]
    if len(counts) > 1:
        print("\n  內文字數（用於偵測翻譯漏段）")
        # Compare against the CJK/Latin-adjusted expectation rather than raw counts.
        weights = {"en": 1.0, "zh-Hant": 0.42, "zh-Hans": 0.42, "ja": 0.55, "ko": 0.62}
        base = None
        for code, n in counts.items():
            w = weights.get(code, 1.0)
            norm = n / w
            if base is None:
                base = norm
            ratio = norm / base if base else 1
            flag = "  ← 偏離過大，請檢查是否漏譯" if not (0.75 <= ratio <= 1.35) else ""
            print(f"    {code:<10} {n:>8,} 字   標準化 {norm:>9,.0f}   比值 {ratio:.2f}{flag}")

    covers = {}
    for r, epub in reports:
        cov = [i for i in epub.manifest.values() if "cover-image" in i.property_set]
        if cov and epub.has(cov[0].path):
            covers[os.path.basename(r.epub_path)] = len(epub.files[cov[0].path])
    if len(set(covers.values())) == 1 and len(covers) > 1:
        print(
            f"\n  ▲ 所有語版共用同一張封面（{len(covers)} 本檔案大小完全相同）"
            "— 各語版封面的書名文字應本地化。"
        )
    print()


# -------------------------------------------------------------------- helpers


def _pad(text: str, width: int) -> str:
    """Left-align in a terminal column, counting CJK glyphs as two cells."""
    used = sum(2 if ord(ch) > 0x2E80 else 1 for ch in text)
    return text + " " * max(1, width - used)


def _suffixed(path: str, suffix: str) -> str:
    root, ext = os.path.splitext(path)
    return f"{root}{suffix}{ext}"


def _run_epubcheck(path: str, jar: str) -> list:
    """Fold official EPUBCheck output into the report when a jar is provided."""
    from .issues import Issue

    if not os.path.exists(jar):
        return [
            Issue(
                "EPUBCHECK-000",
                Severity.WARN,
                f"找不到 EPUBCheck jar：{jar}",
                suggestion="從 https://github.com/w3c/epubcheck/releases 下載。",
            )
        ]
    try:
        proc = subprocess.run(
            ["java", "-jar", jar, path, "--quiet"],
            capture_output=True,
            text=True,
            timeout=300,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return [Issue("EPUBCHECK-000", Severity.WARN, f"EPUBCheck 執行失敗：{exc}")]

    issues = []
    for line in (proc.stdout + proc.stderr).splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("ERROR") or line.startswith("FATAL"):
            sev = Severity.BLOCKER
        elif line.startswith("WARNING"):
            sev = Severity.WARN
        elif line.startswith("INFO"):
            continue
        else:
            continue
        issues.append(
            Issue(
                "EPUBCHECK-001",
                sev,
                line[:400],
                suggestion="官方 EPUBCheck 的結果；Apple Books 以此為準，有 ERROR 即退件。",
                stores=("apple", "google", "kobo"),
            )
        )
    return issues


# --------------------------------------------------------------------- parser


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="epubqa",
        description="電子書上架前檢查、修正與優化（en / zh-Hant / zh-Hans / ja / ko）",
    )
    sub = p.add_subparsers(dest="command", required=True)

    def common(sp):
        sp.add_argument("-o", "--output", help="輸出路徑")
        sp.add_argument("--lang", choices=sorted(PROFILES), help="指定語言，略過自動偵測")
        sp.add_argument("--strict", action="store_true", help="有警告即以非零狀態結束")
        sp.add_argument("-v", "--verbose", action="store_true")
        return sp

    c = common(sub.add_parser("check", help="檢查但不修改"))
    c.add_argument("epub")
    c.add_argument(
        "--format", choices=("text", "json", "markdown", "html"), default="text"
    )
    c.add_argument("--only", nargs="+", choices=sorted(REGISTRY), help="只跑指定類別")
    c.add_argument("--skip", nargs="+", choices=sorted(REGISTRY), help="略過指定類別")
    c.add_argument("--epubcheck", metavar="JAR", help="同時執行官方 EPUBCheck")
    c.set_defaults(func=cmd_check)

    f = common(sub.add_parser("fix", help="自動修正並輸出新檔"))
    f.add_argument("epub")
    f.add_argument("--dry-run", action="store_true", help="只顯示會改什麼")
    f.add_argument("--no-typography", action="store_true", help="不動標點與引號")
    f.add_argument("--no-a11y", action="store_true", help="不補無障礙 metadata")
    f.add_argument("--no-convert", action="store_true", help="不修繁簡轉換錯誤")
    f.add_argument("--format", default="text", help=argparse.SUPPRESS)
    f.set_defaults(func=cmd_fix)

    o = common(sub.add_parser("optimize", help="移除孤兒檔案並重新封裝"))
    o.add_argument("epub")
    o.add_argument("--dry-run", action="store_true")
    o.add_argument("--no-prune", action="store_true", help="保留未引用的檔案")
    o.add_argument("--format", default="text", help=argparse.SUPPRESS)
    o.set_defaults(func=cmd_optimize)

    b = sub.add_parser("batch", help="批次檢查目錄下所有 EPUB 並比對多語一致性")
    b.add_argument("directory")
    b.add_argument("-o", "--output", help="輸出 HTML 報告到此目錄")
    b.add_argument("-v", "--verbose", action="store_true")
    b.set_defaults(func=cmd_batch)

    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        return EXIT_ERROR


if __name__ == "__main__":
    sys.exit(main())
