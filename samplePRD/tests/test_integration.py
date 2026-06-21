from datetime import datetime, timedelta, timezone
from app.scheduling import ScheduleService
from app.schemas import ScheduleCreate
from app.search import MemorySearchProvider
from tests.helpers import template_payload


def test_end_to_end_scheduled_generation(stack):
    rows = [{"date": "2026-06-10", "channel": "Email", "policy": "Conduct", "message": "review", "flagged": True}]
    stack["generator"].search = MemorySearchProvider(rows)
    template = stack["templates"].create("tenant-1", "owner@example.com", template_payload(recipients=[{"email": "owner@example.com", "internal": True}]))
    schedule = ScheduleService(stack["db"], stack["audit"]).upsert("tenant-1", "owner@example.com", template["id"], ScheduleCreate(frequency="daily", timezone="UTC", hour=0, minute=0))
    due = datetime.now(timezone.utc) - timedelta(minutes=1)
    with stack["db"].transaction() as conn: conn.execute("UPDATE report_schedules SET next_run_at=? WHERE id=?", (due.isoformat(), schedule["id"]))
    # Run submission inline to make the integration assertion deterministic.
    stack["worker"].submit = lambda tenant, template_id, report_id, tz: stack["worker"].execute_with_retries(tenant, template_id, report_id, tz)
    assert stack["worker"].tick(datetime.now(timezone.utc)) == 1
    run = stack["db"].query_one("SELECT * FROM report_runs WHERE template_id=?", (template["id"],))
    assert run["status"] == "completed" and run["row_count"] == 1
    artifacts = stack["db"].query_all("SELECT * FROM report_artifacts WHERE report_id=?", (run["id"],))
    assert {a["format"] for a in artifacts} == {"pdf", "csv"}
    assert len(stack["email"].outbox) == 2
    assert "report.generation.completed" in [a["action"] for a in stack["audit"].list("tenant-1")]

