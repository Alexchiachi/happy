#!/usr/bin/env python3
"""Pack book/src/ into a shippable EPUB.

    python3 book/build.py                 # -> book/我們不要就這樣算了，但也不要一直記得.epub
    python3 book/build.py out.epub

The OCF spec is strict about two things that a plain `zip -r` gets wrong, and
both are silent failures — the file opens fine locally and is rejected at
upload:

  * ``mimetype`` must be the first entry in the archive, and stored
    uncompressed, so a reader can identify the format from the first bytes
    without inflating anything.
  * Nothing may precede it, including the directory entries that most zip
    tools emit.

Entries are written in a fixed order with a fixed timestamp so that building
the same sources twice produces byte-identical output — otherwise every
rebuild shows up as a change in git even when nothing was edited.
"""

from __future__ import annotations

import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
DEFAULT_OUT = os.path.join(HERE, "我們不要就這樣算了，但也不要一直記得.epub")

# Fixed so rebuilds are reproducible. Zip cannot store dates before 1980.
TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def entries(root: str):
    """Every file under *root*, depth-first in a stable order."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            yield full, os.path.relpath(full, root).replace(os.sep, "/")


def build(src: str = SRC, out: str = DEFAULT_OUT) -> str:
    if not os.path.isdir(src):
        raise SystemExit(f"找不到書稿目錄：{src}")

    files = list(entries(src))
    names = {arc for _, arc in files}
    for required in ("mimetype", "META-INF/container.xml"):
        if required not in names:
            raise SystemExit(f"書稿缺少必要檔案：{required}")

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        first = zipfile.ZipInfo("mimetype", TIMESTAMP)
        first.compress_type = zipfile.ZIP_STORED
        zf.writestr(first, b"application/epub+zip")

        for full, arc in files:
            if arc == "mimetype":
                continue
            info = zipfile.ZipInfo(arc, TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(full, "rb") as fh:
                zf.writestr(info, fh.read())

    verify(out)
    print(f"{out}  ({os.path.getsize(out) / 1024:.0f} KB)")
    return out


def verify(path: str) -> None:
    with zipfile.ZipFile(path) as zf:
        head = zf.infolist()[0]
        assert head.filename == "mimetype", "mimetype 必須是第一個項目"
        assert head.compress_type == zipfile.ZIP_STORED, "mimetype 不可壓縮"
        assert zf.read("mimetype") == b"application/epub+zip"
        broken = zf.testzip()
        assert broken is None, f"CRC 錯誤：{broken}"


if __name__ == "__main__":
    build(out=sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT)
