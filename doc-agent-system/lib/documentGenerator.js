const fs = require('fs');
const path = require('path');

function requirement(prd, id) { return prd.requirements.find((item) => item.id === id); }
function criterion(prd, id) { return prd.acceptanceCriteria.find((item) => item.id === id); }
function refs(...ids) { return ids.map((id) => `[[${id}]]`).join(', '); }
function feedbackFor(feedback, section) { return feedback.filter((item) => item.status === 'applied' && item.targetSection.toLowerCase() === section.toLowerCase()); }

function appliedGuidance(feedback, section) {
  const items = feedbackFor(feedback, section);
  if (!items.length) return '';
  return `\n\n### Incorporated team guidance\n\n${items.map((item) => `- ${item.suggestedChange || item.comment} ([[${item.id}]])`).join('\n')}`;
}

function generateDocumentation(prd, feedback = []) {
  const feature = prd.metadata['Feature Name'] || prd.title.replace(/^Product Requirement Document:\s*/i, '');
  const p0 = (prd.priorities.P0 || []).map((item) => `${item.id}: ${item.text}`).join('; ');
  const out = prd.outOfScope.length ? prd.outOfScope : ['Natural-language search and anomaly detection are deferred.'];
  const sections = [
    ['Overview', `${feature} lets compliance teams save reusable report configurations, run them automatically, deliver results, and retain immutable artifacts. The initial release supports PDF and CSV output.\n\nSource: ${refs('FR-01', 'FR-02', 'FR-03', 'FR-04', 'FR-05', 'FR-06')}`],
    ['Who this feature is for', `This feature is primarily for Compliance Officers. IT Admins configure SFTP endpoints, while permitted colleagues can view shared templates and artifacts.\n\nSource: ${refs('FR-07', 'FR-11')}`],
    ['How to create a report template', `1. Configure filters and columns in Search.\n2. Select **Save as Report Template**.\n3. Enter a name and optional description.\n4. Save, then verify the template appears in Report Templates with its filters preserved.\n\nSource: ${refs(requirement(prd, 'FR-01')?.id || 'FR-01', criterion(prd, 'AC-01')?.id || 'AC-01', 'AC-02')}`],
    ['How to schedule reports', `1. Open a saved report template.\n2. Add a daily, weekly, monthly, or custom cron schedule.\n3. Confirm the tenant timezone and activate it.\n4. If generation fails, the system retries twice (after 5 and 15 minutes). After the final failure, the owner receives email and in-app notifications with a manual retry link.\n\nSource: ${refs('FR-02', 'AC-03', 'AC-04', 'NFR-14')}`],
    ['How to configure email delivery', `Add one or more internal or external email addresses and choose an attachment or secure link. External recipients require a sensitive-data acknowledgment. Links expire after 7 days. Files over 25 MB automatically use a link.\n\nSource: ${refs('FR-03', 'AC-05', 'AC-06')}`],
    ['How to download generated reports', `Open **Reports > History**, find a run, and select **Download**. Access depends on permissions. PDF reports may contain up to 10,000 detailed rows; use the companion CSV for the full dataset.\n\nSource: ${refs('FR-04', 'FR-08', 'AC-07', 'AC-10')}`],
    ['Report retention and audit trail', `Every generated report is an immutable, append-only artifact. Metadata includes parameters, timestamps, row count, hash, and delivery status. The default retention period is **7 years**, separate from message retention. Generation, download, and delivery actions are audited.\n\nSource: ${refs('FR-04', 'AC-07', 'AC-08', 'NFR-10', 'NFR-11')}`],
    ['FAQ', `### What formats are supported?\nPDF and CSV. PDF provides formatted summaries and tables; CSV contains all matching rows.\n\nSource: ${refs('FR-05', 'FR-06')}\n\n### What happens if generation fails?\nThe system retries twice with exponential backoff, then notifies the template owner by email and in-app notification.\n\nSource: ${refs('AC-04', 'NFR-14')}\n\n### What are the P0 requirements?\nThe P0 requirements are: ${p0}.\n\nSource: [[3-proposed-solution-expected-behavior#Requirements by Priority]]`],
    ['Known limitations / out-of-scope items', `${out.map((item) => `- ${item}`).join('\n')}\n- SFTP, report history, preview, and template sharing are P1 rather than launch-blocking P0 capabilities.\n\nSource: [[7-out-of-scope]], [[3-proposed-solution-expected-behavior#Requirements by Priority]]`]
  ];
  const body = sections.map(([heading, content]) => `## ${heading}\n\n${content}${appliedGuidance(feedback, heading)}`).join('\n\n');
  return `# ${feature} — User Guide\n\n> Generated from ${path.basename(prd.sourceFile)}. The PRD is sample input; this guide is an Agent A artifact.\n\n${body}\n`;
}

function saveDocumentation(markdown, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, markdown); return outputPath;
}

module.exports = { generateDocumentation, saveDocumentation };
