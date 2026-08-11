"""Package metadata checks: title, identifier, language, creator, dates, rights."""

from __future__ import annotations

import re
from datetime import datetime

from ..issues import Issue, Severity
from ..langprofile import PROFILES, excerpt_at, normalise_tag, profile_for
from ..model import NS, Epub, visible_text

CODE = "META"

PLACEHOLDERS = (
    "untitled",
    "unknown",
    "todo",
    "tbd",
    "lorem ipsum",
    "your name",
    "author name",
    "book title",
    "作者名",
    "書名",
    "书名",
    "未命名",
    "無標題",
    "サンプル",
    "著者名",
    "제목 없음",
    "insert title",
    "changeme",
    "example.com",
)

ISO_DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
ISO_DATE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")

#: Store title-length limits (characters). KDP truncates at 200 in the catalogue.
TITLE_LIMITS = {"kdp": 200, "apple": 255, "google": 255}


#: Drafting markers left in the book's own pages. Reported as BLOCKER, so the
#: bar for inclusion is that the match cannot plausibly be prose.
#:
#: Deliberately EXCLUDED, despite looking like filler: ○○○, ＿＿＿, XXXX and
#: bare TK. CJK writing uses ○○ and ＿＿ to anonymise names (○○先生) and to mark
#: cloze blanks in workbooks, and TK can be initials — flagging those would stop
#: a legitimate book from shipping.
BODY_PLACEHOLDERS = re.compile(
    r"[〔［【(（\[]\s*(?:待補|待補充|待补|待定|待填|未定|TBD|TODO)"
    r"[^〕］】)）\]]{0,40}[〕］】)）\]]"
    r"|\{\{[^}]{0,40}\}\}"
    r"|\bLorem ipsum\b"
    r"|\[(?:INSERT|PLACEHOLDER|YOUR NAME|TITLE HERE|待補)[^\]]{0,40}\]",
    re.I,
)


def check(epub: Epub) -> list:
    issues = []
    issues += _title(epub)
    issues += _identifier(epub)
    issues += _language(epub)
    issues += _creator(epub)
    issues += _dates(epub)
    issues += _rights_and_publisher(epub)
    issues += _cover_meta(epub)
    issues += _rendition(epub)
    issues += _body_placeholders(epub)
    return issues


def _body_placeholders(epub: Epub) -> list:
    """Unfilled drafting markers left in the book's own pages.

    The colophon is where these hide: 出版日期、ISBN、聯絡方式 are written as
    〔待補〕 during drafting and are easy to forget, because they sit on a page
    the author stops re-reading. Readers see them on page one.
    """
    issues = []
    for item in epub.content_docs():
        if not epub.has(item.path):
            continue
        text = visible_text(epub.text(item.path))
        for m in BODY_PLACEHOLDERS.finditer(text):
            issues.append(
                Issue(
                    f"{CODE}-080",
                    Severity.BLOCKER,
                    f"內文留有未填寫的佔位文字：「{m.group(0).strip()}」",
                    file=item.path,
                    line=text.count("\n", 0, m.start()) + 1,
                    excerpt=excerpt_at(text, m.start(), 44),
                    suggestion="讀者會直接看到這段文字。上架前必須填入實際內容或整行刪除；"
                    "KDP 的內容品質審查也會以「未完成的書籍」為由退件。",
                    stores=("kdp", "apple", "google", "kobo"),
                )
            )
    return issues


def _placeholder_hits(value: str) -> list:
    low = value.lower()
    return [p for p in PLACEHOLDERS if p in low]


