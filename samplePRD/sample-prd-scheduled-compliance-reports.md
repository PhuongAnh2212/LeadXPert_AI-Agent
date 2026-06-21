# Product Requirement Document: Scheduled Compliance Reports

---

| Field | Value |
|---|---|
| **Document ID** | PRD-2026-031 |
| **Feature Name** | Scheduled Compliance Reports |
| **Status** | Approved |
| **Version** | 1.2 |
| **Author(s)** | J. Chen, Product Manager — Compliance & Reporting |
| **Created** | 2026-04-10 |
| **Last Updated** | 2026-05-22 |
| **Related Jira** | PRM-312 |

---

## 1. Background & Problem Statement

### Business Context

Enterprise customers in regulated industries are required to demonstrate ongoing supervision of employee communications across messaging channels. Today, compliance teams manually pull data from the platform's search interface, format it into spreadsheets, and email the results to internal stakeholders on a recurring basis — weekly, monthly, or quarterly depending on the regulation and the firm's internal policies.

As our customer base grows beyond 200 enterprise accounts, the manual nature of this workflow is becoming a barrier to platform stickiness and a frequent source of support tickets. Three of our top-10 accounts by ARR have flagged this as a renewal risk in QBRs. Competitors (Smarsh, Global Relay) already offer scheduled reporting, making this a table-stakes expectation for enterprise buyers evaluating our platform.

### Customer Need / Problem

Compliance Officers and their teams spend 6–10 hours per week manually assembling reports from the platform's search and export tools. The process is error-prone: filters are applied inconsistently, date ranges overlap or gap between runs, and formatting varies by analyst.

> "Every Monday morning, my team of three spends the first two hours pulling last week's supervision data. We export CSVs, pivot in Excel, and paste into a Word template. If someone is out sick, the report is late — and our regulators don't accept 'someone was out' as an excuse."
> — VP of Compliance, mid-tier investment bank (150 users)

> "I need a weekly summary of all flagged messages by channel, by policy, and by business unit. I need it in my inbox at 7 AM Monday. I don't care how it gets there — I just need it to be consistent and complete."
> — Chief Compliance Officer, wealth management firm (400 users)

The core problems are:

1. **Time cost**: Manual report assembly takes 6–10 hours per compliance team per week.
2. **Inconsistency**: Different analysts apply different filters, producing reports that don't match period-over-period.
3. **Coverage gaps**: Manual date-range selection leads to overlapping or missing data between report runs.
4. **No audit trail**: There is no record of what was generated, when, or with what parameters — a gap that auditors flag during examinations.
5. **Delivery friction**: Reports are emailed as attachments with no version control, no delivery confirmation, and no centralized access for stakeholders who join later.

---

## 2. Current State & Limitations

Today, the platform provides:

- **Search & Filter UI**: Users can search captured messages by date range, channel, sender/recipient, keyword, and policy violation type. Results can be viewed in a paginated list.
- **Manual Export**: Users can export search results as CSV or PDF. Exports are limited to 50,000 rows per file. Larger datasets require multiple exports with adjusted filters.
- **Supervision Dashboard**: A real-time dashboard showing flagged messages, review queue depth, and policy hit rates. This dashboard is not exportable and not schedulable.

**Known limitations of the current workflow:**

- No way to save a filter configuration for reuse. Users must re-enter filters every time.
- No scheduling mechanism — all exports are manually triggered.
- CSV exports include raw data only; no summary statistics, no charts, no grouping.
- PDF exports are a flat dump of messages — not formatted as a report with sections, headers, or executive summary.
- No delivery mechanism — exports download to the user's browser. There is no email delivery or SFTP push.
- No audit log entry for exports. The platform logs search queries but not the export action or the parameters used.

---

## 3. Proposed Solution & Expected Behavior

### High-Level Approach

Introduce a **Report Builder** that allows Compliance Officers to define report templates with saved filter configurations, schedule them to run automatically on a recurring basis, and deliver the output to one or more recipients via email or SFTP. Each report run produces an immutable artifact stored in the platform with a full audit trail.

The system consists of three layers:

