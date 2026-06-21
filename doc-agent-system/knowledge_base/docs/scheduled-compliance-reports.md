## Overview
The Scheduled Compliance Reports feature allows Compliance Officers to automate the generation and delivery of compliance reports. This feature addresses the manual and error-prone process of assembling reports by enabling users to create report templates, schedule them for automatic generation, and deliver them via email or SFTP. Each report run is stored as an immutable artifact, ensuring a complete audit trail.

## Who this feature is for
This feature is designed for Compliance Officers and their teams in regulated industries who need to demonstrate ongoing supervision of employee communications. It is particularly beneficial for organizations that require consistent and timely reporting to meet regulatory obligations.

## How to create a report template
1. Navigate to the Search UI and apply the desired filters (date range, channels, policies, etc.).
2. Click on the "Save as Report Template" button.
3. In the modal that appears, enter a name and optional description for the template.
4. Click "Save" to persist the filter configuration as a reusable report template.

## How to schedule reports
1. Go to the Report Templates section and select the template you wish to schedule.
2. Click on the "Schedule" option.
3. Choose the frequency for the report (daily, weekly, monthly, or custom cron expression).
4. Set the time for the report to be generated based on your tenant's configured timezone.
5. If the report generation fails, the system will automatically retry twice with delays of 5 minutes and 15 minutes before notifying the template owner.

## How to configure email delivery
1. While setting up your report template, navigate to the delivery options.
2. Enter the email addresses of the recipients (internal users or external email addresses).
3. Choose whether to attach the report directly or send a secure download link.
4. Save the configuration. Each recipient will receive the report within 5 minutes of its completion.

## How to download generated reports
1. Navigate to the Reports History section.
2. Locate the report you wish to download.
3. Click on the download link associated with the report to retrieve the artifact.

## Report retention and audit trail
All generated reports are stored as immutable artifacts with metadata, including parameters used, generation time, row count, and delivery status. Reports are retained for a default period of 7 years, ensuring compliance with regulatory requirements.

## FAQ
**Q: Can I share report templates with other users?**  
A: Yes, report templates can be shared with other users within the same tenant, with role-based permissions (view, edit, manage).

**Q: What happens if a scheduled report fails to generate?**  
A: The system will retry the generation twice, with delays of 5 minutes and 15 minutes. If it fails after these attempts, the template owner will be notified.

**Q: Are reports encrypted?**  
A: Yes, report artifacts are encrypted at rest using AES-256 encryption.

## Known limitations / out-of-scope items
- Real-time streaming reports are not included; this feature covers only scheduled, batch-generated reports.
- A drag-and-drop report designer is not available; PDF layouts are template-driven.
- Cross-tenant reporting is not supported; reports are scoped to a single tenant.
- Message content redaction in reports is not included; reports contain full message content.
- A dedicated mobile viewing experience for reports is not in scope.

## Feedback backlinks

[[FB-001]], [[FB-002]], [[FB-003]], [[FB-004]], [[FB-005]], [[FB-006]], [[FB-007]], [[FB-008]]
