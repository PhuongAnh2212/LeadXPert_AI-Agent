const test = require('node:test');
process.env.DOCS_AGENT_REQUIRE_AI = 'false';
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parsePrd } = require('../lib/prdParser');
const { AgentA } = require('../agents/agentA');
const { AgentB } = require('../agents/agentB');
const { MockSlack } = require('../adapters/localSlack');
const { generateDocumentation } = require('../lib/documentGenerator');

const fixture = path.resolve(__dirname, '..', '..', 'samplePRD', 'sample-prd-scheduled-compliance-reports.md');
const offlineModel = { configured: () => false };
function setup() { const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-agents-')); const agentA = new AgentA({ dataDir: path.join(temp, 'store'), docsDir: path.join(temp, 'docs'), modelClient: offlineModel }); const agentB = new AgentB({ knowledgeRoot: path.join(temp, 'knowledge_base'), modelClient: offlineModel }); return { temp, agentA, agentB }; }

test('parses markdown PRD into sections and structured requirement types', () => {
  const prd = parsePrd(fs.readFileSync(fixture, 'utf8'), fixture);
  assert.equal(prd.requirements.length, 13); assert.equal(prd.acceptanceCriteria.length, 17);
  assert.ok(prd.priorities.P0.some((item) => item.id === 'FR-01'));
  assert.ok(prd.assumptions.length); assert.ok(prd.dependencies.length); assert.ok(prd.openQuestions.length); assert.equal(prd.appendix.length, 2);
});

test('Agent A generates every required user documentation section', async () => {
  const { agentA } = setup(); const result = await agentA.generate(fixture);
  for (const heading of ['Overview', 'Who this feature is for', 'How to create a report template', 'How to schedule reports', 'How to configure email delivery', 'How to download generated reports', 'Report retention and audit trail', 'FAQ', 'Known limitations / out-of-scope items']) assert.match(result.markdown, new RegExp(`## ${heading.replace(/[/-]/g, '.?')}`, 'i'));
  assert.ok(fs.existsSync(result.outputFile));
});

test('feedback is validated and persisted with history', () => {
  const { agentA } = setup(); const item = agentA.submitFeedback({ source: 'QA', targetSection: 'FAQ', comment: 'Clarify formats.', severity: 'medium', suggestedChange: 'Name PDF and CSV.' });
  assert.equal(item.status, 'open'); assert.equal(agentA.feedback.read()[0].source, 'QA');
});

test('regeneration incorporates applied feedback and learns repeated preferences', async () => {
  const { agentA } = setup();
  for (let i = 0; i < 2; i++) agentA.submitFeedback({ source: 'PM', targetSection: 'FAQ', comment: 'Use direct language.', suggestedChange: 'Use short, direct answers.', status: 'applied' });
  const result = await agentA.regenerate(fixture);
  assert.match(result.markdown, /Use short, direct answers/); assert.equal(result.preferences[0].occurrences, 2);
});

test('Agent B creates Obsidian-style folders and backlinks', async () => {
  const { temp, agentA, agentB } = setup(); const generated = await agentA.generate(fixture); const feedback = agentA.submitFeedback({ source: 'Customer Support', targetSection: 'FAQ', comment: 'Common question', suggestedChange: 'Explain CSV.', status: 'applied' });
  agentB.sync(generated.prd, generated.markdown, [feedback]);
  for (const dir of ['prd', 'docs', 'feedback', 'qa']) assert.ok(fs.existsSync(path.join(temp, 'knowledge_base', dir)));
  assert.match(fs.readFileSync(path.join(temp, 'knowledge_base', 'prd', 'FR-01.md'), 'utf8'), /\[\[AC-01\]\]/);
  assert.match(fs.readFileSync(path.join(temp, 'knowledge_base', 'feedback', `${feedback.id}.md`), 'utf8'), /\[\[scheduled-compliance-reports#FAQ\]\]/);
});

test('mock Slack handles Agent A and Agent B commands', async () => {
  const { agentA, agentB } = setup(); const slack = new MockSlack({ agentA, agentB, defaultPrd: fixture });
  assert.match((await slack.handle(`/agent-a generate-docs "${fixture}"`)).message, /generated/);
  assert.match((await slack.handle('/agent-b sync-knowledge')).message, /synced/);
});

test('Agent B Q&A returns source file and section citations', async () => {
  const { agentA, agentB } = setup(); const generated = await agentA.generate(fixture); agentB.sync(generated.prd, generated.markdown, []);
  const result = await agentB.answerQuestion('How long are reports retained?');
  assert.match(result.answer, /7 years/i); assert.ok(result.citations[0].includes('#')); assert.match(result.citations[0], /docs\/scheduled-compliance-reports\.md/);
});

test('Agent A uses the OpenRouter agent path when a model client is configured', async () => {
  let called = false;
  const modelClient = {
    configured: () => true,
    sourceBundleTool: async (bundle, onRead) => { onRead(); return { bundle }; },
    runAgent: async ({ tools }) => { called = Boolean(tools[0].bundle.prd); return generateDocumentation(tools[0].bundle.prd, []); }
  };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-agents-ai-'));
  const agentA = new AgentA({ dataDir: path.join(temp, 'store'), docsDir: path.join(temp, 'docs'), modelClient });
  const result = await agentA.generate(fixture);
  assert.equal(called, true); assert.equal(result.mode, 'openrouter-agent');
});

test('Agent B validates citations produced through the OpenRouter search tool', async () => {
  const { agentA, temp } = setup(); const generated = await agentA.generate(fixture);
  const modelClient = {
    configured: () => true,
    knowledgeSearchTool: async (search) => ({ search }),
    runAgent: async ({ tools }) => { const [hit] = tools[0].search('report retention years', 3); return JSON.stringify({ answer: 'Reports are retained for 7 years.', citations: [hit.source, 'invented.md#Fake'] }); }
  };
  const agentB = new AgentB({ knowledgeRoot: path.join(temp, 'ai-kb'), modelClient }); agentB.sync(generated.prd, generated.markdown, []);
  const result = await agentB.answerQuestion('How long are reports retained?');
  assert.equal(result.mode, 'openrouter-agent'); assert.equal(result.citations.length, 1); assert.doesNotMatch(result.citations[0], /invented/);
});
