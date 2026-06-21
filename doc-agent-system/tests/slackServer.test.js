const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const { createSlackApp, verifySlackSignature } = require('../slackServer');
const { SlackAdapter, parseFeedback } = require('../adapters/mockSlack');

const secret = 'test-signing-secret';
function signature(body, timestamp = Math.floor(Date.now() / 1000)) { return { timestamp: String(timestamp), value: `v0=${crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}` }; }

async function postSlash(app, fields) {
  const body = new URLSearchParams(fields).toString();
  const route = app._router.stack.find((layer) => layer.route?.path === '/slack/commands');
  const handler = route.route.stack.at(-1).handle;
  const started = Date.now();
  return new Promise((resolve) => {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { resolve({ elapsed: Date.now() - started, status: this.statusCode, body: payload }); } };
    handler({ rawBody: body }, response);
  });
}

test('Slack signature verification rejects stale and altered requests', () => {
  const body = 'command=%2Fagent-b&text=ask+hello'; const signed = signature(body);
  assert.equal(verifySlackSignature(secret, signed.timestamp, signed.value, body), true);
  assert.equal(verifySlackSignature(secret, signed.timestamp, signed.value, `${body}x`), false);
  const stale = signature(body, Math.floor(Date.now() / 1000) - 601);
  assert.equal(verifySlackSignature(secret, stale.timestamp, stale.value, body), false);
});

test('Express Slack server registers health, command, and event endpoints', () => {
  const adapter = { execute: async () => '', deliver: async () => {}, handleEvent: async () => {} };
  const app = createSlackApp({ signingSecret: secret, adapter, logger: { error() {}, info() {}, warn() {} } });
  const routes = app._router.stack.filter((layer) => layer.route).map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
  assert.deepEqual(routes, [{ path: '/health', methods: ['get'] }, { path: '/mock-response', methods: ['post'] }, { path: '/slack/commands', methods: ['post'] }, { path: '/slack/events', methods: ['post'] }]);
});

test('development signature bypass is explicit, logged, and disabled by default', () => {
  const warnings = []; const adapter = { execute: async () => '', deliver: async () => {}, handleEvent: async () => {} };
  assert.throws(() => createSlackApp({ signingSecret: '', adapter, logger: { error() {}, info() {}, warn() {} } }), /SLACK_SIGNING_SECRET/);
  const app = createSlackApp({ signingSecret: '', disableSlackSignature: true, adapter, logger: { error() {}, info() {}, warn: (message) => warnings.push(message) } });
  assert.match(warnings[0], /signature verification is disabled/i);
  const route = app._router.stack.find((layer) => layer.route?.path === '/slack/commands'); let called = false;
  route.route.stack[1].handle({ body: Buffer.from('command=%2Fagent-a&text=help'), headers: {} }, {}, () => { called = true; });
  assert.equal(called, true);
});

test('mock response endpoint logs the async Slack payload and returns OK', () => {
  const logs = []; const adapter = { execute: async () => '', deliver: async () => {}, handleEvent: async () => {} };
  const app = createSlackApp({ signingSecret: secret, adapter, logger: { error() {}, warn() {}, info: (...values) => logs.push(values) } });
  const route = app._router.stack.find((layer) => layer.route?.path === '/mock-response'); const handler = route.route.stack.at(-1).handle;
  const response = { statusCode: 0, body: '', status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; } };
  handler({ body: { text: 'Agent A complete' } }, response);
  assert.equal(response.statusCode, 200); assert.equal(response.body, 'OK'); assert.deepEqual(logs[0][1], { text: 'Agent A complete' });
});

test('slash command endpoint acknowledges in under one second without awaiting agent work', async () => {
  let release; const blocked = new Promise((resolve) => { release = resolve; });
  const adapter = { acknowledgement: () => 'Agent A received the request. Generating documentation...', execute: () => blocked, deliver: async () => {}, handleEvent: async () => {} };
  const result = await postSlash(createSlackApp({ signingSecret: secret, adapter, logger: { error() {} } }), { command: '/agent-a', text: 'generate-docs sample.md', response_url: 'https://hooks.slack.test/a' });
  assert.equal(result.status, 200); assert.ok(result.elapsed < 1000, `acknowledgement took ${result.elapsed}ms`);
  assert.deepEqual(result.body, { response_type: 'ephemeral', text: 'Agent A received the request. Generating documentation...' });
  release('Agent A generated documentation: /tmp/guide.md.');
});

