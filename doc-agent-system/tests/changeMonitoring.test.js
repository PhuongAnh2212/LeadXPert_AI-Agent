const test = require('node:test');
process.env.DOCS_AGENT_REQUIRE_AI = 'false';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { snapshotMarkdown, diffSections, hashContent, normalizeContent } = require('../lib/changeMonitor');
const { sectionMap } = require('../lib/docSections');
const { createSystem } = require('../index');

const offlineModel = { configured: () => false };
function write(file, value) { fs.writeFileSync(file, value); return file; }
function prd(extra) { return `# Change Monitor PRD\n\n## Stable Section\n\nThis content stays exactly the same.\n\n${extra}\n`; }

test('PRD diff detects added, modified, removed, and unchanged headings with normalized hashes', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'prd-diff-'));
  const oldFile = write(path.join(temp, 'old.md'), prd('## Recurring Schedule\n\nRetry twice.\n\n## Removed Section\n\nLegacy behavior.'));
  const newFile = write(path.join(temp, 'new.md'), prd('## Recurring Schedule\n\nRetry three times.\n\n## Added Section\n\nNew behavior.'));
  const oldSnapshot = snapshotMarkdown(oldFile, { version: 'v1.2', source: 'slack', uploadedBy: 'pm' });
  const newSnapshot = snapshotMarkdown(newFile, { version: 'v1.3', source: 'slack', uploadedBy: 'pm' });
  const diff = diffSections(oldSnapshot, newSnapshot);
  assert.deepEqual(diff.added.map((item) => item.heading), ['Added Section']);
  assert.deepEqual(diff.removed.map((item) => item.heading), ['Removed Section']);
  assert.deepEqual(diff.modified.map((item) => item.heading), ['Recurring Schedule']);
  assert.ok(diff.unchanged.some((item) => item.heading === 'Stable Section'));
  assert.equal(hashContent('same   text\n'), hashContent('same text'));
  assert.equal(diff.modified[0].oldHash, oldSnapshot.sectionHashes['Recurring Schedule']);
  assert.equal(normalizeContent(' a   b\n\n\n c '), 'a b\n\n c');
});

test('upload workflow alerts Slack, partially regenerates, preserves docs, and updates graph plus FAQ state', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'change-flow-'));
  const oldFile = write(path.join(temp, 'prd-v1.2.md'), prd('## Recurring Schedule\n\nRetry twice.\n\n## Removed Section\n\nLegacy behavior.'));
  const newFile = write(path.join(temp, 'prd-v1.3.md'), prd('## Recurring Schedule\n\nRetry three times and send diagnostics.\n\n## Added Section\n\nNew behavior.'));
  const figmaFile = write(path.join(temp, 'figma-v1.3.json'), JSON.stringify({ screens: [{ id: 'schedule', name: 'Recurring Schedule Settings', fields: ['retry count'] }] }));
  const system = createSystem({ dataDir: path.join(temp, 'store'), docsDir: path.join(temp, 'docs'), knowledgeRoot: path.join(temp, 'kb'), jiraFile: path.join(temp, 'jira.json'), modelClient: offlineModel });
  system.agentA.submitFeedback({ source: 'PM', targetSection: 'How to schedule reports', comment: 'Use exact retry timing.', suggestedChange: 'State retry behavior explicitly.', status: 'applied' });
  const baseline = await system.watcher.upload({ prdFile: oldFile, source: 'shared_drive', uploaded_by: 'PM-Ada', version: 'v1.2' });
  const oldDocs = baseline.generated.markdown; const oldSections = sectionMap(oldDocs); system.slack.posts.length = 0;
  let partialCalls = 0; const originalPartial = system.agentA.regenerateSections.bind(system.agentA);
  system.agentA.regenerateSections = async (request) => { partialCalls += 1; return originalPartial(request); };
  const result = await system.watcher.upload({ prdFile: newFile, figmaFile, source: 'slack', uploaded_by: 'PM-Ada', version: 'v1.3' });

  assert.equal(partialCalls, 1);
  assert.deepEqual(result.diff.modified.map((item) => item.heading), ['Recurring Schedule']);
  assert.deepEqual(result.generated.regeneratedSections, ['How to schedule reports']);
  assert.deepEqual(result.signal.affectedSections, ['How to schedule reports']);
  assert.equal(result.signal.changedSections.filter((item) => item.sourceType === 'PRD').length, 3);
  assert.equal(result.signal.activeFeedback.length, 1); assert.equal(result.signal.activeRules.length, 1); assert.equal(result.signal.figmaScreens[0].screen, 'Recurring Schedule Settings');
  assert.equal(result.signal.existingDocumentationSections['How to schedule reports'], oldSections.get('How to schedule reports'));

  const newSections = sectionMap(result.generated.markdown);
  assert.equal(newSections.get('Overview'), oldSections.get('Overview'));
  assert.notEqual(newSections.get('How to schedule reports'), oldSections.get('How to schedule reports'));
  assert.match(newSections.get('How to schedule reports'), /Retry three times and send diagnostics/);

  const alerts = system.slack.messages(result.threadTs).filter((post) => post.type === 'alert');
  assert.ok(alerts.some((post) => post.message === 'PRD updated: Recurring Schedule section changed (v1.2 → v1.3). Regenerating affected documentation.'));
  assert.ok(alerts.every((post) => post.threadTs === result.threadTs));
  assert.ok(system.slack.messages(result.threadTs).some((post) => post.type === 'reply' && /Revised documentation section/.test(post.message)));

  const edges = JSON.parse(fs.readFileSync(path.join(temp, 'kb', 'graph', 'edges.json'), 'utf8'));
  assert.ok(edges.some((edge) => edge.from === 'doc:v1.3#How to schedule reports' && edge.relation === 'supersedes' && edge.to === 'doc:v1.2#How to schedule reports'));
  const faq = JSON.parse(fs.readFileSync(path.join(temp, 'kb', 'qa', 'faq_index.json'), 'utf8'));
  assert.equal(faq.find((item) => /generation fails/i.test(item.question)).status, 'stale');
  assert.equal(faq.find((item) => /formats/i.test(item.question)).status, 'active');
  assert.equal(result.summary, 'Documentation updated. 1 section regenerated. 1 FAQ marked stale — review needed.');
  assert.equal(system.slack.messages(result.threadTs).at(-1).message, result.summary);

  const storedPrd = JSON.parse(fs.readFileSync(path.join(temp, 'kb', 'versions', 'prd', 'v1.3.json'), 'utf8'));
  const storedFigma = JSON.parse(fs.readFileSync(path.join(temp, 'kb', 'versions', 'figma', 'v1.3.json'), 'utf8'));
  assert.equal(storedPrd.uploaded_by, 'PM-Ada'); assert.ok(storedPrd.content_hash); assert.ok(storedPrd.section_hashes['Recurring Schedule']);
  assert.equal(storedFigma.version, 'v1.3'); assert.ok(storedFigma.section_hashes['Recurring Schedule Settings']);
});