1. **Report Template** — a saved configuration defining what data to include (filters, grouping, columns, summary metrics) and how to format it (layout, sections, branding).
2. **Schedule** — a recurring trigger (daily, weekly, monthly, custom cron) attached to a report template.
3. **Delivery** — one or more delivery targets (email recipients, SFTP endpoint, platform inbox) where the generated report is sent.

### Functional Requirements Summary

| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-01 | Save search filters as a reusable report template with a name, description, and owner | P0 | AC-01, AC-02 |
| FR-02 | Schedule a report template to run on a recurring basis (daily, weekly, monthly, or custom cron expression) | P0 | AC-03, AC-04 |
| FR-03 | Deliver generated reports via email (as attachment or inline link) to one or more recipients | P0 | AC-05, AC-06 |
| FR-04 | Store every generated report as an immutable artifact with metadata (parameters, generation time, row count, hash) accessible from the platform | P0 | AC-07, AC-08 |
| FR-05 | Generate reports in PDF format with configurable sections: executive summary, detailed data table, grouped statistics by channel/policy/business unit | P0 | AC-09, AC-10 |
| FR-06 | Generate reports in CSV format for downstream processing | P0 | AC-11 |
| FR-07 | Allow IT Admins to configure SFTP delivery endpoints with credential management | P1 | AC-12, AC-13 |
| FR-08 | Provide a report history view showing all past runs with status, recipient list, and download link | P1 | AC-14 |
| FR-09 | Allow Compliance Officers to preview a report template with live data before scheduling | P1 | AC-15 |
| FR-10 | Support parameterized date ranges (e.g., "last 7 days", "previous calendar month") that resolve dynamically at generation time | P0 | AC-16 |
| FR-11 | Allow report templates to be shared across users within the same tenant with role-based permissions (view, edit, manage) | P1 | AC-17 |
| FR-12 | Natural language search across generated report content | P2 | — (deferred) |
| FR-13 | Anomaly detection that highlights unusual patterns in scheduled reports | P2 | — (deferred) |

### Key Acceptance Criteria