test('async Agent A result is posted through the command response_url', async () => {
  let delivered; let resolveDelivery; const delivery = new Promise((resolve) => { resolveDelivery = resolve; });
  const adapter = { acknowledgement: () => 'Agent A received the request. Generating documentation...', execute: async () => 'Agent A generated documentation: /tmp/guide.md. Jira issue: DOC-1.', deliver: async (url, text) => { delivered = { url, text }; resolveDelivery(); }, handleEvent: async () => {} };
  await postSlash(createSlackApp({ signingSecret: secret, adapter, logger: { error() {} } }), { command: '/agent-a', text: 'generate-docs sample.md', response_url: 'https://hooks.slack.test/agent-a' });
  await delivery;
  assert.deepEqual(delivered, { url: 'https://hooks.slack.test/agent-a', text: 'Agent A generated documentation: /tmp/guide.md. Jira issue: DOC-1.' });
});

test('async Agent B result with sources is posted through the command response_url', async () => {
  let delivered; let resolveDelivery; const delivery = new Promise((resolve) => { resolveDelivery = resolve; });
  const final = 'Reports are retained for 12 months.\n\nSources: docs/guide.md#Retention';
  const adapter = { acknowledgement: () => 'Agent B received the question. Searching knowledge base...', execute: async () => final, deliver: async (url, text) => { delivered = { url, text }; resolveDelivery(); }, handleEvent: async () => {} };
  await postSlash(createSlackApp({ signingSecret: secret, adapter, logger: { error() {} } }), { command: '/agent-b', text: 'ask How long are reports retained?', response_url: 'https://hooks.slack.test/agent-b' });
  await delivery;
  assert.deepEqual(delivered, { url: 'https://hooks.slack.test/agent-b', text: final });
});

