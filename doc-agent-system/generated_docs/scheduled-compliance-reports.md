## Overview

The Scheduled Compliance Reports feature allows Compliance Officers to automate the generation and delivery of compliance reports. This feature addresses the manual and error-prone process of assembling reports by enabling users to create report templates, schedule them for automatic generation, and deliver the results via email or SFTP. Each report run is stored as an immutable artifact, ensuring a complete audit trail.

## Who this feature is for

This feature is designed for Compliance Officers and their teams in regulated industries who need to demonstrate ongoing supervision of employee communications. It is particularly beneficial for organizations that require consistent and timely reporting to meet regulatory obligations.

## How to create a report template

1. Navigate to the **Search UI** and apply your desired filters (e.g., date range, channels, policies).
2. Click on **Save as Report Template**.
3. In the modal that appears, enter a name and optional description for your template.
4. Click **Save** to persist the filter configuration. The template will now appear in your Report Templates list.

## How to schedule reports

1. Open the report template you wish to schedule.
2. Attach a schedule by selecting the frequency (daily, weekly, monthly, or custom cron expression).
3. The system will generate and deliver the report at the specified time. If a scheduled report fails during generation, the system will retry twice with exponential backoff: first after 5 minutes and again after 15 minutes. The template owner will be notified via email and in-app notification if all retries fail.

## How to configure email delivery

1. While editing your report template, navigate to the delivery settings.
2. Add one or more email recipients, which can include both internal users and external email addresses.
3. Choose whether to attach the report directly or send a secure download link.
4. Save your changes. Each recipient will receive the report within 5 minutes of its completion.

## How to download generated reports

1. Navigate to the **Reports > History** section.
2. Locate the report you wish to download in the list of past runs.
3. Click on the download link associated with the report to retrieve the artifact.

## Report retention and audit trail

All generated reports are stored as immutable artifacts with metadata that includes parameters, generation time, row count, and a hash of the output file. These artifacts follow a dedicated retention policy, defaulting to 7 years, independent of the message data retention policy. Every action related to report generation, download, and delivery is logged in an immutable audit trail.

## FAQ

**Q: Can I share report templates with other users?**  
A: Yes, report templates can be shared with other users within the same tenant, with role-based permissions (view, edit, manage).

**Q: What happens if a scheduled report fails?**  
A: The system will retry the report generation twice, first after 5 minutes and then after 15 minutes. If it fails again, the template owner will be notified.

**Q: How are reports delivered?**  
A: Reports can be delivered via email as attachments or secure download links, or through SFTP if configured.

## Known limitations / out-of-scope items

- Real-time streaming reports are not included; this feature covers only scheduled, batch-generated reports.
- There is no drag-and-drop report designer; PDF layouts are template-driven.
- Cross-tenant reporting is not supported; reports are scoped to a single tenant.
- Message content redaction in reports is not included; reports will contain full message content.
- A dedicated mobile viewing experience for reports is not in scope.