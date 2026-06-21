from __future__ import annotations
from typing import Any, Protocol


class SearchProvider(Protocol):
    def search_all(self, tenant_id: str, filters: dict[str, Any], start: str, end: str, columns: list[str]) -> list[dict[str, Any]]: ...


class EmptySearchProvider:
    """Safe local default. Wire this interface to the platform Search API in production."""
    def search_all(self, tenant_id: str, filters: dict[str, Any], start: str, end: str, columns: list[str]) -> list[dict[str, Any]]:
        return []


class MemorySearchProvider:
    def __init__(self, rows: list[dict[str, Any]]): self.rows = rows
    def search_all(self, tenant_id: str, filters: dict[str, Any], start: str, end: str, columns: list[str]) -> list[dict[str, Any]]:
        return list(self.rows)

