# Scheduled Compliance Reports — MVP

Greenfield P0 implementation of PRD-2026-031. It provides versioned report templates, timezone-aware schedules, parameterized periods, isolated generation workers, PDF/CSV output, authenticated email delivery, AES-256-GCM encrypted immutable artifacts, and append-only audits.

## Run locally

Python 3.11+ is required.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[test]'
uvicorn app.main:app --reload
```

Open `http://localhost:8000`. The demo UI sends development identity headers for tenant `demo-tenant`. API clients must send `X-Tenant-Id`, `X-User-Id`, and a `X-User-Role` of `compliance` or `admin`.

Run tests:

```bash
python3 -m pytest -q
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `REPORT_DATABASE_PATH` | `data/reports.db` | SQLite database path |
| `REPORT_ARTIFACT_PATH` | `data/artifacts` | encrypted artifact root |
| `REPORT_ENCRYPTION_KEY` | development key | URL-safe base64 encoding of exactly 32 random bytes |
| `REPORT_SIGNING_KEY` | development key | HMAC key for seven-day download links |
| `REPORT_BASE_URL` | `http://localhost:8000` | absolute links used in email/PDF |
| `REPORT_WORKER_COUNT` | `8` | dedicated report worker pool size |
| `REPORT_MAX_TENANT_JOBS` | `5` | concurrent generation cap per tenant |
| `REPORT_SCHEDULER_POLL_SECONDS` | `30` | due-schedule polling interval |

Generate a production encryption key with `python3 -c "import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"`. Production deployment must set both keys through its secrets manager; the deterministic defaults are local-development conveniences only.

## Architecture and integration seams

- `SearchProvider` is the boundary for the existing Search API. The bundled default returns no rows; production should implement paginated/streaming reads from the isolated search/read-replica endpoint.
- `EmailService` is an outbox adapter. Replace `send()` with the platform email provider. It automatically converts attachments over 25 MB to authenticated links.
- `EncryptedArtifactStore` encrypts each object with AES-256-GCM and create-only filesystem semantics. Production should replace it with an object-lock/WORM bucket adapter; database triggers separately prevent artifact mutation or deletion.
- `ReportWorker` owns a dedicated pool and per-tenant semaphore. The SQLite scheduler is appropriate for a single-node MVP. For 1,000+ schedules/hour across multiple nodes, preserve the unique period reservation and route jobs through the platform queue.
- `AuditService` writes an append-only table guarded by database triggers. External-recipient acknowledgment, generation, retry, terminal failure, notification, delivery, and download are recorded.

The migration is [migrations/001_scheduled_reports.sql](migrations/001_scheduled_reports.sql). It is idempotent and runs at startup.

## API summary

- `POST/GET /api/report-templates`
- `GET/PATCH/DELETE /api/report-templates/{id}`
- `PUT /api/report-templates/{id}/schedule`
- `POST /api/report-templates/{id}/run?timezone_name=...`
- `GET /api/reports/{id}`
- `GET /api/artifacts/{id}/download?token=...` (identity headers and valid token required)
- `GET /api/audit`, `GET /api/notifications`

PDF detail is capped at 10,000 rows and points to its full companion CSV. CSV is UTF-8 BOM/RFC 4180 and contains only selected columns. Resolved timezone-aware start/end values are persisted with every run and artifact. Default artifact retention is seven years.

## P1 intentionally deferred

Report History UI, preview mode, role-based template sharing, and SFTP delivery are not part of this MVP. The artifact/query, template-version, and adapter boundaries are ready for those additions without changing stored report identity.
