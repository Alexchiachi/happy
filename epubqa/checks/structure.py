"""OCF container and package-document structure checks.

These are the findings that cause an outright upload rejection rather than a
quality complaint, so most of them are BLOCKER severity.
"""

from __future__ import annotations

import posixpath
import re
import zipfile
from urllib.parse import unquote
from xml.etree import ElementTree as ET

from ..issues import Issue, Severity
from ..model import NS, Epub

JUNK_NAMES = (".DS_Store", "Thumbs.db", "desktop.ini", ".gitkeep")
BAD_PATH_CHARS = re.compile(r"[\s\"*:<>?|\\%#\[\]{}^`]")

CODE = "STRUCT"


def check(epub: Epub) -> list:
    issues = []
    issues += _check_zip_layout(epub)
    issues += _check_container(epub)
    issues += _check_manifest(epub)
    issues += _check_spine(epub)
    issues += _check_nav(epub)
    issues += _check_links(epub)
    issues += _check_wellformed(epub)
    return issues


# ------------------------------------------------------------------ zip layout


def _check_zip_layout(epub: Epub) -> list:
    issues = []
    try:
        with zipfile.ZipFile(epub.path) as zf:
            infos = [i for i in zf.infolist() if not i.is_dir()]
    except zipfile.BadZipFile:
        return issues

    if not infos:
        return [Issue(f"{CODE}-000", Severity.BLOCKER, "EPUB 壓縮檔為空")]

    first = infos[0]
    if first.filename != "mimetype":
        issues.append(
            Issue(
                f"{CODE}-001",
                Severity.BLOCKER,
                "mimetype 不是壓縮檔的第一個項目",
                suggestion="以 `epubqa fix` 重新封裝；OCF 規定 mimetype 必須第一且不壓縮。",
                stores=("kdp", "apple", "google", "kobo"),
                fixable=True,
            )
        )
    elif first.compress_type != zipfile.ZIP_STORED:
        issues.append(
            Issue(
                f"{CODE}-002",
                Severity.BLOCKER,
                "mimetype 被壓縮儲存（必須為 STORED 不壓縮）",
                file="mimetype",
                suggestion="以 `epubqa fix` 重新封裝。",
                stores=("apple", "google"),
                fixable=True,
            )
        )

    mime = epub.files.get("mimetype", b"")
    if mime.strip() != b"application/epub+zip":
        issues.append(
            Issue(
                f"{CODE}-003",
                Severity.BLOCKER,
                f"mimetype 內容錯誤：{mime[:40]!r}",
                file="mimetype",
                suggestion="內容必須恰為 application/epub+zip，且不得有 BOM 或換行。",
                fixable=True,
            )
        )
    elif mime != b"application/epub+zip":
        issues.append(
            Issue(
                f"{CODE}-004",
                Severity.ERROR,
                "mimetype 含多餘的換行或空白",
                file="mimetype",
                fixable=True,
            )
        )

    for name in epub.files:
        base = posixpath.basename(name)
        if base in JUNK_NAMES or name.startswith("__MACOSX/"):
            issues.append(
                Issue(
                    f"{CODE}-005",
                    Severity.ERROR,
                    f"壓縮檔含作業系統垃圾檔：{name}",
                    file=name,
                    suggestion="移除；部分平台會因未列於 manifest 的檔案而退件。",
                    stores=("apple",),
                    fixable=True,
                )
            )
        if BAD_PATH_CHARS.search(name):
            issues.append(
                Issue(
                    f"{CODE}-006",
                    Severity.ERROR,
                    f"檔名含空白或保留字元，部分閱讀器會連結失效：{name}",
                    file=name,
                    suggestion="改用 [a-z0-9_-] 命名並同步更新 manifest 與所有引用。",
                    stores=("kdp", "kobo"),
                )
            )
        if any(ord(c) > 127 for c in name):
            issues.append(
                Issue(
                    f"{CODE}-007",
                    Severity.WARN,
                    f"檔名含非 ASCII 字元，跨平台易亂碼：{name}",
                    file=name,
                    suggestion="檔名改為純 ASCII（書名等中日韓文字放 metadata，不要放檔名）。",
                )
            )
        if len(name) > 200:
            issues.append(
                Issue(
                    f"{CODE}-008",
                    Severity.WARN,
                    f"路徑過長（{len(name)} 字元）：{name}",
                    file=name,
                )
            )
    return issues


# -------------------------------------------------------------------- container


def _check_container(epub: Epub) -> list:
    issues = []
    if not epub.version:
        issues.append(
            Issue(
                f"{CODE}-010",
                Severity.BLOCKER,
                "OPF 未宣告 version 屬性",
                file=epub.opf_path,
                suggestion='加上 version="3.0"。',
                fixable=True,
            )
        )
    elif epub.version.startswith("2"):
        issues.append(
            Issue(
                f"{CODE}-011",
                Severity.WARN,
                f"EPUB {epub.version}：Apple Books 與 Google Play 皆偏好 EPUB 3",
                file=epub.opf_path,
                suggestion="升級為 EPUB 3.0/3.2；EPUB 2 無法宣告無障礙 metadata，"
                "歐盟 EAA 自 2025-06 起要求電子書具備無障礙資訊。",
                stores=("apple", "google"),
            )
        )
    return issues


