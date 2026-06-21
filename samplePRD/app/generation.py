from __future__ import annotations
import time
import uuid
import calendar
from datetime import datetime, timezone
from typing import Any
from .artifacts import EncryptedArtifactStore
from .audit import AuditService
from .csv_report import generate_csv
from .date_ranges import resolve_date_range
from .db import Database, json_dump, json_load, utcnow
from .emailer import EmailService, delivery_email, Email
from .pdf_report import generate_pdf
from .schemas import DateRangeConfig
from .search import SearchProvider
from .security import make_download_token
from .templates import TemplateService


class ReportGenerator:
    def __init__(self, db: Database, templates: TemplateService, search: SearchProvider, store: EncryptedArtifactStore, email: EmailService, audit: AuditService, base_url: str, signing_key: bytes):
        self.db, self.templates, self.search, self.store, self.email, self.audit = db, templates, search, store, email, audit
        self.base_url, self.signing_key = base_url, signing_key

    def reserve(self, tenant_id: str, template_id: str, period_key: str, schedule_id: str | None = None) -> tuple[str, bool]:
        template = self.templates.get(tenant_id, template_id); report_id = str(uuid.uuid4())
        try:
            with self.db.transaction() as conn:
                conn.execute("INSERT INTO report_runs(id,tenant_id,template_id,template_version,schedule_id,period_key,status,created_at) VALUES (?,?,?,?,?,?,?,?)", (report_id, tenant_id, template_id, template["version"], schedule_id, period_key, "queued", utcnow()))
            return report_id, True
        except Exception as exc:
            existing = self.db.query_one("SELECT id FROM report_runs WHERE template_id=? AND period_key=?", (template_id, period_key))
            if existing: return existing["id"], False
            raise exc

    def generate(self, tenant_id: str, template_id: str, report_id: str, tenant_timezone: str, actor_id: str = "scheduler") -> list[dict[str, Any]]:
        started = time.monotonic(); generated_at = datetime.now(timezone.utc); template = self.templates.get(tenant_id, template_id)
        resolved = resolve_date_range(DateRangeConfig.model_validate(template["date_range"]), tenant_timezone, generated_at)
        parameters = {"filters": template["filters"], "columns": template["columns"], "sort_order": template["sort_order"], "grouping_dimensions": template["grouping_dimensions"], "date_range": resolved}
        with self.db.transaction() as conn:
            conn.execute("UPDATE report_runs SET status='running',attempt=attempt+1,started_at=?,resolved_parameters_json=? WHERE id=?", (utcnow(), json_dump(parameters), report_id))
        self.audit.log(tenant_id, actor_id, "report.generation.started", report_id=report_id, template_id=template_id, parameters=resolved)
        try:
            rows = self.search.search_all(tenant_id, template["filters"], resolved["start"], resolved["end"], template["columns"])
            for sort in reversed(template["sort_order"]):
                field = sort.get("field")
                if field: rows.sort(key=lambda row: (row.get(field) is None, str(row.get(field, ""))), reverse=sort.get("direction", "asc").lower() == "desc")
            csv_content = generate_csv(rows, template["columns"])
            artifact_specs: list[tuple[str, bytes]] = []
            if "csv" in template["output_formats"] or "pdf" in template["output_formats"]: artifact_specs.append(("csv", csv_content))
            if "pdf" in template["output_formats"]:
                csv_token = make_download_token(report_id, self.signing_key)
                csv_url = f"{self.base_url}/api/reports/{report_id}/download.csv?token={csv_token}"
                pdf, _ = generate_pdf(template, rows, resolved, csv_url, generated_at); artifact_specs.append(("pdf", pdf))
            artifacts = []
            for fmt, content in artifact_specs:
                artifact_id, storage_key = str(uuid.uuid4()), f"{tenant_id}/{report_id}/{uuid.uuid4()}.{fmt}.aes"
                file_size, digest = self.store.put(storage_key, content)
                duration_ms = int((time.monotonic() - started) * 1000)
                retention_day = min(generated_at.day, calendar.monthrange(generated_at.year + 7, generated_at.month)[1])
                retain_until = generated_at.replace(year=generated_at.year + 7, day=retention_day).isoformat()
                token = make_download_token(artifact_id, self.signing_key); url = f"{self.base_url}/api/artifacts/{artifact_id}/download?token={token}"
                deliveries = []
                for recipient in template["recipients"]:
                    message, mode = delivery_email(recipient["email"], template["name"], content, f"{template['name']}.{fmt}", template["delivery_mode"], url)
                    self.email.send(message); deliveries.append({"recipient": recipient["email"], "status": "sent", "mode": mode})
                    self.audit.log(tenant_id, actor_id, "report.delivery", report_id=report_id, template_id=template_id, parameters=deliveries[-1])
                with self.db.transaction() as conn:
                    conn.execute("INSERT INTO report_artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (artifact_id, report_id, tenant_id, template_id, template["version"], fmt, storage_key, json_dump(parameters), len(rows), file_size, digest, generated_at.isoformat(), duration_ms, json_dump(deliveries), retain_until))
                artifacts.append({"id": artifact_id, "format": fmt, "sha256": digest, "file_size": file_size, "url": url, "delivery_status": deliveries})
            duration_ms = int((time.monotonic() - started) * 1000)
            with self.db.transaction() as conn: conn.execute("UPDATE report_runs SET status='completed',row_count=?,completed_at=?,duration_ms=? WHERE id=?", (len(rows), utcnow(), duration_ms, report_id))
            self.audit.log(tenant_id, actor_id, "report.generation.completed", report_id=report_id, template_id=template_id, parameters={"row_count": len(rows), "duration_ms": duration_ms})
            return artifacts
        except Exception as exc:
            with self.db.transaction() as conn: conn.execute("UPDATE report_runs SET status='failed',error=? WHERE id=?", (str(exc), report_id))
            self.audit.log(tenant_id, actor_id, "report.generation.failure", report_id=report_id, template_id=template_id, parameters={"error": str(exc)}, status="failed")
            raise

    def notify_failure(self, tenant_id: str, template_id: str, report_id: str, error: str) -> None:
        template = self.templates.get(tenant_id, template_id)
        self.email.send(Email(template["owner_id"], f"Report generation failed: {template['name']}", f"Generation failed after 2 retries: {error}. Report: {report_id}"))
        with self.db.transaction() as conn:
            conn.execute("INSERT INTO notifications VALUES (?,?,?,?,?,?,?,?,?)", (str(uuid.uuid4()), tenant_id, template["owner_id"], "report_failure", f"Report failed: {template['name']}", f"Generation failed after two retries: {error}", report_id, None, utcnow()))
        self.audit.log(tenant_id, "scheduler", "report.failure_notification", report_id=report_id, template_id=template_id, parameters={"owner": template["owner_id"]}, status="sent")
