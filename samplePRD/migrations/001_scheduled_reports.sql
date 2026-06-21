CREATE TABLE IF NOT EXISTS report_templates (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', owner_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, filters_json TEXT NOT NULL,
  columns_json TEXT NOT NULL, sort_json TEXT NOT NULL,
  grouping_json TEXT NOT NULL, date_range_json TEXT NOT NULL,
  output_formats_json TEXT NOT NULL DEFAULT '["pdf","csv"]',
  recipients_json TEXT NOT NULL DEFAULT '[]', delivery_mode TEXT NOT NULL DEFAULT 'attachment',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS report_template_versions (
  template_id TEXT NOT NULL, version INTEGER NOT NULL, snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL, actor_id TEXT NOT NULL,
  PRIMARY KEY(template_id, version),
  FOREIGN KEY(template_id) REFERENCES report_templates(id)
);

CREATE TABLE IF NOT EXISTS report_schedules (
  id TEXT PRIMARY KEY, template_id TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL,
  frequency TEXT NOT NULL, cron_expression TEXT, hour INTEGER NOT NULL DEFAULT 0,
  minute INTEGER NOT NULL DEFAULT 0, weekday INTEGER, day_of_month INTEGER,
  timezone TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT, last_run_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(template_id) REFERENCES report_templates(id)
);

CREATE TABLE IF NOT EXISTS report_runs (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL, schedule_id TEXT, period_key TEXT NOT NULL,
  status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, resolved_parameters_json TEXT,
  row_count INTEGER, started_at TEXT, completed_at TEXT, duration_ms INTEGER,
  error TEXT, created_at TEXT NOT NULL,
  UNIQUE(template_id, period_key),
  FOREIGN KEY(template_id) REFERENCES report_templates(id)
);

CREATE TABLE IF NOT EXISTS report_artifacts (
  id TEXT PRIMARY KEY, report_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
  template_id TEXT NOT NULL, template_version INTEGER NOT NULL, format TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE, resolved_parameters_json TEXT NOT NULL,
  row_count INTEGER NOT NULL, file_size INTEGER NOT NULL, sha256 TEXT NOT NULL,
  generated_at TEXT NOT NULL, duration_ms INTEGER NOT NULL,
  delivery_status_json TEXT NOT NULL, retain_until TEXT NOT NULL,
  FOREIGN KEY(report_id) REFERENCES report_runs(id)
);

CREATE TRIGGER IF NOT EXISTS artifacts_no_update
BEFORE UPDATE ON report_artifacts BEGIN SELECT RAISE(ABORT, 'report artifacts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS artifacts_no_delete
BEFORE DELETE ON report_artifacts BEGIN SELECT RAISE(ABORT, 'report artifacts are immutable'); END;

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
  action TEXT NOT NULL, timestamp TEXT NOT NULL, report_id TEXT,
  template_id TEXT, parameters_json TEXT NOT NULL, status TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update
BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is immutable'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete
BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is immutable'); END;

CREATE INDEX IF NOT EXISTS idx_schedules_due ON report_schedules(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_runs_tenant_status ON report_runs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_artifacts_template ON report_artifacts(template_id, generated_at);
CREATE INDEX IF NOT EXISTS idx_audit_template ON audit_log(template_id, timestamp);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
  type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  report_id TEXT, read_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(tenant_id, user_id, created_at);
