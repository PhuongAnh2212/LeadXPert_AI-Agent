from __future__ import annotations
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from .schemas import DateRangeConfig


def resolve_date_range(config: DateRangeConfig, tenant_timezone: str, now: datetime | None = None) -> dict[str, str]:
    try:
        tz = ZoneInfo(tenant_timezone)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"unknown timezone: {tenant_timezone}") from exc
    current = (now or datetime.now(timezone.utc)).astimezone(tz)
    # Reports cover completed local days only, so the upper bound is today's midnight.
    end_day = current.date() - timedelta(days=1)
    if config.type == "last_n_days":
        start_day = end_day - timedelta(days=config.n - 1)
    elif config.type == "previous_week":
        start_day = current.date() - timedelta(days=current.weekday() + 7)
        end_day = start_day + timedelta(days=6)
    elif config.type == "previous_month":
        this_month = current.date().replace(day=1)
        end_day = this_month - timedelta(days=1)
        start_day = end_day.replace(day=1)
    elif config.type == "previous_quarter":
        current_q_start_month = ((current.month - 1) // 3) * 3 + 1
        current_q_start = date(current.year, current_q_start_month, 1)
        end_day = current_q_start - timedelta(days=1)
        start_month = ((end_day.month - 1) // 3) * 3 + 1
        start_day = date(end_day.year, start_month, 1)
    else:
        if config.exclude_weekends:
            days: list[date] = []
            cursor = end_day
            while len(days) < config.n:
                if cursor.weekday() < 5:
                    days.append(cursor)
                cursor -= timedelta(days=1)
            start_day = min(days)
            end_day = max(days)
        else:
            start_day = end_day - timedelta(days=config.n - 1)
    start = datetime.combine(start_day, time.min, tzinfo=tz)
    end_exclusive = datetime.combine(end_day + timedelta(days=1), time.min, tzinfo=tz)
    return {
        "expression": config.type,
        "timezone": tenant_timezone,
        "start": start.isoformat(),
        "end": end_exclusive.isoformat(),
        "start_date": start_day.isoformat(),
        "end_date": end_day.isoformat(),
        "exclude_weekends": config.exclude_weekends,
    }
