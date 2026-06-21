## Overview
The Scheduled Compliance Reports feature allows Compliance Officers to automate the generation and delivery of compliance reports. This feature addresses the manual and error-prone processes currently in place, enabling users to save report templates, schedule them for automatic generation, and deliver the results via email or SFTP. Each report run is stored as an immutable artifact, ensuring a complete audit trail.

## Who this feature is for
This feature is designed for Compliance Officers and their teams in regulated industries who need to demonstrate ongoing supervision of employee communications. It is particularly beneficial for organizations that require regular reporting to meet compliance standards.

## How to create a report template
1. Navigate to the Search UI and apply your desired filters (date range, channels, policies, etc.).
2. Click on the "Save as Report Template" button.
3. In the modal that appears, enter a name and optional description for your template.
4. Click "Save" to persist the filter configuration as a reusable report template.

## How to schedule reports
1. Go to the Reports section and select the report template you wish to schedule.
2. Attach a schedule to the template, choosing from daily, weekly, monthly, or a custom cron expression.
3. The system will generate and deliver the report at the specified time. If a scheduled report fails during generation, the system will retry twice with delays of 5 minutes and 15 minutes before notifying the template owner via email and in-app notification if all retries fail.

## How to configure email delivery
1. In the report template settings, specify the email addresses of the recipients.
2. Choose whether to attach the report directly or send a secure download link.
3. Save the configuration. Each recipient will receive the report within 5 minutes of its completion.

## How to download generated reports
1. Navigate to the Reports > History section.
2. Locate the report you wish to download from the list of past runs.
3. Click on the download link associated with the report to retrieve the artifact.

## Report retention and audit trail
All generated reports are stored as immutable artifacts with metadata, including parameters used, generation time, row count, and delivery status. These artifacts follow a dedicated retention policy, defaulting to 7 years, independent of message retention policies.

## FAQ
**Q: Can I share report templates with other users?**  
A: Yes, report templates can be shared with other users within the same tenant, with role-based permissions (view, edit, manage).

**Q: What happens if a scheduled report fails?**  
A: The system will attempt to retry the report generation twice, with delays of 5 minutes and 15 minutes. If it fails after these attempts, the template owner will be notified.

**Q: Are reports encrypted?**  
A: Yes, report artifacts are encrypted at rest using AES-256 encryption.

## Known limitations / out-of-scope items
- Real-time streaming reports are not supported; this feature focuses on scheduled, batch-generated reports only.
- There is no drag-and-drop report designer; PDF layouts are template-driven.
- Cross-tenant reporting is not available; reports are scoped to a single tenant.
- Message content redaction in reports is not included; reports will contain full message content as captured.
- A dedicated mobile viewing experience for reports is not in scope.