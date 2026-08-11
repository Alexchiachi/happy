"""In-memory EPUB container model.

Everything is read into memory (ebooks are small) so that checks can inspect the
package freely and fixers can rewrite entries before a single atomic save.

Only the standard library is used: no lxml, no ebooklib, no install step.
"""

from __future__ import annotations

import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from xml.etree import ElementTree as ET

NS = {
    "container": "urn:oasis:names:tc:opendocument:xmlns:container",
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
    "xhtml": "http://www.w3.org/1999/xhtml",
    "epub": "http://www.idpf.org/2007/ops",
    "ncx": "http://www.daisy.org/z3986/2005/ncx/",
    "enc": "http://www.w3.org/2001/04/xmlenc#",
}

for _prefix, _uri in NS.items():
    if _prefix != "xhtml":
        ET.register_namespace("" if _prefix == "opf" else _prefix, _uri)

CONTAINER_PATH = "META-INF/container.xml"

XHTML_MEDIA = {"application/xhtml+xml", "text/html"}
CSS_MEDIA = {"text/css"}
IMAGE_MEDIA = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/svg+xml",
    "image/webp",
    "image/avif",
}
FONT_MEDIA = {
    "font/ttf",
    "font/otf",
    "font/woff",
    "font/woff2",
    "application/font-sfnt",
    "application/vnd.ms-opentype",
    "application/x-font-ttf",
    "application/x-font-opentype",
    "application/font-woff",
}


class EpubError(Exception):
    """Raised when the container is so broken that no checks can run."""


@dataclass
class ManifestItem:
    id: str
    href: str
    media_type: str
    properties: str = ""
    #: Absolute path inside the zip (href resolved against the OPF directory).
    path: str = ""

    @property
    def property_set(self) -> set:
        return set(self.properties.split())

    def is_xhtml(self) -> bool:
        return self.media_type in XHTML_MEDIA

    def is_css(self) -> bool:
        return self.media_type in CSS_MEDIA

    def is_image(self) -> bool:
        return self.media_type in IMAGE_MEDIA

    def is_font(self) -> bool:
        return self.media_type in FONT_MEDIA or self.href.lower().endswith(
            (".ttf", ".otf", ".woff", ".woff2", ".ttc")
        )


@dataclass
class SpineItem:
    idref: str
    linear: bool = True
    properties: str = ""


@dataclass
class MetaEntry:
    """One metadata element, namespace-agnostic for easy querying."""

    tag: str  # local name, e.g. "title", "language", "meta"
    ns: str  # namespace uri
    text: str
    attrib: dict = field(default_factory=dict)
    element: Optional[ET.Element] = None

    @property
    def prop(self) -> str:
        """EPUB 3 ``property`` or EPUB 2 ``name`` attribute."""
        return self.attrib.get("property") or self.attrib.get("name") or ""