def _title(epub: Epub) -> list:
    issues = []
    titles = epub.meta_values("title")
    if not titles or not titles[0].text:
        return [
            Issue(
                f"{CODE}-001",
                Severity.BLOCKER,
                "缺少 dc:title",
                file=epub.opf_path,
                stores=("kdp", "apple", "google", "kobo"),
            )
        ]
    title = titles[0].text
    for hit in _placeholder_hits(title):
        issues.append(
            Issue(
                f"{CODE}-002",
                Severity.BLOCKER,
                f"dc:title 仍是佔位文字（含「{hit}」）：{title}",
                file=epub.opf_path,
                suggestion="換成正式書名再上架。",
            )
        )
    for store, limit in TITLE_LIMITS.items():
        if len(title) > limit:
            issues.append(
                Issue(
                    f"{CODE}-003",
                    Severity.WARN,
                    f"dc:title 長度 {len(title)} 超過 {store} 的 {limit} 字上限",
                    file=epub.opf_path,
                    stores=(store,),
                )
            )
    if title != title.strip():
        issues.append(
            Issue(
                f"{CODE}-004",
                Severity.WARN,
                "dc:title 前後有多餘空白",
                file=epub.opf_path,
                fixable=True,
            )
        )
    if epub.version.startswith("3") and titles[0].attrib.get("id"):
        tid = titles[0].attrib["id"]
        if epub.refines(tid, "file-as") is None:
            issues.append(
                Issue(
                    f"{CODE}-005",
                    Severity.INFO,
                    "dc:title 沒有 file-as 排序鍵",
                    file=epub.opf_path,
                    suggestion="中日韓書名建議補 file-as（假名／拼音／한글 讀音）以利書店排序。",
                )
            )
    if len(titles) > 1:
        issues.append(
            Issue(
                f"{CODE}-006",
                Severity.WARN,
                f"有 {len(titles)} 個 dc:title，閱讀器只會取第一個",
                file=epub.opf_path,
                suggestion="副標題請用 title-type=subtitle 的 refines 表達，不要並列多個 dc:title。",
            )
        )
    return issues


def _luhn_isbn13(digits: str) -> bool:
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits[:12]))
    return (10 - total % 10) % 10 == int(digits[12])


def _isbn10_ok(value: str) -> bool:
    total = 0
    for i, ch in enumerate(value):
        digit = 10 if ch in "Xx" else int(ch)
        total += digit * (10 - i)
    return total % 11 == 0


def _identifier(epub: Epub) -> list:
    issues = []
    ids = epub.meta_values("identifier")
    if not ids:
        return [
            Issue(
                f"{CODE}-010",
                Severity.BLOCKER,
                "缺少 dc:identifier",
                file=epub.opf_path,
                stores=("kdp", "apple", "google", "kobo"),
            )
        ]

    uid = epub.unique_identifier
    if uid and not any(i.attrib.get("id") == uid for i in ids):
        issues.append(
            Issue(
                f"{CODE}-011",
                Severity.BLOCKER,
                f'package unique-identifier="{uid}" 找不到對應的 dc:identifier',
                file=epub.opf_path,
                stores=("apple", "google"),
            )
        )

    for entry in ids:
        value = entry.text.strip()
        if not value:
            issues.append(
                Issue(f"{CODE}-012", Severity.BLOCKER, "dc:identifier 為空", file=epub.opf_path)
            )
            continue
        cleaned = re.sub(r"^(urn:)?isbn:?", "", value, flags=re.I).replace("-", "").replace(" ", "")
        looks_isbn = "isbn" in value.lower() or (cleaned.isdigit() and len(cleaned) in (10, 13))
        if looks_isbn:
            if len(cleaned) == 13 and cleaned.isdigit():
                if not _luhn_isbn13(cleaned):
                    issues.append(
                        Issue(
                            f"{CODE}-013",
                            Severity.ERROR,
                            f"ISBN-13 檢查碼錯誤：{value}",
                            file=epub.opf_path,
                            suggestion="核對書號；檢查碼錯誤會導致書店比對不到書目資料。",
                            stores=("google", "kobo", "apple"),
                        )
                    )
            elif len(cleaned) == 10:
                if not _isbn10_ok(cleaned):
                    issues.append(
                        Issue(
                            f"{CODE}-014",
                            Severity.ERROR,
                            f"ISBN-10 檢查碼錯誤：{value}",
                            file=epub.opf_path,
                        )
                    )
                issues.append(
                    Issue(
                        f"{CODE}-015",
                        Severity.WARN,
                        f"使用 ISBN-10：{value}",
                        file=epub.opf_path,
                        suggestion="改用 ISBN-13；多數平台已不接受 10 碼。",
                    )
                )
            else:
                issues.append(
                    Issue(
                        f"{CODE}-016",
                        Severity.ERROR,
                        f"ISBN 長度不是 10 或 13 碼：{value}",
                        file=epub.opf_path,
                    )
                )
        elif value.lower().startswith("urn:uuid:") or re.match(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", value, re.I
        ):
            pass  # a UUID is fine when there is no ISBN
        else:
            issues.append(
                Issue(
                    f"{CODE}-017",
                    Severity.WARN,
                    f"dc:identifier 既非 ISBN 也非 UUID：{value}",
                    file=epub.opf_path,
                    suggestion="無 ISBN 時請用 urn:uuid: 形式的穩定識別碼；"
                    "每次改版都換識別碼會讓平台視為新書。",
                )
            )
    return issues


