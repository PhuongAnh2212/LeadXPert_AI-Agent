from app.schemas import TemplateCreate


def template_payload(**overrides):
    values = dict(name="Weekly flags", description="Compliance", filters={"channels": ["email"]}, columns=["date", "channel", "policy", "message", "flagged"], sort_order=[{"field": "date", "direction": "desc"}], grouping_dimensions=["channel"], date_range={"type": "previous_week"}, output_formats=["pdf", "csv"], recipients=[], delivery_mode="attachment")
    values.update(overrides)
    return TemplateCreate.model_validate(values)

