from typing import Any, Literal
from pydantic import BaseModel, Field, model_validator


class DateRangeConfig(BaseModel):
    type: Literal["last_n_days", "previous_week", "previous_month", "previous_quarter", "rolling_window"]
    n: int | None = Field(None, ge=1, le=3660)
    exclude_weekends: bool = False

    @model_validator(mode="after")
    def validate_n(self):
        if self.type in {"last_n_days", "rolling_window"} and self.n is None:
            raise ValueError("n is required for this date range type")
        return self


class Recipient(BaseModel):
    email: str
    internal: bool = True
    external_acknowledged: bool = False

    @model_validator(mode="after")
    def external_requires_ack(self):
        if not self.internal and not self.external_acknowledged:
            raise ValueError("external recipients require sensitive-data acknowledgment")
        return self


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=2000)
    filters: dict[str, Any] = Field(default_factory=dict)
    columns: list[str] = Field(min_length=1)
    sort_order: list[dict[str, Any]] = Field(default_factory=list)
    grouping_dimensions: list[str] = Field(default_factory=list)
    date_range: DateRangeConfig
    output_formats: list[Literal["pdf", "csv"]] = ["pdf", "csv"]
    recipients: list[Recipient] = Field(default_factory=list)
    delivery_mode: Literal["attachment", "link"] = "attachment"


class TemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    filters: dict[str, Any] | None = None
    columns: list[str] | None = None
    sort_order: list[dict[str, Any]] | None = None
    grouping_dimensions: list[str] | None = None
    date_range: DateRangeConfig | None = None
    output_formats: list[Literal["pdf", "csv"]] | None = None
    recipients: list[Recipient] | None = None
    delivery_mode: Literal["attachment", "link"] | None = None


class ScheduleCreate(BaseModel):
    frequency: Literal["daily", "weekly", "monthly", "cron"]
    timezone: str
    hour: int = Field(0, ge=0, le=23)
    minute: int = Field(0, ge=0, le=59)
    weekday: int | None = Field(None, ge=0, le=6)
    day_of_month: int | None = Field(None, ge=1, le=31)
    cron_expression: str | None = None
    enabled: bool = True

    @model_validator(mode="after")
    def required_frequency_fields(self):
        required = {"weekly": (self.weekday, "weekday"), "monthly": (self.day_of_month, "day_of_month"), "cron": (self.cron_expression, "cron_expression")}
        if self.frequency in required and required[self.frequency][0] is None:
            raise ValueError(f"{required[self.frequency][1]} is required")
        return self