# --------------------------------------------------------------------- manifest


def _check_manifest(epub: Epub) -> list:
    issues = []
    seen_href = {}
    for item in epub.manifest.values():
        if not item.id:
            issues.append(
                Issue(
                    f"{CODE}-020",
                    Severity.BLOCKER,
                    f"manifest item 缺少 id：href={item.href}",
                    file=epub.opf_path,
                )
            )
        if not item.media_type:
            issues.append(
                Issue(
                    f"{CODE}-021",
                    Severity.BLOCKER,
                    f"manifest item 缺少 media-type：{item.href}",
                    file=epub.opf_path,
                )
            )
        if "://" in item.href:
            issues.append(
                Issue(
                    f"{CODE}-022",
                    Severity.ERROR,
                    f"manifest 引用遠端資源：{item.href}",
                    file=epub.opf_path,
                    suggestion="所有資源必須內嵌；遠端資源在離線閱讀時失效，且各平台皆會退件。",
                    stores=("kdp", "apple", "google", "kobo"),
                )
            )
        elif item.path and not epub.has(item.path):
            issues.append(
                Issue(
                    f"{CODE}-023",
                    Severity.BLOCKER,
                    f"manifest 宣告的檔案不存在：{item.href}",
                    file=epub.opf_path,
                    suggestion="移除該 item 或補上檔案。",
                )
            )
        if item.href in seen_href:
            issues.append(
                Issue(
                    f"{CODE}-024",
                    Severity.ERROR,
                    f"manifest 有重複的 href：{item.href}",
                    file=epub.opf_path,
                )
            )
        seen_href[item.href] = item.id

    declared = {i.path for i in epub.manifest.values() if i.path}
    exempt = {"mimetype", epub.opf_path}
    for name in epub.files:
        if name in exempt or name.startswith("META-INF/"):
            continue
        if name in declared:
            continue
        if posixpath.basename(name) in JUNK_NAMES:
            continue  # already reported as junk
        issues.append(
            Issue(
                f"{CODE}-025",
                Severity.ERROR,
                f"檔案存在於壓縮檔但未列於 manifest：{name}",
                file=name,
                suggestion="加入 manifest，或以 `epubqa optimize --prune` 移除孤兒檔案。",
                stores=("apple",),
                fixable=True,
            )
        )
    return issues


# ------------------------------------------------------------------------ spine


def _check_spine(epub: Epub) -> list:
    issues = []
    if not epub.spine:
        return [
            Issue(
                f"{CODE}-030",
                Severity.BLOCKER,
                "spine 為空，閱讀器無內容可顯示",
                file=epub.opf_path,
            )
        ]

    for sp in epub.spine:
        item = epub.manifest.get(sp.idref)
        if item is None:
            issues.append(
                Issue(
                    f"{CODE}-031",
                    Severity.BLOCKER,
                    f"spine idref 找不到對應的 manifest item：{sp.idref}",
                    file=epub.opf_path,
                )
            )
        elif not item.is_xhtml() and item.media_type != "application/x-dtbook+xml":
            issues.append(
                Issue(
                    f"{CODE}-032",
                    Severity.ERROR,
                    f"spine 收錄了非 XHTML 內容：{item.href} ({item.media_type})",
                    file=epub.opf_path,
                )
            )

    if epub.version.startswith("2") and not epub.spine_toc:
        issues.append(
            Issue(
                f"{CODE}-033",
                Severity.BLOCKER,
                "EPUB 2 的 spine 缺少 toc 屬性",
                file=epub.opf_path,
            )
        )

    ncx = [i for i in epub.manifest.values() if i.media_type == "application/x-dtbncx+xml"]
    if not ncx:
        issues.append(
            Issue(
                f"{CODE}-034",
                Severity.WARN,
                "沒有 NCX（toc.ncx）",
                file=epub.opf_path,
                suggestion="KDP 的舊版 Kindle 轉檔管線仍會讀 NCX；EPUB 3 同時保留 NCX "
                "可最大化相容性（EPUB 3.2 允許但不強制）。",
                stores=("kdp",),
                fixable=True,
            )
        )
    return issues


