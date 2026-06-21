from __future__ import annotations
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from .audit import AuditService
from .date_ranges import resolve_date_range
from .db import Database, utcnow
from .generation import ReportGenerator
from .schemas import DateRangeConfig
from .scheduling import next_run
from .templates import TemplateService


class ReportWorker:
    RETRY_DELAYS = (300, 900)
    def __init__(self, db: Database, templates: TemplateService, generator: ReportGenerator, audit: AuditService, workers: int = 8, tenant_limit: int = 5, sleeper=time.sleep):
        self.db, self.templates, self.generator, self.audit, self.sleeper = db, templates, generator, audit, sleeper
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="report-worker")
        self.tenant_limit = tenant_limit; self._locks: dict[str, threading.BoundedSemaphore] = {}; self._guard = threading.Lock()

    def _semaphore(self, tenant_id: str) -> threading.BoundedSemaphore:
        with self._guard: return self._locks.setdefault(tenant_id, threading.BoundedSemaphore(self.tenant_limit))

    def submit(self, tenant_id: str, template_id: str, report_id: str, timezone_name: str):
        return self.pool.submit(self.execute_with_retries, tenant_id, template_id, report_id, timezone_name)

    def execute_with_retries(self, tenant_id: str, template_id: str, report_id: str, timezone_name: str):
        with self._semaphore(tenant_id):
            for attempt in range(3):
                try: return self.generator.generate(tenant_id, template_id, report_id, timezone_name)
                except Exception as exc:
                    if attempt == 2:
                        self.generator.notify_failure(tenant_id, template_id, report_id, str(exc)); raise
                    delay = self.RETRY_DELAYS[attempt]
                    self.audit.log(tenant_id, "scheduler", "report.retry", report_id=report_id, template_id=template_id, parameters={"retry": attempt + 1, "delay_seconds": delay}, status="scheduled")
                    self.sleeper(delay)

    def tick(self, now: datetime | None = None) -> int:
        current = now or datetime.now(timezone.utc)
        due = self.db.query_all("SELECT * FROM report_schedules WHERE enabled=1 AND next_run_at<=?", (current.isoformat(),))
        enqueued = 0
        for schedule in due:
            template = self.templates.get(schedule["tenant_id"], schedule["template_id"])
            resolved = resolve_date_range(DateRangeConfig.model_validate(template["date_range"]), schedule["timezone"], current)
            period_key = f"{resolved['start']}:{resolved['end']}"
            report_id, created = self.generator.reserve(schedule["tenant_id"], schedule["template_id"], period_key, schedule["id"])
            payload = dict(schedule); payload["enabled"] = bool(payload["enabled"])
            following = next_run(payload, current).isoformat()
            with self.db.transaction() as conn: conn.execute("UPDATE report_schedules SET last_run_at=?,next_run_at=?,updated_at=? WHERE id=?", (current.isoformat(), following, utcnow(), schedule["id"]))
            if created:
                self.submit(schedule["tenant_id"], schedule["template_id"], report_id, schedule["timezone"]); enqueued += 1
        return enqueued
