"""Check registry.

Each module exposes ``check(epub, target_lang="")`` (the language argument is
optional) and returns a list of :class:`~epubqa.issues.Issue`.
"""

from __future__ import annotations

import inspect

from . import accessibility, assets, language, metadata, stores, structure, typography

#: Ordered so the report reads from "will be rejected" to "could be better".
REGISTRY = {
    "structure": structure,
    "metadata": metadata,
    "language": language,
    "typography": typography,
    "assets": assets,
    "accessibility": accessibility,
    "stores": stores,
}

CATEGORY_LABELS = {
    "structure": "容器與結構 / Structure",
    "metadata": "後設資料 / Metadata",
    "language": "語言一致性 / Language",
    "typography": "排版與標點 / Typography",
    "assets": "封面圖片字型 / Assets",
    "accessibility": "無障礙 / Accessibility",
    "stores": "平台規則 / Store rules",
}


def run_all(epub, target_lang: str = "", only=None, skip=None) -> list:
    """Run every registered check, tolerating a crash in any single module."""
    from ..issues import Issue, Severity

    issues = []
    for name, module in REGISTRY.items():
        if only and name not in only:
            continue
        if skip and name in skip:
            continue
        try:
            params = inspect.signature(module.check).parameters
            if "target_lang" in params:
                issues.extend(module.check(epub, target_lang))
            else:
                issues.extend(module.check(epub))
        except Exception as exc:  # a broken book should not kill the whole report
            issues.append(
                Issue(
                    "SELF-001",
                    Severity.WARN,
                    f"檢查模組 {name} 執行失敗：{type(exc).__name__}: {exc}",
                    suggestion="這是工具本身的問題，請回報；其餘檢查結果仍然有效。",
                )
            )
    return issues