| ID | FR | Scenario | Expected Outcome |
|----|----|----------|------------------|
| AC-01 | FR-01 | Given a Compliance Officer has applied search filters in the Search UI, when they click "Save as Report Template," then a modal appears to name the template and the filter configuration is persisted | Template appears in the user's Report Templates list with all filters preserved |
| AC-02 | FR-01 | Given a saved report template, when the user opens it and clicks "Load Filters," then the Search UI populates with the saved filter configuration | All filter fields match the saved configuration exactly |
| AC-03 | FR-02 | Given a report template exists, when the user attaches a weekly schedule (e.g., every Monday at 06:00 UTC), then the system generates and delivers the report at the specified time | Report generated within 15 minutes of scheduled time; delivery completed within 30 minutes |
| AC-04 | FR-02 | Given a scheduled report fails during generation (e.g., timeout, data error), then the system retries twice with exponential backoff and notifies the template owner via email and in-app notification if all retries fail | Failure notification includes error type, timestamp, and a link to retry manually |
| AC-05 | FR-03 | Given a report is generated with email delivery configured, when the report is ready, then each recipient receives an email with the report attached (PDF or CSV) or a secure download link (configurable per template) | Email delivered within 5 minutes of report completion; download link expires after 7 days |
| AC-06 | FR-03 | Given a recipient is not a registered platform user, when the template owner adds them as an email recipient, then the system requires the owner to acknowledge that the report contains potentially sensitive compliance data | Acknowledgment recorded in the audit log; external recipient flagged in the report history |
| AC-07 | FR-04 | Given a report has been generated, when any user with appropriate permissions views the Report History, then they can see the report metadata (generation time, parameters used, row count, file hash, delivery status) and download the artifact | Artifact is immutable — cannot be edited or deleted by any user, including admins |
| AC-08 | FR-04 | Given a report artifact is stored, when the data retention period for the tenant expires, then the artifact is retained separately under the report retention policy (default: 7 years) | Report artifacts follow their own retention schedule, independent of message retention |
| AC-09 | FR-05 | Given a report template includes "executive summary" and "grouped statistics" sections, when the report generates in PDF format, then the PDF contains: a cover page with report name/date range/generation timestamp, an executive summary with key metrics (total messages, flagged count, top policies triggered), and a grouped breakdown by the selected dimension (channel, policy, or business unit) | PDF is well-formatted with headers, page numbers, and the tenant's logo if configured |
| AC-10 | FR-05 | Given a report template is configured with "detailed data table" section, when the report generates and the result exceeds 10,000 rows, then the PDF includes the first 10,000 rows with a note indicating truncation and a link to download the full dataset as CSV | Truncation message is clear: "Showing 10,000 of 47,832 rows. Download full dataset (CSV)." |
| AC-11 | FR-06 | Given a report template is configured for CSV output, when the report generates, then the CSV includes all matching rows (no truncation), with column headers matching the platform's export schema, UTF-8 encoding, and proper escaping of special characters | CSV opens correctly in Excel, Google Sheets, and common data tools without encoding issues |
| AC-12 | FR-07 | Given an IT Admin navigates to Settings > Integrations > SFTP, when they configure a new SFTP endpoint with host, port, path, and credentials, then the system validates the connection and stores credentials encrypted | Connection test result shown immediately; credentials stored using AES-256 encryption |
| AC-13 | FR-07 | Given an SFTP endpoint is configured and a report is scheduled for SFTP delivery, when the report generates, then the file is uploaded to the configured path with the naming convention `{report_name}_{YYYY-MM-DD}.{format}` | Upload confirmation logged; failure triggers retry + notification to IT Admin |
| AC-14 | FR-08 | Given a user navigates to Reports > History, when they view the list, then they see all report runs for templates they have access to, sorted by most recent, with columns: Report Name, Run Date, Status (Success/Failed/Pending), Row Count, Recipients, Actions (Download/View Details) | Pagination for tenants with >100 report runs; filterable by template, status, and date range |
| AC-15 | FR-09 | Given a user is editing a report template, when they click "Preview," then the system runs the template against live data for the most recent applicable period and displays a sample of the first 100 rows plus the summary statistics | Preview clearly labeled as "Preview — not a scheduled run" and not stored as a report artifact |
| AC-16 | FR-10 | Given a report template uses the parameterized date range "previous calendar week" (Monday–Sunday), when the report runs on Monday June 15 at 06:00 UTC, then the data range resolves to June 8–14, inclusive, in the tenant's configured timezone | Date range shown in the report header matches the resolved range, not the parameterized expression |
| AC-17 | FR-11 | Given a Compliance Officer shares a report template with a colleague as "view only," when the colleague opens the template, then they can view the configuration and schedule but cannot edit filters, change the schedule, or modify recipients | Permission model: Owner (full control), Editor (modify template/schedule), Viewer (view and download reports only) |

### Requirements by Priority

#### Must-Have (P0)

**FR-01: Report Template Creation**

Users can save the current search filter configuration as a named, reusable report template. Templates store: filter parameters (date range type, channels, policies, business units, keywords, sender/recipient), column selection, sort order, and grouping dimensions.

- Given a Compliance Officer has configured filters and selected columns in the Search UI, when they click "Save as Report Template," then a modal prompts for template name and optional description, and the full configuration is persisted.
- Technical constraint: Template schema must be versioned. If the platform adds new filter fields in future releases, existing templates must remain functional (missing fields default to "all").
- Dependency: Search API must expose a serializable filter configuration object (coordination with Platform team).

**FR-02: Recurring Schedule**

Users can attach a schedule to any report template. Supported frequencies: daily, weekly (select day), monthly (select date or "last business day"), and custom cron expression for advanced users. Schedules execute in the tenant's configured timezone.

- Given a template with a weekly Monday 06:00 schedule, when the system clock reaches 06:00 in the tenant's timezone, then the report generation job is enqueued.
- Given a scheduled job fails, when the retry limit (2 retries, exponential backoff: 5 min, 15 min) is exhausted, then the template owner is notified via email and in-app notification with error details.
- Technical constraint: Schedule execution must be idempotent — if the scheduler fires twice for the same period (e.g., due to a deployment), only one report is generated.
- Dependency: Requires a job scheduler service. Evaluate existing infrastructure (e.g., existing task queue) vs. new service.

**FR-03: Email Delivery**

Generated reports are delivered to one or more email addresses. Recipients can be internal platform users or external email addresses. Delivery options per template: attach file directly or send a secure download link (link expires after 7 days, requires platform authentication to access).

