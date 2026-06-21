const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const path = require('path');
const { createSlackApp, verifySlackSignature } = require('../slackServer');
const { SlackAdapter, parseFeedback } = require('../adapters/mockSlack');

const secret = 'test-signing-secret';
function signature(body, timestamp = Math.floor(Date.now() / 1000)) { return { timestamp: String(timestamp), value: `v0=${crypto.createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}` }; }

test('Slack signature verification rejects stale and altered requests', () => {
  const body = 'command=%2Fagent-b&text=ask+hello'; const signed = signature(body);
  assert.equal(verifySlackSignature(secret, signed.timestamp, signed.value, body), true);
  assert.equal(verifySlackSignature(secret, signed.timestamp, signed.value, `${body}x`), false);
  const stale = signature(body, Math.floor(Date.now() / 1000) - 601);
  assert.equal(verifySlackSignature(secret, stale.timestamp, stale.value, body), false);
});

test('Express Slack server registers health, command, and event endpoints', () => {
  const adapter = { execute: async () => '', deliver: async () => {}, handleEvent: async () => {} };
  const app = createSlackApp({ signingSecret: secret, adapter, logger: { error() {} } });
  const routes = app._router.stack.filter((layer) => layer.route).map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
  assert.deepEqual(routes, [{ path: '/health', methods: ['get'] }, { path: '/slack/commands', methods: ['post'] }, { path: '/slack/events', methods: ['post'] }]);
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
  assert.equal(adapter.acknowledgement('/agent-a', `generate-docs ${fixture}`), 'Agent A started documentation generation.');
  assert.match(await adapter.execute('/agent-a', `generate-docs ${fixture}`), /completed documentation generation/);
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
