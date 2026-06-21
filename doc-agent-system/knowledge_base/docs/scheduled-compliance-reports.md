## Overview

The Scheduled Compliance Reports feature allows Compliance Officers to automate the generation and delivery of compliance reports. This feature addresses the manual and error-prone process of compiling reports by enabling users to create report templates, schedule them for automatic generation, and deliver them via email or SFTP. Each report run is stored as an immutable artifact, ensuring a complete audit trail.

## Who this feature is for

This feature is designed for Compliance Officers and their teams in regulated industries who need to demonstrate ongoing supervision of employee communications. It is particularly beneficial for organizations that require consistent and timely reporting to meet regulatory obligations.

## How to create a report template

1. Navigate to the Search UI and apply the desired filters (e.g., date range, channels, policies).
2. Click on the **Save as Report Template** button.
3. In the modal that appears, enter a name and optional description for the template.
4. Click **Save** to persist the filter configuration as a reusable report template.

## How to schedule reports

1. Go to the **Reports** section and select the report template you want to schedule.
2. Attach a schedule to the template by selecting the frequency (daily, weekly, monthly, or custom cron expression).
3. The system will generate and deliver the report at the specified time. If a scheduled report fails during generation, the system will retry twice with delays of 5 minutes and 15 minutes, notifying the template owner if all retries fail.

## How to configure email delivery

1. While editing the report template, specify the email recipients.
2. Choose whether to attach the report directly or send a secure download link.
3. Save the configuration. Each recipient will receive the report within 5 minutes of completion, with download links expiring after 7 days.

## How to download generated reports

1. Navigate to the **Reports > History** section.
2. Locate the report you wish to download from the list of past runs.
3. Click on the download link associated with the report to retrieve the artifact.

## Report retention and audit trail

All generated reports are stored as immutable artifacts, which include metadata such as generation time, parameters used, row count, and delivery status. These artifacts follow a dedicated retention policy, defaulting to 7 years, independent of the message retention policy.

## FAQ

**Q: Can I share report templates with other users?**  
A: Yes, report templates can be shared with other users within the same tenant, with role-based permissions (view, edit, manage).

**Q: What happens if a scheduled report fails?**  
A: The system will attempt to retry the report generation twice, with delays of 5 minutes and 15 minutes. If all retries fail, the template owner will be notified.

**Q: How are reports delivered?**  
A: Reports can be delivered via email as attachments or secure download links, or through SFTP if configured.

## Known limitations / out-of-scope items

- Real-time streaming reports are not included; this feature covers scheduled, batch-generated reports only.
- A report designer or drag-and-drop layout builder is not available; PDF layout is template-driven.
- Cross-tenant reporting is not supported; reports are scoped to a single tenant.
- Message content redaction in reports is not included; reports will contain full message content as captured.
- A dedicated mobile viewing experience for reports is not in scope.

## Feedback backlinks

[[FB-001]], [[FB-002]], [[FB-003]], [[FB-004]], [[FB-005]], [[FB-006]], [[FB-007]], [[FB-008]]
