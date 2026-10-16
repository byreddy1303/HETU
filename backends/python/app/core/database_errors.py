from __future__ import annotations

import re

from asyncpg.exceptions import InsufficientResourcesError


def is_database_quota_error(error: BaseException) -> bool:
    """Recognize the provider's quota failure, including SQLAlchemy and async wrappers."""
    pending: list[BaseException] = [error]
    visited: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in visited:
            continue
        visited.add(id(current))
        if isinstance(current, InsufficientResourcesError):
            message = str(current).lower()
            if (
                re.search(r"\b(?:account|project)\b", message)
                and re.search(r"\bquota\b", message)
                and re.search(r"\b(?:exceed\w*|exhaust\w*|reached)\b", message)
            ):
                return True
        for attribute in ("orig", "__cause__", "__context__"):
            nested = getattr(current, attribute, None)
            if isinstance(nested, BaseException):
                pending.append(nested)
        if isinstance(current, BaseExceptionGroup):
            pending.extend(current.exceptions)
    return False