class Epub:
    """A loaded, mutable EPUB container."""

    def __init__(self, path: str):
        self.path = path
        self.files: Dict[str, bytes] = {}
        self.order: List[str] = []
        self.compress: Dict[str, int] = {}
        self.opf_path: str = ""
        self.version: str = ""
        self.unique_identifier: str = ""
        self.manifest: Dict[str, ManifestItem] = {}
        self.spine: List[SpineItem] = []
        self.spine_toc: str = ""
        self.page_progression: str = ""
        self.metadata: List[MetaEntry] = []
        self.opf_tree: Optional[ET.ElementTree] = None
        self.load_errors: List[str] = []
        self._load()

    # ------------------------------------------------------------------ load

    def _load(self) -> None:
        try:
            with zipfile.ZipFile(self.path) as zf:
                for info in zf.infolist():
                    if info.is_dir():
                        continue
                    self.order.append(info.filename)
                    self.compress[info.filename] = info.compress_type
                    self.files[info.filename] = zf.read(info.filename)
        except (zipfile.BadZipFile, OSError) as exc:
            raise EpubError(f"cannot open as zip: {exc}") from exc

        self._load_container()
        self._load_opf()

    def _load_container(self) -> None:
        raw = self.files.get(CONTAINER_PATH)
        if raw is None:
            raise EpubError("META-INF/container.xml is missing")
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as exc:
            raise EpubError(f"META-INF/container.xml is not well-formed XML: {exc}")
        rootfile = root.find(".//container:rootfile", NS)
        if rootfile is None or not rootfile.get("full-path"):
            raise EpubError("container.xml declares no rootfile full-path")
        self.opf_path = rootfile.get("full-path", "").lstrip("/")

    def _load_opf(self) -> None:
        raw = self.files.get(self.opf_path)
        if raw is None:
            raise EpubError(f"OPF not found at declared path: {self.opf_path}")
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as exc:
            raise EpubError(f"OPF is not well-formed XML: {exc}")
        self.opf_tree = ET.ElementTree(root)
        self.version = root.get("version", "")
        self.unique_identifier = root.get("unique-identifier", "")

        meta_el = root.find("opf:metadata", NS)
        if meta_el is not None:
            for child in meta_el:
                if not isinstance(child.tag, str):
                    continue  # comment / PI
                ns, _, local = child.tag.partition("}")
                ns = ns.lstrip("{") if local else ""
                local = local or child.tag
                self.metadata.append(
                    MetaEntry(
                        tag=local,
                        ns=ns,
                        text=(child.text or "").strip(),
                        attrib=self._plain_attrib(child),
                        element=child,
                    )
                )

        manifest_el = root.find("opf:manifest", NS)
        if manifest_el is not None:
            for item in manifest_el.findall("opf:item", NS):
                href = item.get("href", "")
                mi = ManifestItem(
                    id=item.get("id", ""),
                    href=href,
                    media_type=item.get("media-type", ""),
                    properties=item.get("properties", "") or "",
                    path=self.resolve(href),
                )
                self.manifest[mi.id] = mi

        spine_el = root.find("opf:spine", NS)
        if spine_el is not None:
            self.spine_toc = spine_el.get("toc", "") or ""
            self.page_progression = spine_el.get("page-progression-direction", "") or ""
            for ref in spine_el.findall("opf:itemref", NS):
                self.spine.append(
                    SpineItem(
                        idref=ref.get("idref", ""),
                        linear=(ref.get("linear", "yes") != "no"),
                        properties=ref.get("properties", "") or "",
                    )
                )

    @staticmethod
    def _plain_attrib(el: ET.Element) -> dict:
        """Strip namespaces from attribute names for ergonomic lookups."""
        out = {}
        for key, value in el.attrib.items():
            if key.startswith("{"):
                uri, _, local = key[1:].partition("}")
                if uri == "http://www.w3.org/XML/1998/namespace":
                    out["xml:" + local] = value
                else:
                    out[local] = value
                    out[key] = value
            else:
                out[key] = value
        return out

    # -------------------------------------------------------------- helpers

    @property
    def opf_dir(self) -> str:
        return posixpath.dirname(self.opf_path)

    def resolve(self, href: str, base: Optional[str] = None) -> str:
        """Resolve an href (relative to ``base``, default the OPF) to a zip path."""
        href = href.split("#", 1)[0]
        if not href or "://" in href:
            return ""
        from urllib.parse import unquote

        href = unquote(href)
        base_dir = posixpath.dirname(base) if base else self.opf_dir
        return posixpath.normpath(posixpath.join(base_dir, href)).lstrip("/")

    def has(self, path: str) -> bool:
        return path in self.files

    def text(self, path: str) -> str:
        """Decode a container entry, tolerating a BOM and legacy encodings."""
        raw = self.files.get(path, b"")
        for encoding in ("utf-8-sig", "utf-8", "utf-16", "cp950", "gb18030", "shift_jis"):
            try:
                return raw.decode(encoding)
            except UnicodeDecodeError:
                continue
        return raw.decode("utf-8", errors="replace")

    def set_text(self, path: str, value: str) -> None:
        self.files[path] = value.encode("utf-8")
        if path not in self.order:
            self.order.append(path)

    def items(self, predicate) -> List[ManifestItem]:
        return [i for i in self.manifest.values() if predicate(i)]

    def content_docs(self) -> List[ManifestItem]:
        """Spine documents in reading order, then any unspined XHTML."""
        seen = set()
        out = []
        for sp in self.spine:
            item = self.manifest.get(sp.idref)
            if item is not None and item.is_xhtml():
                out.append(item)
                seen.add(item.id)
        for item in self.manifest.values():
            if item.is_xhtml() and item.id not in seen:
                out.append(item)
        return out

    def css_docs(self) -> List[ManifestItem]:
        return self.items(lambda i: i.is_css())

    def meta_values(self, tag: str, ns: str = NS["dc"]) -> List[MetaEntry]:
        return [m for m in self.metadata if m.tag == tag and m.ns == ns]

    def first_value(self, tag: str, ns: str = NS["dc"]) -> str:
        entries = self.meta_values(tag, ns)
        return entries[0].text if entries else ""

    def meta_by_property(self, prop: str) -> List[MetaEntry]:
        return [m for m in self.metadata if m.tag == "meta" and m.prop == prop]

    def refines(self, target_id: str, prop: str) -> Optional[str]:
        for m in self.metadata:
            if m.tag != "meta":
                continue
            if m.attrib.get("refines", "").lstrip("#") == target_id and m.prop == prop:
                return m.text
        return None

    def declared_language(self) -> str:
        return self.first_value("language").strip()

    # ---------------------------------------------------------------- write

    def sync_opf(self) -> None:
        """Serialise the mutated OPF tree back into the container."""
        if self.opf_tree is None:
            return
        body = ET.tostring(self.opf_tree.getroot(), encoding="unicode")
        self.set_text(self.opf_path, '<?xml version="1.0" encoding="UTF-8"?>\n' + body)

    def save(self, dest: str) -> None:
        """Write a spec-conformant OCF zip.

        ``mimetype`` must be the first entry and stored uncompressed; getting this
        wrong is the single most common cause of an outright store rejection.
        """
        self.sync_opf()
        self.files.setdefault("mimetype", b"application/epub+zip")

        ordered = ["mimetype"]
        ordered += [n for n in self.order if n != "mimetype" and n in self.files]
        ordered += [n for n in self.files if n not in ordered]

        with zipfile.ZipFile(dest, "w") as zf:
            for name in ordered:
                data = self.files[name]
                if name == "mimetype":
                    zf.writestr(
                        zipfile.ZipInfo("mimetype"), data, zipfile.ZIP_STORED
                    )
                else:
                    zf.writestr(name, data, zipfile.ZIP_DEFLATED)

    # ------------------------------------------------------------ diagnostics

    def uncompressed_size(self) -> int:
        return sum(len(v) for v in self.files.values())

    def file_size(self) -> int:
        import os

        return os.path.getsize(self.path)


def line_of(text: str, index: int) -> int:
    """1-indexed line number for a character offset."""
    return text.count("\n", 0, index) + 1


_TAG_RE = re.compile(r"<[^>]+>")
_SCRIPT_STYLE_RE = re.compile(
    r"<(script|style)\b.*?</\1\s*>", re.IGNORECASE | re.DOTALL
)
_COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)


def visible_text(markup: str) -> str:
    """Strip markup, keeping offsets roughly aligned by padding with spaces.

    Offsets stay usable for line numbers because every removed character is
    replaced with a space or newline of the same length.
    """

    def blank(match: re.Match) -> str:
        return re.sub(r"[^\n]", " ", match.group(0))

    out = _COMMENT_RE.sub(blank, markup)
    out = _SCRIPT_STYLE_RE.sub(blank, out)
    out = _TAG_RE.sub(blank, out)
    return out
