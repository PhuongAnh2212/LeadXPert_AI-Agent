CREATE TABLE report_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  schema_version INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  filters_json TEXT NOT NULL,
  columns_json TEXT NOT NULL,
  sort_json TEXT NOT NULL,
  grouping_json TEXT NOT NULL,
  date_range_json TEXT NOT NULL,
  output_formats_json TEXT NOT NULL,
  delivery_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE report_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  UNIQUE(template_id, version)
);

CREATE TABLE report_schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  frequency TEXT NOT NULL,
  config_json TEXT NOT NULL,
  timezone TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE report_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  schedule_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE report_artifacts (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  format TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  retention_until TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE report_audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  report_id TEXT,
  template_id TEXT,
  parameters_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX report_templates_tenant_owner ON report_templates(tenant_id, owner_id);
CREATE INDEX report_schedules_next_run ON report_schedules(enabled, next_run_at);
CREATE INDEX report_runs_available ON report_runs(status, available_at);
CREATE INDEX report_artifacts_template ON report_artifacts(tenant_id, template_id, created_at);
CREATE INDEX report_audit_tenant_time ON report_audit_log(tenant_id, created_at);
