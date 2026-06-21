# Scheduled Compliance Reports — User Guide

> Generated from sample-prd-scheduled-compliance-reports.md. The PRD is sample input; this guide is an Agent A artifact.

## Overview

Scheduled Compliance Reports lets compliance teams save reusable report configurations, run them automatically, deliver results, and retain immutable artifacts. The initial release supports PDF and CSV output.

Source: [[FR-01]], [[FR-02]], [[FR-03]], [[FR-04]], [[FR-05]], [[FR-06]]

## Who this feature is for

This feature is primarily for Compliance Officers. IT Admins configure SFTP endpoints, while permitted colleagues can view shared templates and artifacts.

Source: [[FR-07]], [[FR-11]]

## How to create a report template

1. Configure filters and columns in Search.
2. Select **Save as Report Template**.
3. Enter a name and optional description.
4. Save, then verify the template appears in Report Templates with its filters preserved.

Source: [[FR-01]], [[AC-01]], [[AC-02]]

## How to schedule reports

1. Open a saved report template.
2. Add a daily, weekly, monthly, or custom cron schedule.
3. Confirm the tenant timezone and activate it.
4. If generation fails, the system retries twice (after 5 and 15 minutes). After the final failure, the owner receives email and in-app notifications with a manual retry link.

Source: [[FR-02]], [[AC-03]], [[AC-04]], [[NFR-14]]

### Incorporated team guidance

- Call out the 5-minute and 15-minute retry delays. ([[FB-001]])
- Call out the 5-minute and 15-minute retry delays. ([[FB-002]])
- Call out the 5-minute and 15-minute retry delays. ([[FB-003]])
- Call out the 5-minute and 15-minute retry delays. ([[FB-004]])

## How to configure email delivery

Add one or more internal or external email addresses and choose an attachment or secure link. External recipients require a sensitive-data acknowledgment. Links expire after 7 days. Files over 25 MB automatically use a link.

Source: [[FR-03]], [[AC-05]], [[AC-06]]

## How to download generated reports

Open **Reports > History**, find a run, and select **Download**. Access depends on permissions. PDF reports may contain up to 10,000 detailed rows; use the companion CSV for the full dataset.

Source: [[FR-04]], [[FR-08]], [[AC-07]], [[AC-10]]

## Report retention and audit trail

Every generated report is an immutable, append-only artifact. Metadata includes parameters, timestamps, row count, hash, and delivery status. The default retention period is **7 years**, separate from message retention. Generation, download, and delivery actions are audited.

Source: [[FR-04]], [[AC-07]], [[AC-08]], [[NFR-10]], [[NFR-11]]

## FAQ

### What formats are supported?
PDF and CSV. PDF provides formatted summaries and tables; CSV contains all matching rows.

Source: [[FR-05]], [[FR-06]]

### What happens if generation fails?
The system retries twice with exponential backoff, then notifies the template owner by email and in-app notification.

Source: [[AC-04]], [[NFR-14]]

### What are the P0 requirements?
The P0 requirements are: FR-01: Save search filters as a reusable report template with a name, description, and owner; FR-02: Schedule a report template to run on a recurring basis (daily, weekly, monthly, or custom cron expression); FR-03: Deliver generated reports via email (as attachment or inline link) to one or more recipients; FR-04: Store every generated report as an immutable artifact with metadata (parameters, generation time, row count, hash) accessible from the platform; FR-05: Generate reports in PDF format with configurable sections: executive summary, detailed data table, grouped statistics by channel/policy/business unit; FR-06: Generate reports in CSV format for downstream processing; FR-10: Support parameterized date ranges (e.g., "last 7 days", "previous calendar month") that resolve dynamically at generation time.

Source: [[3-proposed-solution-expected-behavior#Requirements by Priority]]

## Known limitations / out-of-scope items

- Real-time streaming reports — This feature covers scheduled, batch-generated reports only. Real-time dashboards are a separate initiative.
- Report designer / drag-and-drop layout builder — PDF layout is template-driven with configurable sections, not a freeform designer.
- Cross-tenant reporting — Reports are scoped to a single tenant. Multi-tenant aggregate reporting (e.g., for holding companies) is a future initiative.
- Message content redaction in reports — Reports include full message content as captured. PII redaction is a separate compliance feature under evaluation.
- Mobile report viewer — Reports are delivered as PDF/CSV. A dedicated mobile viewing experience is not in scope.
- SFTP, report history, preview, and template sharing are P1 rather than launch-blocking P0 capabilities.

Source: [[7-out-of-scope]], [[3-proposed-solution-expected-behavior#Requirements by Priority]]


## Feedback backlinks

[[FB-001]], [[FB-002]], [[FB-003]], [[FB-004]]
