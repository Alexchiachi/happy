"""epubqa — 電子書上架前檢查、修正與優化.

Supported editions: en / zh-Hant / zh-Hans / ja / ko
Target stores: Amazon KDP, Apple Books, Google Play Books, Rakuten Kobo
"""

__version__ = "1.0.0"

from .issues import Issue, Report, Severity  # noqa: F401
from .model import Epub, EpubError  # noqa: F401
