from __future__ import annotations
import uuid
from typing import Any
from .db import Database, json_dump, json_load, utcnow


class AuditService:
    def __init__(self, db: Database): self.db = db

    def log(self, tenant_id: str, actor_id: str, action: str, *, report_id: str | None = None, template_id: str | None = None, parameters: dict[str, Any] | None = None, status: str = "success") -> str:
        audit_id = str(uuid.uuid4())
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO audit_log VALUES (?,?,?,?,?,?,?,?,?)", (audit_id, tenant_id, actor_id, action, utcnow(), report_id, template_id, json_dump(parameters or {}), status))
        return audit_id

    def list(self, tenant_id: str) -> list[dict[str, Any]]:
        rows = self.db.query_all("SELECT * FROM audit_log WHERE tenant_id=? ORDER BY timestamp DESC", (tenant_id,))
        for row in rows: row["parameters"] = json_load(row.pop("parameters_json"), {})
        return rows

