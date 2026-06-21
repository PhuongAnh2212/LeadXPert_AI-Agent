from __future__ import annotations
import sqlite3
import uuid
from typing import Any
from fastapi import HTTPException
from .audit import AuditService
from .db import Database, json_dump, json_load, utcnow
from .schemas import TemplateCreate, TemplateUpdate


JSON_FIELDS = {"filters": "filters_json", "columns": "columns_json", "sort_order": "sort_json", "grouping_dimensions": "grouping_json", "date_range": "date_range_json", "output_formats": "output_formats_json", "recipients": "recipients_json"}


def hydrate(row: dict[str, Any]) -> dict[str, Any]:
    for public, stored in JSON_FIELDS.items(): row[public] = json_load(row.pop(stored), [] if public not in {"filters", "date_range"} else {})
    return row


class TemplateService:
    def __init__(self, db: Database, audit: AuditService): self.db, self.audit = db, audit

    def create(self, tenant_id: str, owner_id: str, payload: TemplateCreate) -> dict[str, Any]:
        template_id, now = str(uuid.uuid4()), utcnow()
        values = payload.model_dump(mode="json")
        row = (template_id, tenant_id, values["name"], values["description"], owner_id, 1, *(json_dump(values[k]) for k in JSON_FIELDS), values["delivery_mode"], now, now)
        snapshot = {**values, "id": template_id, "tenant_id": tenant_id, "owner_id": owner_id, "version": 1}
        try:
            with self.db.transaction() as conn:
                conn.execute("INSERT INTO report_templates VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", row)
                conn.execute("INSERT INTO report_template_versions VALUES (?,?,?,?,?)", (template_id, 1, json_dump(snapshot), now, owner_id))
        except sqlite3.IntegrityError as exc:
            raise HTTPException(409, "template name already exists") from exc
        self.audit.log(tenant_id, owner_id, "template.created", template_id=template_id, parameters={"version": 1})
        for recipient in values["recipients"]:
            if not recipient["internal"]:
                self.audit.log(tenant_id, owner_id, "external_recipient.acknowledged", template_id=template_id, parameters={"email": recipient["email"]})
        return self.get(tenant_id, template_id)

    def get(self, tenant_id: str, template_id: str) -> dict[str, Any]:
        row = self.db.query_one("SELECT * FROM report_templates WHERE tenant_id=? AND id=?", (tenant_id, template_id))
        if not row: raise HTTPException(404, "template not found")
        return hydrate(row)

    def list(self, tenant_id: str) -> list[dict[str, Any]]:
        return [hydrate(r) for r in self.db.query_all("SELECT * FROM report_templates WHERE tenant_id=? ORDER BY updated_at DESC", (tenant_id,))]

    def update(self, tenant_id: str, actor_id: str, template_id: str, payload: TemplateUpdate) -> dict[str, Any]:
        current = self.get(tenant_id, template_id)
        changes = payload.model_dump(exclude_unset=True, mode="json")
        if not changes: return current
        merged = {**current, **changes}; version, now = current["version"] + 1, utcnow()
        assignments, params = ["version=?", "updated_at=?"], [version, now]
        for key, value in changes.items():
            column = JSON_FIELDS.get(key, key)
            assignments.append(f"{column}=?"); params.append(json_dump(value) if key in JSON_FIELDS else value)
        params.extend([tenant_id, template_id])
        with self.db.transaction() as conn:
            conn.execute(f"UPDATE report_templates SET {','.join(assignments)} WHERE tenant_id=? AND id=?", tuple(params))
            snapshot = {k: v for k, v in merged.items() if not k.endswith("_at")}; snapshot["version"] = version
            conn.execute("INSERT INTO report_template_versions VALUES (?,?,?,?,?)", (template_id, version, json_dump(snapshot), now, actor_id))
        self.audit.log(tenant_id, actor_id, "template.updated", template_id=template_id, parameters={"version": version})
        old_external = {r["email"] for r in current["recipients"] if not r["internal"]}
        for r in merged["recipients"]:
            if not r["internal"] and r["email"] not in old_external:
                self.audit.log(tenant_id, actor_id, "external_recipient.acknowledged", template_id=template_id, parameters={"email": r["email"]})
        return self.get(tenant_id, template_id)

    def delete(self, tenant_id: str, actor_id: str, template_id: str) -> None:
        current = self.get(tenant_id, template_id)
        if current["owner_id"] != actor_id: raise HTTPException(403, "only the owner can delete a template")
        if self.db.query_one("SELECT id FROM report_runs WHERE template_id=? LIMIT 1", (template_id,)):
            raise HTTPException(409, "templates with report artifacts cannot be deleted")
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM report_schedules WHERE template_id=?", (template_id,))
            conn.execute("DELETE FROM report_template_versions WHERE template_id=?", (template_id,))
            conn.execute("DELETE FROM report_templates WHERE id=?", (template_id,))
        self.audit.log(tenant_id, actor_id, "template.deleted", template_id=template_id)
