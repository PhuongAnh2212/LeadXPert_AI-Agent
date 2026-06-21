import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timezone, timedelta

from app.main import app

client = TestClient(app)


def test_create_report_template():
    payload = {
        "name": "Weekly Compliance Report",
        "description": "Weekly flagged messages report",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {
            "date_range": {"type": "previous_calendar_week"},
            "channels": ["WhatsApp", "Teams"],
            "policies": ["Prohibited Language"],
            "business_units": ["Trading"],
        },
        "columns": ["date", "channel", "sender", "policy"],
        "sort_order": "date_desc",
        "group_by": "policy",
    }

    res = client.post("/templates", json=payload)
    assert res.status_code in [200, 201]

    data = res.json()
    assert data["name"] == payload["name"]
    assert data["filters"] == payload["filters"]
    assert "version" in data


def test_load_template_filters():
    payload = {
        "name": "Load Filter Test",
        "description": "Test loading saved filters",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {
            "channels": ["Email"],
            "policies": ["Gift & Entertainment"],
        },
        "columns": ["date", "channel", "policy"],
        "sort_order": "date_desc",
        "group_by": "channel",
    }

    create_res = client.post("/templates", json=payload)
    template_id = create_res.json()["id"]

    res = client.get(f"/templates/{template_id}")
    assert res.status_code == 200
    assert res.json()["filters"] == payload["filters"]


def test_create_weekly_schedule():
    template = client.post("/templates", json={
        "name": "Scheduled Report",
        "description": "Weekly report",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {"date_range": {"type": "previous_calendar_week"}},
        "columns": ["date", "channel"],
        "sort_order": "date_desc",
        "group_by": "channel",
    }).json()

    payload = {
        "template_id": template["id"],
        "tenant_id": "tenant_001",
        "frequency": "weekly",
        "day_of_week": "monday",
        "time": "06:00",
        "timezone": "Asia/Ho_Chi_Minh",
        "active": True,
    }

    res = client.post("/schedules", json=payload)
    assert res.status_code in [200, 201]

    data = res.json()
    assert data["frequency"] == "weekly"
    assert data["timezone"] == "Asia/Ho_Chi_Minh"


def test_parameterized_previous_calendar_week():
    payload = {
        "type": "previous_calendar_week",
        "run_at": "2026-06-15T06:00:00Z",
        "timezone": "Asia/Ho_Chi_Minh",
    }

    res = client.post("/date-ranges/resolve", json=payload)
    assert res.status_code == 200

    data = res.json()
    assert data["start_date"].startswith("2026-06-08")
    assert data["end_date"].startswith("2026-06-14")


def test_generate_pdf_and_csv_report():
    template = client.post("/templates", json={
        "name": "Generation Test",
        "description": "PDF and CSV generation",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {"date_range": {"type": "last_n_days", "days": 7}},
        "columns": ["date", "channel", "sender", "policy"],
        "sort_order": "date_desc",
        "group_by": "policy",
    }).json()

    res = client.post(f"/reports/generate", json={
        "template_id": template["id"],
        "formats": ["pdf", "csv"],
        "triggered_by": "user_001",
    })

    assert res.status_code in [200, 201]

    data = res.json()
    assert "artifact_id" in data
    assert "pdf" in data["formats"]
    assert "csv" in data["formats"]


def test_artifact_metadata_and_hash():
    template = client.post("/templates", json={
        "name": "Artifact Test",
        "description": "Artifact metadata test",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {"date_range": {"type": "last_n_days", "days": 7}},
        "columns": ["date", "channel"],
        "sort_order": "date_desc",
        "group_by": "channel",
    }).json()

    report = client.post("/reports/generate", json={
        "template_id": template["id"],
        "formats": ["csv"],
        "triggered_by": "user_001",
    }).json()

    artifact_id = report["artifact_id"]

    res = client.get(f"/artifacts/{artifact_id}")
    assert res.status_code == 200

    data = res.json()
    assert data["template_id"] == template["id"]
    assert "sha256_hash" in data
    assert "row_count" in data
    assert "generation_timestamp" in data
    assert "retention_until" in data


def test_artifact_is_immutable():
    template = client.post("/templates", json={
        "name": "Immutable Test",
        "description": "Artifact immutability",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {"date_range": {"type": "last_n_days", "days": 7}},
        "columns": ["date"],
        "sort_order": "date_desc",
        "group_by": "channel",
    }).json()

    report = client.post("/reports/generate", json={
        "template_id": template["id"],
        "formats": ["csv"],
        "triggered_by": "user_001",
    }).json()

    artifact_id = report["artifact_id"]

    update_res = client.patch(f"/artifacts/{artifact_id}", json={
        "row_count": 999999
    })

    delete_res = client.delete(f"/artifacts/{artifact_id}")

    assert update_res.status_code in [403, 405]
    assert delete_res.status_code in [403, 405]


