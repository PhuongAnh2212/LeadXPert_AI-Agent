# 2. Current State & Limitations

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
