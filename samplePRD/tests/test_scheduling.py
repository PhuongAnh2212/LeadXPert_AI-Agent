from datetime import datetime, timezone
from app.schemas import ScheduleCreate
from app.scheduling import next_run
from tests.helpers import template_payload


def test_weekly_schedule_runs_in_tenant_timezone():
    payload = ScheduleCreate(frequency="weekly", timezone="Asia/Ho_Chi_Minh", hour=6, minute=0, weekday=0)
    result = next_run(payload, datetime(2026, 6, 14, 23, tzinfo=timezone.utc))
    assert result.isoformat() == "2026-06-21T23:00:00+00:00"


def test_period_reservation_is_idempotent(stack):
    template = stack["templates"].create("tenant-1", "owner@example.com", template_payload())
    first, created1 = stack["generator"].reserve("tenant-1", template["id"], "2026-W23")
    second, created2 = stack["generator"].reserve("tenant-1", template["id"], "2026-W23")
    assert first == second and created1 is True and created2 is False


def test_retry_delays_and_failure_notification(stack):
    template = stack["templates"].create("tenant-1", "owner@example.com", template_payload())
    report_id, _ = stack["generator"].reserve("tenant-1", template["id"], "period")
    delays = []; stack["worker"].sleeper = delays.append
    def fail(*args): raise RuntimeError("boom")
    stack["generator"].generate = fail
    try: stack["worker"].execute_with_retries("tenant-1", template["id"], report_id, "UTC")
    except RuntimeError: pass
    assert delays == [300, 900]
    assert stack["email"].outbox[-1].to == "owner@example.com"
    actions = [a["action"] for a in stack["audit"].list("tenant-1")]
    assert actions.count("report.retry") == 2

