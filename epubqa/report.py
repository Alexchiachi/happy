"""Report renderers: terminal, JSON, Markdown and a self-contained HTML page."""

from __future__ import annotations

import html
import json
import os
from datetime import datetime

from .checks import CATEGORY_LABELS
from .issues import STORE_NAMES, Report, Severity

RESET = "\033[0m"
COLORS = {
    Severity.BLOCKER: "\033[1;97;41m",
    Severity.ERROR: "\033[1;31m",
    Severity.WARN: "\033[1;33m",
    Severity.INFO: "\033[0;36m",
}
BADGE = {
    Severity.BLOCKER: "阻擋上架",
    Severity.ERROR: "錯誤",
    Severity.WARN: "警告",
    Severity.INFO: "建議",
}


def _use_color() -> bool:
    return os.isatty(1) and os.environ.get("NO_COLOR") is None


def _category_of(code: str) -> str:
    prefix = code.split("-")[0]
    return {
        "STRUCT": "structure",
        "META": "metadata",
        "LANG": "language",
        "TYPO": "typography",
        "ASSET": "assets",
        "A11Y": "accessibility",
        "STORE": "stores",
        "SELF": "structure",
    }.get(prefix, "structure")


# ------------------------------------------------------------------- terminal


def render_terminal(report: Report, verbose: bool = False, max_per_category: int = 0) -> str:
    color = _use_color()

    def c(text: str, sev: Severity) -> str:
        return f"{COLORS[sev]}{text}{RESET}" if color else text

    lines = []
    counts = report.counts()
    lines.append("")
    lines.append(f"  電子書上架前檢查  {os.path.basename(report.epub_path)}")
    lines.append("  " + "─" * 64)
    meta = [
        f"EPUB {report.epub_version or '?'}",
        f"宣告語言 {report.declared_lang or '—'}",
        f"偵測語言 {report.detected_lang or '—'}",
    ]
    if report.stats.get("size_mb"):
        meta.append(f"{report.stats['size_mb']:.2f} MB")
    if report.stats.get("chars"):
        meta.append(f"{report.stats['chars']:,} 字")
    lines.append("  " + " · ".join(meta))
    lines.append("")

    summary = "  ".join(
        c(f"{BADGE[s]} {counts[s]}", s) for s in (Severity.BLOCKER, Severity.ERROR, Severity.WARN, Severity.INFO)
    )
    lines.append(f"  {summary}")
    lines.append("")

    grouped = {}
    for issue in report.sorted_issues():
        grouped.setdefault(_category_of(issue.code), []).append(issue)

    for cat, label in CATEGORY_LABELS.items():
        items = grouped.get(cat)
        if not items:
            continue
        worst = max(i.severity for i in items)
        lines.append(f"  {c('▎', worst)} {label}  ({len(items)})")
        shown = items if not max_per_category else items[:max_per_category]
        for issue in shown:
            tag = c(f"[{BADGE[issue.severity]}]", issue.severity)
            lines.append(f"    {tag} {issue.code}  {issue.message}")
            loc = issue.location()
            if loc != "(package)":
                lines.append(f"        ↳ {loc}")
            if issue.excerpt:
                lines.append(f"        │ …{issue.excerpt}…")
            if issue.stores:
                names = "、".join(STORE_NAMES[s] for s in issue.stores if s in STORE_NAMES)
                lines.append(f"        ⚑ 影響平台：{names}")
            if issue.suggestion and (verbose or issue.severity >= Severity.ERROR):
                for chunk in _wrap(issue.suggestion, 66):
                    lines.append(f"        → {chunk}")
            if issue.fixable:
                lines.append("        ✓ 可用 `epubqa fix` 自動修正")
            lines.append("")
        if max_per_category and len(items) > max_per_category:
            lines.append(f"    …另有 {len(items) - max_per_category} 項，加 --verbose 顯示全部")
            lines.append("")

    lines.append("  " + "─" * 64)
    if counts[Severity.BLOCKER]:
        lines.append(c(f"  ✗ 有 {counts[Severity.BLOCKER]} 項會導致平台退件，請先修正再上架。", Severity.BLOCKER))
    elif counts[Severity.ERROR]:
        lines.append(c(f"  ▲ 無阻擋項，但有 {counts[Severity.ERROR]} 項錯誤會明顯影響閱讀品質。", Severity.ERROR))
    elif counts[Severity.WARN]:
        lines.append(c("  ○ 可以上架，仍有品質項目建議處理。", Severity.WARN))
    else:
        lines.append("  ✓ 通過所有檢查。")
    fixable = sum(1 for i in report.issues if i.fixable)
    if fixable:
        lines.append(f"  其中 {fixable} 項可用 `epubqa fix {report.epub_path}` 自動修正。")
    lines.append("")
    return "\n".join(lines)


