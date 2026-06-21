from app.schemas import TemplateUpdate
from tests.helpers import template_payload


def test_template_saves_full_configuration_and_versions(stack):
    service = stack["templates"]
    created = service.create("tenant-1", "owner@example.com", template_payload())
    assert created["filters"] == {"channels": ["email"]}
    assert created["columns"][0] == "date"
    assert created["sort_order"][0]["direction"] == "desc"
    assert created["grouping_dimensions"] == ["channel"]
    assert created["date_range"]["type"] == "previous_week"
    updated = service.update("tenant-1", "owner@example.com", created["id"], TemplateUpdate(description="Changed"))
    assert updated["version"] == 2
    versions = stack["db"].query_all("SELECT version FROM report_template_versions WHERE template_id=? ORDER BY version", (created["id"],))
    assert [v["version"] for v in versions] == [1, 2]


def test_external_recipient_acknowledgment_is_audited(stack):
    payload = template_payload(recipients=[{"email": "regulator@outside.test", "internal": False, "external_acknowledged": True}])
    created = stack["templates"].create("tenant-1", "owner@example.com", payload)
    actions = [a["action"] for a in stack["audit"].list("tenant-1")]
    assert "external_recipient.acknowledged" in actions