def _check_nav(epub: Epub) -> list:
    issues = []
    nav_items = [i for i in epub.manifest.values() if "nav" in i.property_set]

    if epub.version.startswith("3"):
        if not nav_items:
            return [
                Issue(
                    f"{CODE}-040",
                    Severity.BLOCKER,
                    'EPUB 3 缺少導覽文件（manifest 無 properties="nav" 的項目）',
                    file=epub.opf_path,
                    suggestion="必須有一份 XHTML 導覽文件並標註 properties=\"nav\"。",
                    stores=("kdp", "apple", "google", "kobo"),
                )
            ]
        if len(nav_items) > 1:
            issues.append(
                Issue(
                    f"{CODE}-041",
                    Severity.ERROR,
                    "有多個 nav 文件，EPUB 3 只允許一個",
                    file=epub.opf_path,
                )
            )

    for nav in nav_items:
        if not epub.has(nav.path):
            continue
        markup = epub.text(nav.path)
        if 'epub:type="toc"' not in markup and "epub:type='toc'" not in markup:
            issues.append(
                Issue(
                    f"{CODE}-042",
                    Severity.ERROR,
                    'nav 文件缺少 epub:type="toc" 的 <nav> 區塊',
                    file=nav.path,
                    suggestion="目錄是所有平台的硬性要求，且必須為可點擊連結。",
                    stores=("kdp", "apple", "google", "kobo"),
                )
            )
        if "epub:type=\"landmarks\"" not in markup:
            issues.append(
                Issue(
                    f"{CODE}-043",
                    Severity.WARN,
                    "nav 文件缺少 landmarks 區塊",
                    file=nav.path,
                    suggestion="加入 landmarks（bodymatter/toc/cover）讓閱讀器能正確定位「開始閱讀」。",
                    stores=("apple",),
                )
            )
        links = re.findall(r'<a[^>]+href="([^"]+)"', markup)
        if not links:
            issues.append(
                Issue(
                    f"{CODE}-044",
                    Severity.BLOCKER,
                    "目錄沒有任何連結",
                    file=nav.path,
                    stores=("kdp",),
                )
            )
        elif len(links) < 2:
            issues.append(
                Issue(
                    f"{CODE}-045",
                    Severity.WARN,
                    f"目錄僅有 {len(links)} 個連結，KDP 會判定目錄不完整",
                    file=nav.path,
                    stores=("kdp",),
                )
            )
    return issues


# -------------------------------------------------------------------- link graph


def _check_links(epub: Epub) -> list:
    """Resolve every internal href and fragment; broken links are silent bugs."""
    issues = []
    id_index = {}
    for item in epub.manifest.values():
        if item.is_xhtml() and epub.has(item.path):
            markup = epub.text(item.path)
            id_index[item.path] = set(re.findall(r'\sid="([^"]+)"', markup))

    href_re = re.compile(r'(?:href|src)="([^"]+)"')
    for item in epub.manifest.values():
        if not (item.is_xhtml() or item.is_css()) or not epub.has(item.path):
            continue
        markup = epub.text(item.path)
        for m in href_re.finditer(markup):
            raw = m.group(1).strip()
            if not raw or raw.startswith(("#", "data:", "mailto:", "tel:", "javascript:")):
                if raw.startswith("#"):
                    frag = unquote(raw[1:])
                    if frag and frag not in id_index.get(item.path, set()):
                        issues.append(
                            Issue(
                                f"{CODE}-050",
                                Severity.ERROR,
                                f"頁內錨點不存在：{raw}",
                                file=item.path,
                                line=markup.count("\n", 0, m.start()) + 1,
                            )
                        )
                continue
            if "://" in raw:
                if raw.startswith("http://"):
                    issues.append(
                        Issue(
                            f"{CODE}-051",
                            Severity.WARN,
                            f"外部連結使用不安全的 http：{raw}",
                            file=item.path,
                            line=markup.count("\n", 0, m.start()) + 1,
                            suggestion="改用 https；部分平台會標記 http 連結。",
                        )
                    )
                continue
            target, _, frag = raw.partition("#")
            path = epub.resolve(target, item.path) if target else item.path
            if path and not epub.has(path):
                issues.append(
                    Issue(
                        f"{CODE}-052",
                        Severity.ERROR,
                        f"連結指向不存在的檔案：{raw}",
                        file=item.path,
                        line=markup.count("\n", 0, m.start()) + 1,
                        suggestion="修正路徑或補上檔案。",
                    )
                )
            elif frag and path in id_index:
                if unquote(frag) not in id_index[path]:
                    issues.append(
                        Issue(
                            f"{CODE}-053",
                            Severity.ERROR,
                            f"連結錨點不存在：{raw}",
                            file=item.path,
                            line=markup.count("\n", 0, m.start()) + 1,
                        )
                    )
    return issues


def _check_wellformed(epub: Epub) -> list:
    """XHTML content documents must be well-formed XML — Apple rejects otherwise."""
    issues = []
    for item in epub.manifest.values():
        if not item.is_xhtml() or not epub.has(item.path):
            continue
        raw = epub.files[item.path]
        try:
            ET.fromstring(raw)
        except ET.ParseError as exc:
            issues.append(
                Issue(
                    f"{CODE}-060",
                    Severity.BLOCKER,
                    f"XHTML 不是合法的 XML：{exc}",
                    file=item.path,
                    line=getattr(exc, "position", (None, None))[0],
                    suggestion="EPUB 的內容文件必須是 well-formed XML："
                    "所有標籤須閉合、屬性須加引號、&amp; 須跳脫。",
                    stores=("apple", "google", "kobo"),
                )
            )
        if raw.startswith(b"\xef\xbb\xbf"):
            issues.append(
                Issue(
                    f"{CODE}-061",
                    Severity.WARN,
                    "檔案開頭有 UTF-8 BOM",
                    file=item.path,
                    suggestion="移除 BOM；部分轉檔器會把它當成內容而產生空白頁。",
                    fixable=True,
                )
            )
    return issues
