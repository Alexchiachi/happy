"""Issue model shared by every check and fixer."""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from typing import Optional


class Severity(enum.IntEnum):
    """Ordered so that ``max()`` yields the worst finding."""

    INFO = 0
    WARN = 1
    ERROR = 2
    BLOCKER = 3

    @property
    def label(self) -> str:
        return {
            Severity.INFO: "INFO",
            Severity.WARN: "WARN",
            Severity.ERROR: "ERROR",
            Severity.BLOCKER: "BLOCKER",
        }[self]


#: Store identifiers used by the ``stores`` field of an :class:`Issue`.
STORES = ("kdp", "apple", "google", "kobo", "readmoo")

STORE_NAMES = {
    "kdp": "Amazon KDP",
    "apple": "Apple Books",
    "google": "Google Play Books",
    "kobo": "Rakuten Kobo",
    "readmoo": "Readmoo 讀墨",
}


@dataclass
class Issue:
    """A single finding.

    ``code`` is a stable identifier (e.g. ``META-003``) so that findings can be
    suppressed from a config file and diffed between runs.
    """

    code: str
    severity: Severity
    message: str
    #: Path inside the EPUB container, when the finding is file-scoped.
    file: Optional[str] = None
    #: 1-indexed line inside ``file``.
    line: Optional[int] = None
    #: Offending source excerpt.
    excerpt: Optional[str] = None
    #: What the author should do about it.
    suggestion: Optional[str] = None
    #: Stores that reject or penalise this. Empty means "all / general quality".
    stores: tuple = ()
    #: Language profile the finding belongs to, if language specific.
    lang: Optional[str] = None
    #: True when ``epubqa fix`` can repair it automatically.
    fixable: bool = False

    def location(self) -> str:
        if self.file and self.line:
            return f"{self.file}:{self.line}"
        return self.file or "(package)"


@dataclass
class Report:
    epub_path: str
    declared_lang: Optional[str] = None
    detected_lang: Optional[str] = None
    epub_version: Optional[str] = None
    issues: list = field(default_factory=list)
    stats: dict = field(default_factory=dict)

    def add(self, issue: Issue) -> None:
        self.issues.append(issue)

    def extend(self, issues) -> None:
        self.issues.extend(issues)

    def by_severity(self, severity: Severity) -> list:
        return [i for i in self.issues if i.severity == severity]

    def counts(self) -> dict:
        out = {s: 0 for s in Severity}
        for issue in self.issues:
            out[issue.severity] += 1
        return out

    @property
    def worst(self) -> Severity:
        if not self.issues:
            return Severity.INFO
        return max(i.severity for i in self.issues)

    def sorted_issues(self) -> list:
        return sorted(
            self.issues,
            key=lambda i: (-int(i.severity), i.code, i.file or "", i.line or 0),
        )