def _language(epub: Epub) -> list:
    """dc:language drives font selection, hyphenation and TTS voice — a wrong tag
    is invisible in the source but breaks Han glyph rendering on every device."""
    issues = []
    langs = epub.meta_values("language")
    if not langs or not langs[0].text:
        return [
            Issue(
                f"{CODE}-020",
                Severity.BLOCKER,
                "缺少 dc:language",
                file=epub.opf_path,
                suggestion="必填；缺少時 Apple Books 直接退件，中日韓漢字也會用錯字形。",
                stores=("kdp", "apple", "google", "kobo"),
                fixable=True,
            )
        ]

    for entry in langs:
        tag = entry.text.strip()
        norm = normalise_tag(tag)
        if not re.match(r"^[a-z]{2,3}(-[a-z0-9]{2,8})*$", norm):
            issues.append(
                Issue(
                    f"{CODE}-021",
                    Severity.BLOCKER,
                    f"dc:language 不是合法的 BCP-47 標籤：{tag}",
                    file=epub.opf_path,
                    stores=("apple", "google"),
                )
            )
            continue
        if norm == "zh":
            issues.append(
                Issue(
                    f"{CODE}-022",
                    Severity.ERROR,
                    'dc:language 為裸標籤 "zh"，未指明繁簡',
                    file=epub.opf_path,
                    suggestion="繁體用 zh-Hant（或 zh-Hant-TW），簡體用 zh-Hans。"
                    "裸 zh 會讓閱讀器任選字形，繁體書可能顯示成簡體字形。",
                    stores=("apple", "google", "kobo"),
                    fixable=True,
                )
            )
        elif norm in ("zh-tw", "zh-hk", "zh-mo"):
            issues.append(
                Issue(
                    f"{CODE}-023",
                    Severity.INFO,
                    f"dc:language={tag}：建議改用 zh-Hant 書寫系統標籤",
                    file=epub.opf_path,
                    suggestion="zh-Hant-TW 比 zh-TW 更明確；部分閱讀器只認 script subtag。",
                )
            )
        elif norm == "zh-cn":
            issues.append(
                Issue(
                    f"{CODE}-024",
                    Severity.INFO,
                    f"dc:language={tag}：建議改用 zh-Hans",
                    file=epub.opf_path,
                )
            )
        elif profile_for(tag) is None:
            issues.append(
                Issue(
                    f"{CODE}-025",
                    Severity.WARN,
                    f"dc:language={tag} 不在本書預期的五語言範圍內",
                    file=epub.opf_path,
                    suggestion="支援的語言：en / zh-Hant / zh-Hans / ja / ko。",
                )
            )

    if len(langs) > 1:
        issues.append(
            Issue(
                f"{CODE}-026",
                Severity.ERROR,
                f"宣告了 {len(langs)} 個 dc:language：{[l.text for l in langs]}",
                file=epub.opf_path,
                suggestion="每個語言版本應是獨立的一本電子書、獨立 ISBN。"
                "單一檔案宣告多語言會讓平台無法歸類，且 TTS 與字型選擇失準。",
                stores=("kdp", "apple", "google"),
            )
        )
    return issues