- Given a report is generated, when email delivery is triggered, then each recipient receives the report within 5 minutes.
- Given an external recipient (non-platform user) is added, when the template owner saves the configuration, then a confirmation dialog warns that the report may contain sensitive compliance data and records the acknowledgment in the audit log.
- Technical constraint: Email attachments limited to 25 MB. Reports exceeding this size must use the download link method. The system should auto-switch and notify the recipient.

**FR-04: Immutable Report Artifacts**

Every generated report is stored as an immutable artifact in the platform. Metadata includes: template ID, template version at generation time, resolved parameters (actual date range, filters applied), row count, file size, SHA-256 hash of the output file, generation timestamp, generation duration, delivery status per recipient.

- Artifacts cannot be edited or deleted by any user, including tenant admins.
- Artifacts follow a dedicated retention policy (default: 7 years), independent of the message data retention policy.
- Technical constraint: Artifact storage must be append-only (WORM-compliant) and support retrieval by report ID or template ID with date range filtering.

**FR-05: PDF Report Generation**

The PDF report includes configurable sections:

- **Cover page**: Report name, date range, generation timestamp, tenant name, optional tenant logo.
- **Executive summary**: Total messages in scope, total flagged, top 5 policies triggered (with counts), channel breakdown (pie chart or table).
- **Grouped statistics**: Data grouped by the selected dimension (channel, policy, or business unit) with subtotals.
- **Detailed data table**: Message-level rows with columns selected in the template. Truncated at 10,000 rows for PDF; full dataset available as companion CSV download.
- **Footer**: Page numbers, "Generated by [Platform Name]" watermark, confidentiality notice.

- Technical constraint: PDF generation must complete within 5 minutes for reports up to 50,000 rows. For larger datasets, the data table section is truncated with a download link.

**FR-06: CSV Report Generation**

CSV output includes all matching rows without truncation. Columns match the template's column selection. File uses UTF-8 encoding with BOM for Excel compatibility. Special characters (commas, quotes, newlines in message content) are properly escaped per RFC 4180.

**FR-10: Parameterized Date Ranges**

Report templates support relative date expressions that resolve dynamically at generation time:

- "Last N days" (e.g., last 7 days, last 30 days)
- "Previous calendar week" (Monday–Sunday)
- "Previous calendar month"
- "Previous calendar quarter"
- "Custom rolling window" (e.g., last 14 days excluding weekends)

Date ranges resolve in the tenant's configured timezone. The resolved range is recorded in the report metadata and displayed in the report header.

#### Nice-to-Have (P1)

**FR-07: SFTP Delivery**

IT Admins can configure SFTP endpoints in Settings > Integrations. Each endpoint stores: host, port, directory path, authentication method (password or SSH key), and a test-connection function. Report templates can select an SFTP endpoint as a delivery target in addition to or instead of email.

**FR-08: Report History View**

A dedicated Reports > History page showing all past report runs the user has access to. Columns: Report Name, Run Date, Status, Row Count, Recipients, Actions. Filterable by template, status, and date range. Paginated for tenants with large volumes.

**FR-09: Report Preview**

Before scheduling, users can preview the report output using live data for the most recent applicable period. Preview shows the first 100 data rows and the full summary statistics. Previews are clearly labeled and not stored as report artifacts.

**FR-11: Template Sharing & Permissions**

Report templates can be shared with other users in the same tenant. Permission levels: Owner (full control, can delete), Editor (can modify template and schedule), Viewer (can view configuration and download generated reports). Sharing actions are logged in the audit trail.

#### Future Considerations (P2)

**FR-12: Natural Language Search Across Reports**

Allow users to search across generated report content using natural language queries (e.g., "Show me all reports from Q1 that flagged WhatsApp messages about client orders"). Rationale for deferring: Requires a semantic search index over report content. Design the artifact storage schema to support full-text indexing in a future phase.

**FR-13: Anomaly Detection in Reports**

Automatically highlight unusual patterns in scheduled reports compared to historical baselines (e.g., "Flagged messages increased 340% this week compared to the 4-week average"). Rationale for deferring: Requires 3+ months of historical report data to establish baselines. Ensure the artifact metadata schema captures enough statistical dimensions (counts, distributions) to support future analysis.