def test_email_delivery_with_download_link():
    template = client.post("/templates", json={
        "name": "Email Test",
        "description": "Email delivery",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {"date_range": {"type": "last_n_days", "days": 7}},
        "columns": ["date", "channel"],
        "sort_order": "date_desc",
        "group_by": "channel",
    }).json()

    res = client.post("/reports/generate", json={
        "template_id": template["id"],
        "formats": ["pdf"],
        "triggered_by": "user_001",
        "delivery": {
            "type": "email",
            "recipients": ["compliance@example.com"],
            "method": "download_link",
        },
    })

    assert res.status_code in [200, 201]
    data = res.json()

    assert "delivery_status" in data
    assert "download_link" in data or data["delivery_status"] in ["queued", "sent"]


def test_external_recipient_acknowledgment_logged():
    template = client.post("/templates", json={
        "name": "External Recipient Test",
        "description": "External recipient warning",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {"date_range": {"type": "last_n_days", "days": 7}},
        "columns": ["date"],
        "sort_order": "date_desc",
        "group_by": "channel",
        "external_recipient_acknowledged": True,
    }).json()

    res = client.post("/reports/generate", json={
        "template_id": template["id"],
        "formats": ["pdf"],
        "triggered_by": "user_001",
        "delivery": {
            "type": "email",
            "recipients": ["external@gmail.com"],
            "method": "attachment",
        },
    })

    assert res.status_code in [200, 201]

    audit = client.get("/audit-logs")
    assert audit.status_code == 200

    logs = audit.json()
    assert any(
        "external" in str(log).lower() and "acknowledge" in str(log).lower()
        for log in logs
    )


def test_download_link_requires_authentication():
    template = client.post("/templates", json={
        "name": "Auth Download Test",
        "description": "Download auth",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {"date_range": {"type": "last_n_days", "days": 7}},
        "columns": ["date"],
        "sort_order": "date_desc",
        "group_by": "channel",
    }).json()

    report = client.post("/reports/generate", json={
        "template_id": template["id"],
        "formats": ["csv"],
        "triggered_by": "user_001",
    }).json()

    artifact_id = report["artifact_id"]

    res = client.get(f"/artifacts/{artifact_id}/download")
    assert res.status_code in [401, 403]


def test_audit_log_created_for_report_generation():
    template = client.post("/templates", json={
        "name": "Audit Test",
        "description": "Audit generation",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {"date_range": {"type": "last_n_days", "days": 7}},
        "columns": ["date"],
        "sort_order": "date_desc",
        "group_by": "channel",
    }).json()

    client.post("/reports/generate", json={
        "template_id": template["id"],
        "formats": ["csv"],
        "triggered_by": "user_001",
    })

    res = client.get("/audit-logs")
    assert res.status_code == 200

    logs = res.json()
    assert any(
        "report_generation" in str(log).lower()
        or "generated" in str(log).lower()
        for log in logs
    )


def test_duplicate_schedule_period_is_idempotent():
    template = client.post("/templates", json={
        "name": "Idempotency Test",
        "description": "No duplicate report for same period",
        "owner_id": "user_001",
        "tenant_id": "tenant_001",
        "filters": {"date_range": {"type": "previous_calendar_week"}},
        "columns": ["date"],
        "sort_order": "date_desc",
        "group_by": "channel",
    }).json()

    payload = {
        "template_id": template["id"],
        "formats": ["csv"],
        "triggered_by": "scheduler",
        "period_start": "2026-06-08",
        "period_end": "2026-06-14",
    }

    first = client.post("/reports/generate", json=payload)
    second = client.post("/reports/generate", json=payload)

    assert first.status_code in [200, 201]
    assert second.status_code in [200, 409]

    if second.status_code == 200:
        assert second.json()["artifact_id"] == first.json()["artifact_id"]


def test_p1_preview_is_deferred_or_available():
    res = client.get("/reports/preview")
    assert res.status_code in [200, 404, 405, 501]


def test_p1_sftp_is_deferred_or_available():
    res = client.get("/sftp/endpoints")
    assert res.status_code in [200, 404, 405, 501]


def test_p1_template_sharing_is_deferred_or_available():
    res = client.get("/templates/shared")
    assert res.status_code in [200, 404, 405, 501]