def _wrap(text: str, width: int) -> list:
    """Width-aware wrap that counts CJK characters as two columns."""
    out, line, w = [], "", 0
    for ch in text:
        cw = 2 if ord(ch) > 0x2E80 else 1
        if w + cw > width and line:
            out.append(line)
            line, w = "", 0
        line += ch
        w += cw
    if line:
        out.append(line)
    return out


# ----------------------------------------------------------------------- JSON


def render_json(report: Report) -> str:
    payload = {
        "epub": report.epub_path,
        "generated": datetime.now().astimezone().isoformat(),
        "epub_version": report.epub_version,
        "declared_language": report.declared_lang,
        "detected_language": report.detected_lang,
        "stats": report.stats,
        "summary": {s.label: report.counts()[s] for s in Severity},
        "issues": [
            {
                "code": i.code,
                "severity": i.severity.label,
                "message": i.message,
                "file": i.file,
                "line": i.line,
                "excerpt": i.excerpt,
                "suggestion": i.suggestion,
                "stores": list(i.stores),
                "lang": i.lang,
                "fixable": i.fixable,
                "category": _category_of(i.code),
            }
            for i in report.sorted_issues()
        ],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


# ------------------------------------------------------------------- Markdown


def render_markdown(report: Report) -> str:
    counts = report.counts()
    out = [
        f"# 上架前檢查報告：{os.path.basename(report.epub_path)}",
        "",
        f"- EPUB 版本：{report.epub_version or '未知'}",
        f"- 宣告語言：`{report.declared_lang or '—'}`　偵測語言：`{report.detected_lang or '—'}`",
        f"- 檔案大小：{report.stats.get('size_mb', 0):.2f} MB　內文字數：{report.stats.get('chars', 0):,}",
        "",
        "| 阻擋上架 | 錯誤 | 警告 | 建議 |",
        "|---:|---:|---:|---:|",
        f"| {counts[Severity.BLOCKER]} | {counts[Severity.ERROR]} | "
        f"{counts[Severity.WARN]} | {counts[Severity.INFO]} |",
        "",
    ]
    grouped = {}
    for issue in report.sorted_issues():
        grouped.setdefault(_category_of(issue.code), []).append(issue)
    for cat, label in CATEGORY_LABELS.items():
        items = grouped.get(cat)
        if not items:
            continue
        out.append(f"## {label}")
        out.append("")
        for i in items:
            out.append(f"### `{i.code}` {BADGE[i.severity]}：{i.message}")
            if i.location() != "(package)":
                out.append(f"- 位置：`{i.location()}`")
            if i.excerpt:
                out.append(f"- 原文：`…{i.excerpt}…`")
            if i.stores:
                out.append(
                    "- 影響平台："
                    + "、".join(STORE_NAMES[s] for s in i.stores if s in STORE_NAMES)
                )
            if i.suggestion:
                out.append(f"- 建議：{i.suggestion}")
            if i.fixable:
                out.append("- 可自動修正：是")
            out.append("")
    return "\n".join(out)


# ----------------------------------------------------------------------- HTML

_HTML_HEAD = """<title>電子書上架前檢查報告</title>
<style>
:root{--bg:#fdfcfa;--fg:#1d1c1a;--muted:#6b6862;--card:#fff;--line:#e6e2da;
--blocker:#b3261e;--error:#c2410c;--warn:#a16207;--info:#0f766e;--accent:#3e6b3e;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#16151a;--fg:#eceaf0;
--muted:#9d99a6;--card:#1f1e25;--line:#33313c;--blocker:#ff8a80;--error:#ffab7a;
--warn:#f0c674;--info:#5eead4;--accent:#8fbf8f;}}
:root[data-theme="dark"]{--bg:#16151a;--fg:#eceaf0;--muted:#9d99a6;--card:#1f1e25;
--line:#33313c;--blocker:#ff8a80;--error:#ffab7a;--warn:#f0c674;--info:#5eead4;--accent:#8fbf8f;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
font:16px/1.7 -apple-system,"Noto Sans TC","Noto Sans JP","Noto Sans KR",sans-serif;}
.wrap{max-width:64rem;margin:0 auto;padding:2.5rem 1.25rem 5rem}
h1{font-size:1.7rem;margin:0 0 .25rem}
.sub{color:var(--muted);font-size:.9rem;margin-bottom:2rem}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem;margin-bottom:2.5rem}
.tile{background:var(--card);border:1px solid var(--line);border-radius:.6rem;padding:.9rem 1rem}
.tile .n{font-size:1.9rem;font-weight:700;line-height:1.1}
.tile .l{font-size:.8rem;color:var(--muted)}
.t-blocker .n{color:var(--blocker)}.t-error .n{color:var(--error)}
.t-warn .n{color:var(--warn)}.t-info .n{color:var(--info)}
h2{font-size:1.1rem;margin:2.5rem 0 .9rem;padding-bottom:.4rem;border-bottom:2px solid var(--accent)}
.issue{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--line);
border-radius:.5rem;padding:.85rem 1rem;margin-bottom:.7rem}
.issue.blocker{border-left-color:var(--blocker)}.issue.error{border-left-color:var(--error)}
.issue.warn{border-left-color:var(--warn)}.issue.info{border-left-color:var(--info)}
.badge{display:inline-block;font-size:.7rem;font-weight:700;padding:.1rem .45rem;
border-radius:.25rem;border:1px solid currentColor;margin-right:.5rem;vertical-align:.1em}
.blocker .badge{color:var(--blocker)}.error .badge{color:var(--error)}
.warn .badge{color:var(--warn)}.info .badge{color:var(--info)}
.code{font:.75rem ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);margin-left:.35rem}
.msg{font-weight:600}
.meta{font-size:.85rem;color:var(--muted);margin-top:.35rem}
.meta code{background:rgba(128,128,128,.13);padding:.05rem .3rem;border-radius:.2rem;
font-size:.8rem;word-break:break-all}
.sug{font-size:.88rem;margin-top:.45rem;padding-left:.7rem;border-left:2px solid var(--line)}
.ex{font:.8rem ui-monospace,Menlo,monospace;background:rgba(128,128,128,.1);
padding:.3rem .5rem;border-radius:.3rem;margin-top:.4rem;overflow-x:auto;white-space:pre-wrap}
.pill{display:inline-block;font-size:.7rem;border:1px solid var(--line);border-radius:1rem;
padding:.05rem .5rem;margin:.3rem .3rem 0 0;color:var(--muted)}
.fixable{color:var(--accent);font-size:.8rem;margin-top:.35rem}
.ok{background:var(--card);border:1px solid var(--line);border-radius:.6rem;padding:2rem;text-align:center}
</style>"""


def render_html(report: Report) -> str:
    counts = report.counts()
    e = html.escape
    parts = [_HTML_HEAD, '<div class="wrap">']
    parts.append(f"<h1>電子書上架前檢查報告</h1>")
    parts.append(
        f'<div class="sub">{e(os.path.basename(report.epub_path))} · '
        f"EPUB {e(report.epub_version or '?')} · "
        f"宣告語言 <code>{e(report.declared_lang or '—')}</code> · "
        f"偵測語言 <code>{e(report.detected_lang or '—')}</code> · "
        f"{report.stats.get('size_mb', 0):.2f} MB · "
        f"{report.stats.get('chars', 0):,} 字 · "
        f"{datetime.now().strftime('%Y-%m-%d %H:%M')}</div>"
    )

    parts.append('<div class="tiles">')
    for sev, cls in (
        (Severity.BLOCKER, "blocker"),
        (Severity.ERROR, "error"),
        (Severity.WARN, "warn"),
        (Severity.INFO, "info"),
    ):
        parts.append(
            f'<div class="tile t-{cls}"><div class="n">{counts[sev]}</div>'
            f'<div class="l">{BADGE[sev]}</div></div>'
        )
    parts.append("</div>")

    grouped = {}
    for issue in report.sorted_issues():
        grouped.setdefault(_category_of(issue.code), []).append(issue)

    if not report.issues:
        parts.append('<div class="ok">✓ 通過所有檢查，可以上架。</div>')

    cls_of = {
        Severity.BLOCKER: "blocker",
        Severity.ERROR: "error",
        Severity.WARN: "warn",
        Severity.INFO: "info",
    }
    for cat, label in CATEGORY_LABELS.items():
        items = grouped.get(cat)
        if not items:
            continue
        parts.append(f"<h2>{e(label)} <span class='code'>{len(items)}</span></h2>")
        for i in items:
            cls = cls_of[i.severity]
            parts.append(f'<div class="issue {cls}">')
            parts.append(
                f'<span class="badge">{BADGE[i.severity]}</span>'
                f'<span class="msg">{e(i.message)}</span>'
                f'<span class="code">{e(i.code)}</span>'
            )
            if i.location() != "(package)":
                parts.append(f'<div class="meta">位置：<code>{e(i.location())}</code></div>')
            if i.excerpt:
                parts.append(f'<div class="ex">…{e(i.excerpt)}…</div>')
            if i.suggestion:
                parts.append(f'<div class="sug">{e(i.suggestion)}</div>')
            if i.stores:
                for s in i.stores:
                    if s in STORE_NAMES:
                        parts.append(f'<span class="pill">{e(STORE_NAMES[s])}</span>')
            if i.fixable:
                parts.append('<div class="fixable">✓ 可用 epubqa fix 自動修正</div>')
            parts.append("</div>")

    parts.append("</div>")
    return "\n".join(parts)