#### Scope Management Checklist

- [x] Every P0 is truly ship-blocking — report templates, scheduling, email delivery, immutable storage, PDF/CSV output, and parameterized dates are all required for a minimally useful product.
- [x] No P1 has quietly become a P0 — SFTP delivery, report history, preview, and sharing are valuable but the core use case works without them (users can receive reports by email and view artifacts in the platform).
- [x] P2s have been reviewed for architectural implications — artifact schema includes fields to support future full-text indexing (FR-12) and statistical metadata for anomaly detection (FR-13).
- [x] Scope additions balanced — PDF chart generation (executive summary pie chart) was originally P1 but promoted to P0 based on customer feedback; in exchange, SFTP delivery was moved from P0 to P1.

---

## 4. Goals & Success Metrics

### Objectives

| Type | Goal |
|------|------|
| **Business Goal** | Reduce churn risk among top-tier enterprise accounts by eliminating the #2 cited renewal concern (manual reporting). Target: zero QBR escalations about reporting in the next two renewal cycles. |
| **User Goal** | Enable a Compliance Officer to configure a recurring report once and receive it automatically — replacing 6–10 hours/week of manual work with zero ongoing effort. |
| **Strategic Goal** | Achieve feature parity with Smarsh and Global Relay on scheduled reporting, removing it as a competitive objection in enterprise evaluations. |

### Key Results & Metrics

#### Leading Indicators

| Field | Value |
|-------|-------|
| **Metric** | Report template creation rate |
| **Baseline** | 0 (new feature) |
| **Success target** | 50% of tenants with Compliance Officer users create at least one report template within 30 days of GA |
| **Stretch target** | 70% within 30 days |
| **Measurement** | `report_template_created` event in analytics, grouped by tenant |
| **Evaluation** | 30 days post-GA |

| Field | Value |
|-------|-------|
| **Metric** | Schedule activation rate |
| **Baseline** | 0 (new feature) |
| **Success target** | 80% of created templates have an active schedule attached within 7 days of template creation |
| **Stretch target** | 90% within 7 days |
| **Measurement** | `report_schedule_activated` event, correlated with `report_template_created` |
| **Evaluation** | 30 days post-GA |

| Field | Value |
|-------|-------|
| **Metric** | Report generation success rate |
| **Baseline** | N/A |
| **Success target** | 99.5% of scheduled report runs complete successfully (no failures after retries) |
| **Stretch target** | 99.9% |
| **Measurement** | `report_generation_completed` vs `report_generation_failed` events |
| **Evaluation** | Ongoing, reviewed weekly |

#### Lagging Indicators

| Field | Value |
|-------|-------|
| **Metric** | Support ticket reduction for reporting-related requests |
| **Baseline** | ~45 tickets/month tagged "reporting" or "export" |
| **Target** | 60% reduction (to <18 tickets/month) within 90 days of GA |
| **Measurement** | Support ticket tags in Freshdesk, filtered to "reporting" and "export" categories |
| **Evaluation** | 90 days post-GA |

| Field | Value |
|-------|-------|
| **Metric** | Enterprise renewal rate for accounts that cited reporting as a concern |
| **Baseline** | 3 of top-10 accounts flagged reporting in QBRs |
| **Target** | Zero reporting-related churn or downgrade in the next renewal cycle |
| **Measurement** | QBR notes and renewal outcome in CRM |
| **Evaluation** | Next renewal cycle (6–12 months) |

---

## 5. Non-Functional Requirements (NFRs)

### Performance & Load

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-01 | Performance | Report generation time for datasets up to 50,000 rows | < 5 minutes |
| NFR-02 | Performance | Report generation time for datasets up to 500,000 rows (CSV only) | < 15 minutes |
| NFR-03 | Performance | Email delivery latency after report generation completes | < 5 minutes |
| NFR-04 | Scalability | Concurrent report generation jobs per tenant | Up to 5 simultaneous |
| NFR-05 | Scalability | Total scheduled reports across all tenants per hour (peak) | 1,000+ |