def _creator(epub: Epub) -> list:
    issues = []
    creators = epub.meta_values("creator")
    if not creators:
        return [
            Issue(
                f"{CODE}-030",
                Severity.ERROR,
                "缺少 dc:creator（作者）",
                file=epub.opf_path,
                stores=("kdp", "apple", "google", "kobo"),
            )
        ]
    for entry in creators:
        if not entry.text:
            issues.append(
                Issue(f"{CODE}-031", Severity.ERROR, "dc:creator 為空", file=epub.opf_path)
            )
            continue
        for hit in _placeholder_hits(entry.text):
            issues.append(
                Issue(
                    f"{CODE}-032",
                    Severity.BLOCKER,
                    f"dc:creator 仍是佔位文字（含「{hit}」）：{entry.text}",
                    file=epub.opf_path,
                )
            )
        cid = entry.attrib.get("id")
        has_file_as = bool(entry.attrib.get("file-as")) or (
            cid and epub.refines(cid, "file-as")
        )
        if not has_file_as:
            issues.append(
                Issue(
                    f"{CODE}-033",
                    Severity.WARN,
                    f"dc:creator「{entry.text}」沒有 file-as 排序鍵",
                    file=epub.opf_path,
                    suggestion="書店依 file-as 排序作者。中日韓姓名務必補上："
                    "日文填假名、韓文填한글、中文填「姓, 名」或拼音。",
                    stores=("apple", "kobo"),
                )
            )
        has_role = bool(entry.attrib.get("role")) or (cid and epub.refines(cid, "role"))
        if not has_role:
            issues.append(
                Issue(
                    f"{CODE}-034",
                    Severity.INFO,
                    f"dc:creator「{entry.text}」未指定 MARC role",
                    file=epub.opf_path,
                    suggestion="補 role=aut（作者）／trl（譯者）／ill（繪者）。"
                    "翻譯版尤其要標 trl，否則譯者會被當成作者。",
                )
            )
    return issues


def _dates(epub: Epub) -> list:
    issues = []
    if epub.version.startswith("3"):
        modified = epub.meta_by_property("dcterms:modified")
        if not modified:
            issues.append(
                Issue(
                    f"{CODE}-040",
                    Severity.BLOCKER,
                    "EPUB 3 缺少 dcterms:modified",
                    file=epub.opf_path,
                    suggestion='加上 <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>；'
                    "這是 EPUB 3 規範的必填欄位，EPUBCheck 會報錯。",
                    stores=("apple", "google"),
                    fixable=True,
                )
            )
        else:
            for m in modified:
                if not ISO_DT.match(m.text.strip()):
                    issues.append(
                        Issue(
                            f"{CODE}-041",
                            Severity.ERROR,
                            f"dcterms:modified 格式錯誤：{m.text}",
                            file=epub.opf_path,
                            suggestion="必須是 CCYY-MM-DDThh:mm:ssZ（UTC，不可有時區偏移）。",
                            fixable=True,
                        )
                    )
    for entry in epub.meta_values("date"):
        value = entry.text.strip()
        if value and not (ISO_DATE.match(value) or ISO_DT.match(value)):
            issues.append(
                Issue(
                    f"{CODE}-042",
                    Severity.WARN,
                    f"dc:date 格式非 ISO 8601：{value}",
                    file=epub.opf_path,
                )
            )
    return issues


def _rights_and_publisher(epub: Epub) -> list:
    issues = []
    if not epub.first_value("publisher"):
        issues.append(
            Issue(
                f"{CODE}-050",
                Severity.WARN,
                "缺少 dc:publisher",
                file=epub.opf_path,
                suggestion="自出版可填自己的品牌名；書店的出版社欄位會顯示這個值。",
            )
        )
    if not epub.first_value("rights"):
        issues.append(
            Issue(
                f"{CODE}-051",
                Severity.WARN,
                "缺少 dc:rights（版權宣告）",
                file=epub.opf_path,
                suggestion="填入「© 2026 作者名. All rights reserved.」等宣告，"
                "有助於盜版申訴與各平台的權利審查。",
            )
        )
    desc = epub.first_value("description")
    if not desc:
        issues.append(
            Issue(
                f"{CODE}-052",
                Severity.INFO,
                "缺少 dc:description（書籍簡介）",
                file=epub.opf_path,
                suggestion="Google Play 與 Kobo 會直接取用；缺少時只能靠後台手動補。",
                stores=("google", "kobo"),
            )
        )
    elif len(desc) > 4000:
        issues.append(
            Issue(
                f"{CODE}-053",
                Severity.WARN,
                f"dc:description 長度 {len(desc)} 超過常見的 4000 字上限",
                file=epub.opf_path,
            )
        )
    if not epub.meta_values("subject"):
        issues.append(
            Issue(
                f"{CODE}-054",
                Severity.INFO,
                "缺少 dc:subject（分類 / BISAC）",
                file=epub.opf_path,
                suggestion="填 BISAC 代碼有助於書店分類與曝光。",
                stores=("google", "kobo"),
            )
        )
    return issues