test('Slack adapter routes Agent B answers and posts response_url results', async () => {
  let delivered;
  const adapter = new SlackAdapter({
    agentA: {}, agentB: { answerQuestion: async () => ({ answer: 'PDF and CSV are supported.', citations: ['docs/guide.md#Formats'], mode: 'openrouter-agent' }) },
    defaultPrd: '/tmp/input.md', token: 'xoxb-test', client: {}, uploadDir: '/tmp/doc-agent-slack-test',
    fetchImpl: async (url, options) => { delivered = { url, payload: JSON.parse(options.body) }; return { ok: true }; }
  });
  const result = await adapter.execute('/agent-b', 'ask What formats are supported?');
  assert.match(result, /PDF and CSV/); assert.match(result, /docs\/guide.md#Formats/);
  await adapter.deliver('https://hooks.slack.test/response', result);
  assert.equal(delivered.url, 'https://hooks.slack.test/response'); assert.equal(delivered.payload.text, result);
});

test('Slack feedback command parser accepts structured key-value input', () => {
  assert.deepEqual(parseFeedback('source="Customer Support" section="FAQ" severity=high status=applied comment="Clarify formats" suggested="Name PDF and CSV"'), { source: 'Customer Support', targetSection: 'FAQ', severity: 'high', status: 'applied', comment: 'Clarify formats', suggestedChange: 'Name PDF and CSV' });
});

test('real Slack adapter supports every Agent A and Agent B slash action', async () => {
  const calls = [];
  const fixture = path.resolve(__dirname, '..', '..', 'samplePRD', 'sample-prd-scheduled-compliance-reports.md');
  const generated = { outputFile: '/tmp/guide.md', mode: 'openrouter-agent', prd: { requirements: [], acceptanceCriteria: [] }, markdown: '# Guide' };
  const agentA = {
    docsDir: '/tmp',
    generate: async (file) => { calls.push(['generate', file]); return generated; },
    regenerate: async (file) => { calls.push(['regenerate', file]); return generated; },
    submitFeedback: (feedback) => { calls.push(['feedback', feedback]); return { id: 'FB-001', targetSection: feedback.targetSection, status: feedback.status }; },
    feedback: { read: () => [], accepted: () => [{ targetSection: 'FAQ' }] }
  };
  const agentB = {
    answerQuestion: async (question) => { calls.push(['ask', question]); return { answer: 'Answer', citations: ['docs/a.md#A'], mode: 'openrouter-agent' }; },
    sync: () => { calls.push(['sync']); return { root: '/tmp/kb', requirements: 0, acceptanceCriteria: 0, updatedNodes: 2, updatedEdges: 1 }; },
    diffLatestPrdVersions: () => ({ fromVersion: 'v1.2', toVersion: 'v1.3', changedSections: [{ heading: 'Schedule', changeType: 'modified' }] }),
    status: () => ({ latestPrdVersion: 'v1.3', latestDocumentationVersion: 'v1.3', knowledgeBaseStatus: 'synchronized', feedbackCount: 1, staleFaqCount: 1 })
  };
  const adapter = new SlackAdapter({ agentA, agentB, defaultPrd: fixture, token: 'xoxb-test', client: {}, uploadDir: '/tmp/doc-agent-slack-actions' });
  assert.equal(adapter.acknowledgement('/agent-a', `generate-docs ${fixture}`), 'Agent A received the request. Generating documentation...');
  assert.equal(adapter.acknowledgement('/agent-a', 'regenerate-docs'), 'Agent A received the request. Regenerating documentation...');
  assert.equal(adapter.acknowledgement('/agent-b', 'ask What changed?'), 'Agent B received the question. Searching knowledge base...');
  assert.equal(adapter.acknowledgement('/agent-b', 'sync-knowledge'), 'Agent B received the request. Syncing knowledge base...');
  assert.match(await adapter.execute('/agent-a', `generate-docs ${fixture}`), /generated documentation/);
  assert.match(await adapter.execute('/agent-a', `regenerate-docs ${fixture}`), /Affected sections: FAQ/);
  assert.match(await adapter.execute('/agent-a', 'submit-feedback source=PM section=FAQ severity=high status=applied comment="Fix it" suggested="Be direct"'), /FB-001/);
  assert.match(await adapter.execute('/agent-b', 'ask What changed?'), /Answer/);
  assert.match(await adapter.execute('/agent-b', 'sync-knowledge'), /Knowledge base synchronized/);
  assert.match(await adapter.execute('/agent-b', 'diff-prd'), /Schedule \(modified\)/);
  assert.match(await adapter.execute('/agent-b', 'status'), /Latest PRD version: v1.3/);
  assert.match(await adapter.execute('/agent-a', 'help'), /generate-docs/);
  assert.match(await adapter.execute('/agent-b', 'help'), /diff-prd/);
  assert.deepEqual(calls.map((call) => call[0]), ['generate', 'regenerate', 'feedback', 'ask', 'sync']);
});

test('Slack Agent workflow creates, comments, transitions, and reports Jira issue state', async () => {
  const fixture = path.resolve(__dirname, '..', '..', 'samplePRD', 'sample-prd-scheduled-compliance-reports.md'); const jiraCalls = [];
  const generated = { outputFile: '/tmp/jira-guide.md', mode: 'openrouter-agent', prd: { sourceFile: fixture, requirements: [], acceptanceCriteria: [] }, markdown: '# Guide' };
  const agentA = { docsDir: '/tmp', generate: async () => generated, regenerate: async () => generated, submitFeedback: (feedback) => ({ id: 'FB-009', ...feedback }), feedback: { read: () => [], accepted: () => [{ targetSection: 'FAQ' }] } };
  const agentB = { sync: () => ({ updatedNodes: 2, updatedEdges: 1 }) };
  const jira = {
    configured: () => true,
    createDocumentationTask: async (name) => { jiraCalls.push(['create', name]); return { key: 'DOC-99' }; },
    attachGeneratedDocumentation: async (key, file) => jiraCalls.push(['attach', key, file]),
    addFeedbackComment: async (key, feedback) => jiraCalls.push(['comment', key, feedback.id]),
    updateIssueStatus: async (key, status) => { jiraCalls.push(['status', key, status]); return { issueKey: key, status, lastUpdate: '2026-06-21T10:00:00Z' }; },
    getIssueStatus: async (key) => ({ issueKey: key, status: 'Done', lastUpdate: '2026-06-21T11:00:00Z' })
  };
  const stateFile = path.join(os.tmpdir(), `jira-state-${Date.now()}.json`);
  const adapter = new SlackAdapter({ agentA, agentB, jira, defaultPrd: fixture, token: 'xoxb-test', client: {}, uploadDir: '/tmp/doc-agent-jira-slack', jiraStateFile: stateFile });
  assert.match(await adapter.execute('/agent-a', `generate-docs ${fixture}`), /Jira issue: DOC-99/);
  assert.match(await adapter.execute('/agent-a', 'submit-feedback section=FAQ severity=high comment="Clarify"'), /FB-009/);
  await adapter.execute('/agent-a', 'regenerate-docs'); await adapter.execute('/agent-b', 'sync-knowledge');
  assert.match(await adapter.execute('/agent-b', 'jira-status'), /Issue Key: DOC-99\nStatus: Done/);
  assert.deepEqual(jiraCalls.map((call) => `${call[0]}:${call[2] || ''}`), ['create:', 'attach:/tmp/jira-guide.md', 'comment:FB-009', 'status:In Progress', 'attach:/tmp/jira-guide.md', 'status:Review', 'status:Done']);
});