### Security & Compliance

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-06 | Security | Report artifacts encrypted at rest | AES-256 |
| NFR-07 | Security | Report download links require platform authentication | SSO / MFA enforced |
| NFR-08 | Security | SFTP credentials stored encrypted, never logged in plaintext | AES-256; credentials masked in all logs |
| NFR-09 | Compliance | Report artifact storage is WORM-compliant (immutable, append-only) | Cannot be modified or deleted by any user |
| NFR-10 | Compliance | Every report generation, download, and delivery action is logged in the immutable audit trail | Audit entry includes: actor, action, timestamp, report ID, parameters |
| NFR-11 | Compliance | Report artifact retention | Default 7 years; configurable per tenant by Admin |
| NFR-12 | Data Privacy | Reports containing PII are marked and access-controlled by role | Only users with "Compliance" or "Admin" role can access report artifacts |

### Stability & Reliability

| ID | Category | Requirement | Target |
|----|----------|-------------|--------|
| NFR-13 | Availability | Report scheduling service uptime | 99.95% |
| NFR-14 | Reliability | Failed report jobs retry with exponential backoff | 2 retries: 5 min, 15 min |
| NFR-15 | Reliability | No duplicate reports generated for the same schedule period | Idempotency enforced via generation lock |
| NFR-16 | Reliability | Report generation does not degrade Search UI performance for other users | Dedicated worker pool; query priority isolation |

---

## 6. Release & Go-to-Market Plan

### Phasing

| Phase | Timeline | Scope |
|-------|----------|-------|
| Phase 1 — Internal Alpha | Weeks 1–4 | Report template creation, PDF/CSV generation, manual trigger only. Internal dogfooding with CS team. |
| Phase 2 — Closed Beta | Weeks 5–8 | Add scheduling engine, email delivery, parameterized date ranges. Beta with 5 selected enterprise accounts. |
| Phase 3 — GA | Weeks 9–12 | Full P0 scope. SFTP delivery (P1) included if ready. Report history view. GA release to all enterprise-tier tenants. |
| Phase 4 — Fast Follow | Weeks 13–16 | Template sharing, report preview, remaining P1 items. |

### Communication Plan

- **Internal**: Engineering kickoff deck, weekly demo at product standup, CS enablement session 2 weeks before GA.
- **Customer**: Beta invite email to selected accounts, in-app announcement banner at GA, updated help center documentation, webinar for enterprise accounts.
- **Sales**: Updated feature comparison matrix, competitive battle card update (Smarsh, Global Relay), demo script for scheduled reports workflow.

---

## 7. Out of Scope

- **Real-time streaming reports** — This feature covers scheduled, batch-generated reports only. Real-time dashboards are a separate initiative.
- **Report designer / drag-and-drop layout builder** — PDF layout is template-driven with configurable sections, not a freeform designer.
- **Cross-tenant reporting** — Reports are scoped to a single tenant. Multi-tenant aggregate reporting (e.g., for holding companies) is a future initiative.
- **Message content redaction in reports** — Reports include full message content as captured. PII redaction is a separate compliance feature under evaluation.
- **Mobile report viewer** — Reports are delivered as PDF/CSV. A dedicated mobile viewing experience is not in scope.

---

## 8. Assumptions & Dependencies

### Assumptions

| # | Assumption |
|---|------------|
| A1 | The existing Search API can handle the query load from scheduled report generation without degrading real-time search performance. If load testing reveals contention, a read replica or dedicated query endpoint may be needed. |
| A2 | Enterprise customers will configure schedules primarily through the web UI. API-based schedule management is a future consideration. |
| A3 | Email delivery infrastructure (SendGrid or equivalent) is already provisioned and can handle the incremental volume from report delivery. |
| A4 | Tenants have fewer than 50 active report templates on average. The UI and backend are designed for this scale; if power users create significantly more, pagination and performance may need revisiting. |

### Dependencies

| # | Dependency | Owner | Status |
|---|------------|-------|--------|
| D1 | Search API must expose a serializable filter configuration endpoint | Platform Team | In discussion — target Week 2 |
| D2 | WORM-compliant artifact storage bucket provisioned | Infrastructure Team | Approved — provisioning in progress |
| D3 | Email delivery service capacity review for scheduled burst traffic (up to 1,000 emails/hour at peak) | Infrastructure Team | Pending review |
| D4 | SFTP credential encryption key management via existing secrets vault | Security Team | Approved |

