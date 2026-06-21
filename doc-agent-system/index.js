const path = require('path');
const { AgentA } = require('./agents/agentA');
const { AgentB } = require('./agents/agentB');
const { MockSlack } = require('./adapters/localSlack');
const { MockJira } = require('./adapters/mockJira');
const { MockUploadWatcher } = require('./adapters/mockUploadWatcher');
const fs = require('fs');

const root = __dirname;
const defaultPrd = path.resolve(root, '..', 'samplePRD', 'sample-prd-scheduled-compliance-reports.md');

function createSystem(options = {}) {
  const agentA = new AgentA(options); const agentB = new AgentB(options);
  const slack = new MockSlack({ agentA, agentB, defaultPrd: options.defaultPrd || defaultPrd });
  const jira = new MockJira(options.jiraFile || path.join(options.dataDir || path.join(root, 'store'), 'jira.json'));
  const watcher = new MockUploadWatcher({ agentA, agentB, slack });
  return { agentA, agentB, slack, jira, watcher };
}

async function demo(prdFile = defaultPrd, options = {}) {
  const system = createSystem({ ...options, defaultPrd: prdFile });
  console.log((await system.slack.handle(`/agent-a generate-docs "${prdFile}"`)).message);
  const task = system.jira.createDocumentationTask('Generate user documentation from sample PRD');
  system.jira.attachGeneratedDocs(task.key, system.slack.last.outputFile);
  const feedback = await system.slack.handle('/agent-a submit-feedback', { source: 'PM', targetSection: 'How to schedule reports', comment: 'Make retry timing explicit.', severity: 'high', suggestedChange: 'Call out the 5-minute and 15-minute retry delays.', status: 'applied' });
  system.jira.addFeedbackComment(task.key, `${feedback.data.id}: ${feedback.data.comment}`);
  console.log(feedback.message);
  console.log((await system.slack.handle(`/agent-a regenerate-docs "${prdFile}"`)).message);
  console.log((await system.slack.handle('/agent-b sync-knowledge')).message);
  const answer = await system.slack.handle('/agent-b ask "How long are reports retained?"');
  console.log(`\nSlack Q&A\n${answer.message}`);
  system.jira.updateTaskStatus(task.key, 'Done');
  console.log(`\nMock Jira ${task.key} updated to Done.`);
  return system;
}

async function demoChange(prdFile = defaultPrd) {
  const demoRoot = path.join(root, 'store', 'change-demo'); fs.rmSync(demoRoot, { recursive: true, force: true }); fs.mkdirSync(demoRoot, { recursive: true });
  const oldFile = path.join(demoRoot, 'prd-v1.2.md'); const newFile = path.join(demoRoot, 'prd-v1.3.md'); const figmaFile = path.join(demoRoot, 'figma-v1.3.json');
  const base = fs.readFileSync(prdFile, 'utf8');
  fs.writeFileSync(oldFile, `${base}\n\n## Recurring Schedule\n\nOwners are notified after two failed generation retries.\n`);
  fs.writeFileSync(newFile, `${base}\n\n## Recurring Schedule\n\nOwners and Customer Support are notified after three failed generation retries, with a diagnostic link.\n`);
  fs.writeFileSync(figmaFile, `${JSON.stringify({ screens: [{ id: 'schedule-v13', name: 'Recurring Schedule Settings', controls: ['retry count', 'diagnostic link'] }] }, null, 2)}\n`);
  const system = createSystem({ dataDir: path.join(demoRoot, 'agent-store'), docsDir: path.join(demoRoot, 'generated-docs'), knowledgeRoot: path.join(demoRoot, 'knowledge_base'), jiraFile: path.join(demoRoot, 'jira.json') });
  await system.watcher.upload({ prdFile: oldFile, source: 'shared_drive', uploadedBy: 'PM-Sarah', version: 'v1.2' }); system.slack.posts.length = 0;
  const result = await system.watcher.upload({ prdFile: newFile, figmaFile, source: 'slack', uploadedBy: 'PM-Sarah', version: 'v1.3' });
  console.log('Change detection');
  for (const post of system.slack.messages(result.threadTs).filter((item) => item.type === 'alert')) console.log(post.message);
  console.log(`Agent A regenerated: ${result.generated.regeneratedSections.join(', ')}`);
  console.log(result.summary);
  return result;
}

if (require.main === module) {
  const [command = 'demo', prdFile = defaultPrd, ...rest] = process.argv.slice(2);
  const system = createSystem({ defaultPrd: prdFile });
  (async () => {
    if (command === 'demo') await demo(path.resolve(prdFile));
    else if (command === 'demo:change') await demoChange(path.resolve(prdFile));
    else if (command.startsWith('/')) console.log((await system.slack.handle([command, prdFile, ...rest].join(' '))).message);
    else throw new Error('Use `node index.js demo [prd_file]` or a quoted mock Slack command.');
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { createSystem, demo, demoChange };
