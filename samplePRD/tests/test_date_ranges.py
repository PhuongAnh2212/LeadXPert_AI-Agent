from datetime import datetime
from zoneinfo import ZoneInfo
import pytest
from app.date_ranges import resolve_date_range
from app.schemas import DateRangeConfig


NOW = datetime(2026, 6, 15, 6, tzinfo=ZoneInfo("UTC"))

@pytest.mark.parametrize(("config", "start", "end"), [
    ({"type": "last_n_days", "n": 7}, "2026-06-08", "2026-06-14"),
    ({"type": "previous_week"}, "2026-06-08", "2026-06-14"),
    ({"type": "previous_month"}, "2026-05-01", "2026-05-31"),
    ({"type": "previous_quarter"}, "2026-01-01", "2026-03-31"),
    ({"type": "rolling_window", "n": 5, "exclude_weekends": True}, "2026-06-08", "2026-06-12"),
])
def test_date_range_resolution(config, start, end):
    result = resolve_date_range(DateRangeConfig.model_validate(config), "UTC", NOW)
    assert (result["start_date"], result["end_date"]) == (start, end)


def test_timezone_is_used_at_runtime():
    now = datetime(2026, 6, 14, 18, tzinfo=ZoneInfo("UTC")) # June 15 in Vietnam
    result = resolve_date_range(DateRangeConfig(type="last_n_days", n=1), "Asia/Ho_Chi_Minh", now)
    assert result["end_date"] == "2026-06-14"
    assert result["start"].endswith("+07:00")