---

## 9. Open Questions

| # | Owner (Function) | Question | Status |
|---|------------------|----------|--------|
| 1 | Legal | Do report artifacts fall under the same data retention regulations as the underlying message data, or can they follow a separate retention policy? Initial assumption: separate policy, default 7 years. | Answered — Legal confirmed separate policy is acceptable; 7-year default approved. |
| 2 | Engineering Lead | What is the maximum practical report size (rows) before PDF generation becomes unreliable? Need load testing to confirm the 50,000-row truncation threshold. | Open — load testing scheduled for Phase 1. |
| 3 | Security | Do reports delivered to external email recipients require additional encryption (e.g., password-protected PDF) beyond TLS-in-transit? | Open — Security review scheduled for Week 3. |
| 4 | Engineering Lead | Should the scheduling service be a new microservice or an extension of the existing task queue? Trade-offs: new service offers isolation but adds operational overhead. | Answered — New lightweight service, deployed alongside existing infrastructure. Isolation outweighs overhead given the compliance-critical nature of scheduling reliability. |
| 5 | Customer Success | Which 5 enterprise accounts should be invited to the closed beta? Criteria: active compliance workflow, responsive POC, diverse channel mix. | Open — CS to recommend by end of Week 3. |
| 6 | Design | Should the report template builder be a standalone page or integrated into the existing Search UI as a "Save & Schedule" flow? | Answered — Integrated into Search UI. Users save filters from where they already build queries. Standalone builder deferred to Phase 4 if needed. |

---

## Appendix A: Report PDF Sample Structure

```
┌─────────────────────────────────────────────┐
│  [Tenant Logo]                              │
│                                             │
│  Weekly Supervision Report                  │
│  Period: June 1–7, 2026                     │
│  Generated: June 8, 2026 06:15 UTC          │
│  Template: "Weekly Flagged Messages — All   │
│             Channels"                       │
├─────────────────────────────────────────────┤
│  EXECUTIVE SUMMARY                          │
│  ─────────────────                          │
│  Total messages in scope:       142,847     │
│  Flagged messages:                  312     │
│  Flag rate:                       0.22%     │
│                                             │
│  Top policies triggered:                    │
│   1. Prohibited language (87)               │
│   2. Gift & entertainment (64)              │
│   3. Client order discussion (53)           │
│   4. Personal device usage (49)             │
│   5. Unapproved channel (41)               │
│                                             │
│  Channel breakdown:                         │
│   WhatsApp: 48% │ Teams: 31% │ Email: 21%  │
├─────────────────────────────────────────────┤
│  GROUPED STATISTICS                         │
│  ──────────────────                         │
│  [By Business Unit]                         │
│  ┌──────────┬────────┬─────────┬──────────┐ │
│  │ Unit     │ Total  │ Flagged │ Rate     │ │
│  ├──────────┼────────┼─────────┼──────────┤ │
│  │ Trading  │ 52,103 │    189  │ 0.36%    │ │
│  │ Advisory │ 41,220 │     78  │ 0.19%    │ │
│  │ Ops      │ 49,524 │     45  │ 0.09%    │ │
│  └──────────┴────────┴─────────┴──────────┘ │
├─────────────────────────────────────────────┤
│  DETAILED DATA TABLE (showing 312 of 312)   │
│  ─────────────────────                      │
│  [Date | Channel | Sender | Policy | ...]   │
│  ...                                        │
├─────────────────────────────────────────────┤
│  Page 1 of 8  │  Confidential  │ Generated  │
│               │                │ by [Brand] │
└─────────────────────────────────────────────┘
```

## Appendix B: Parameterized Date Range Reference

| Expression | Resolves To (Example: Run on Mon June 15, 2026 at 06:00 UTC) |
|---|---|
| Last 7 days | June 8–14, 2026 |
| Previous calendar week | June 8–14, 2026 (Mon–Sun) |
| Previous calendar month | May 1–31, 2026 |
| Previous calendar quarter | Q1 2026: Jan 1–Mar 31 |
| Last 30 days | May 16–June 14, 2026 |
| Custom: last 14 days excluding weekends | 14 most recent weekdays before June 15 |

All date ranges resolve in the tenant's configured timezone, not UTC.
