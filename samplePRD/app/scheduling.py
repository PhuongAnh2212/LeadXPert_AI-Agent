from __future__ import annotations
import calendar
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from .audit import AuditService
from .db import Database, utcnow
from .schemas import ScheduleCreate


def _next_cron(expression: str, local: datetime) -> datetime:
    parts = expression.split()
    if len(parts) != 5: raise ValueError("cron must have five fields: minute hour day month weekday")
    minute, hour, day, month, weekday = parts
    def allowed(value: str, low: int, high: int) -> set[int]:
        result: set[int] = set()
        for part in value.split(","):
            base, slash, step_text = part.partition("/")
            step = int(step_text) if slash else 1
            if step < 1: raise ValueError("cron step must be positive")
            if base == "*": start, end = low, high
            elif "-" in base: start, end = map(int, base.split("-", 1))
            else: start = end = int(base)
            if start < low or end > high or start > end: raise ValueError("cron field is out of range")
            result.update(range(start, end + 1, step))
        return result
    minutes, hours, days, months, weekdays = allowed(minute, 0, 59), allowed(hour, 0, 23), allowed(day, 1, 31), allowed(month, 1, 12), allowed(weekday, 0, 6)
    cursor = local.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(366 * 24 * 60):
        cron_weekday = (cursor.weekday() + 1) % 7  # cron: Sunday=0
        if cursor.minute in minutes and cursor.hour in hours and cursor.day in days and cursor.month in months and cron_weekday in weekdays: return cursor
        cursor += timedelta(minutes=1)
    raise ValueError("cron has no occurrence within one year")


def next_run(payload: ScheduleCreate | dict[str, Any], after: datetime | None = None) -> datetime:
    p = payload.model_dump() if isinstance(payload, ScheduleCreate) else payload
    tz = ZoneInfo(p["timezone"]); local = (after or datetime.now(timezone.utc)).astimezone(tz)
    if p["frequency"] == "cron": candidate = _next_cron(p["cron_expression"], local)
    else:
        candidate = local.replace(hour=p["hour"], minute=p["minute"], second=0, microsecond=0)
        if p["frequency"] == "daily":
            if candidate <= local: candidate += timedelta(days=1)
        elif p["frequency"] == "weekly":
            candidate += timedelta(days=(p["weekday"] - candidate.weekday()) % 7)
            if candidate <= local: candidate += timedelta(days=7)
        else:
            day = min(p["day_of_month"], calendar.monthrange(candidate.year, candidate.month)[1])
            candidate = candidate.replace(day=day)
            if candidate <= local:
                year, month = (candidate.year + 1, 1) if candidate.month == 12 else (candidate.year, candidate.month + 1)
                candidate = candidate.replace(year=year, month=month, day=min(p["day_of_month"], calendar.monthrange(year, month)[1]))
    return candidate.astimezone(timezone.utc)


class ScheduleService:
    def __init__(self, db: Database, audit: AuditService): self.db, self.audit = db, audit
    def upsert(self, tenant_id: str, actor_id: str, template_id: str, payload: ScheduleCreate) -> dict[str, Any]:
        if not self.db.query_one("SELECT id FROM report_templates WHERE id=? AND tenant_id=?", (template_id, tenant_id)): raise HTTPException(404, "template not found")
        try: due = next_run(payload).isoformat()
        except (ValueError, KeyError) as exc: raise HTTPException(422, str(exc)) from exc
        existing = self.db.query_one("SELECT id,created_at FROM report_schedules WHERE template_id=?", (template_id,))
        schedule_id, created, now = (existing["id"], existing["created_at"], utcnow()) if existing else (str(uuid.uuid4()), utcnow(), utcnow())
        p = payload.model_dump()
        with self.db.transaction() as conn:
            conn.execute("INSERT OR REPLACE INTO report_schedules VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (schedule_id, template_id, tenant_id, p["frequency"], p["cron_expression"], p["hour"], p["minute"], p["weekday"], p["day_of_month"], p["timezone"], int(p["enabled"]), due, None, created, now))
        self.audit.log(tenant_id, actor_id, "schedule.saved", template_id=template_id, parameters={"next_run_at": due})
        return self.db.query_one("SELECT * FROM report_schedules WHERE id=?", (schedule_id,))