def _cover_meta(epub: Epub) -> list:
    """Both the EPUB 3 and the EPUB 2 cover conventions should be present: KDP's
    converter still looks for the legacy <meta name="cover">."""
    issues = []
    epub3_cover = [i for i in epub.manifest.values() if "cover-image" in i.property_set]
    legacy = [m for m in epub.metadata if m.tag == "meta" and m.attrib.get("name") == "cover"]

    if not epub3_cover and not legacy:
        return [
            Issue(
                f"{CODE}-060",
                Severity.BLOCKER,
                "沒有宣告封面圖",
                file=epub.opf_path,
                suggestion='manifest 的封面 item 加上 properties="cover-image"，'
                '並同時保留 <meta name="cover" content="cover-id"/>。',
                stores=("kdp", "apple", "google", "kobo"),
                fixable=True,
            )
        ]
    if not epub3_cover:
        issues.append(
            Issue(
                f"{CODE}-061",
                Severity.ERROR,
                'manifest 缺少 properties="cover-image"',
                file=epub.opf_path,
                suggestion="EPUB 3 平台（Apple/Google/Kobo）以此判斷封面。",
                stores=("apple", "google", "kobo"),
                fixable=True,
            )
        )
    if not legacy:
        issues.append(
            Issue(
                f"{CODE}-062",
                Severity.WARN,
                '缺少舊版 <meta name="cover"> 宣告',
                file=epub.opf_path,
                suggestion="KDP 的 Kindle 轉檔仍會參考它；兩種同時保留成本為零。",
                stores=("kdp",),
                fixable=True,
            )
        )
    elif legacy:
        ref = legacy[0].attrib.get("content", "")
        if ref and ref not in epub.manifest:
            issues.append(
                Issue(
                    f"{CODE}-063",
                    Severity.ERROR,
                    f'<meta name="cover" content="{ref}"> 指向不存在的 manifest id',
                    file=epub.opf_path,
                )
            )
    return issues


def _rendition(epub: Epub) -> list:
    """Fixed-layout and vertical-writing declarations must agree with each other."""
    issues = []
    layout = epub.meta_by_property("rendition:layout")
    is_fixed = any(m.text.strip() == "pre-paginated" for m in layout)

    if is_fixed:
        if not epub.meta_by_property("rendition:spread"):
            issues.append(
                Issue(
                    f"{CODE}-070",
                    Severity.WARN,
                    "固定版面但未宣告 rendition:spread",
                    file=epub.opf_path,
                    suggestion="漫畫／繪本請明確宣告 spread（landscape/both/none）。",
                    stores=("apple", "kdp"),
                )
            )
        has_viewport = False
        for item in epub.content_docs()[:3]:
            if epub.has(item.path) and "viewport" in epub.text(item.path):
                has_viewport = True
                break
        if not has_viewport:
            issues.append(
                Issue(
                    f"{CODE}-071",
                    Severity.ERROR,
                    "固定版面但內容文件缺少 <meta name=\"viewport\"> 尺寸宣告",
                    file=epub.opf_path,
                    suggestion='每個固定版面頁面都需要 <meta name="viewport" '
                    'content="width=1200, height=1600"/>。',
                    stores=("apple", "kdp", "kobo"),
                )
            )

    lang = normalise_tag(epub.declared_language())
    ppd = epub.page_progression
    if ppd and ppd not in ("ltr", "rtl", "default"):
        issues.append(
            Issue(
                f"{CODE}-072",
                Severity.ERROR,
                f"page-progression-direction 值不合法：{ppd}",
                file=epub.opf_path,
            )
        )
    if ppd == "rtl" and lang.startswith("ja"):
        pass  # vertical Japanese, correct
    elif ppd == "rtl" and not lang.startswith(("ja", "ar", "he", "fa", "ur")):
        issues.append(
            Issue(
                f"{CODE}-073",
                Severity.ERROR,
                f"page-progression-direction=rtl 但 dc:language={epub.declared_language()}",
                file=epub.opf_path,
                suggestion="rtl 只適用於日文直排或右至左文字；英中韓橫排書會導致翻頁方向相反。",
                stores=("apple", "kobo"),
            )
        )
    return issues
