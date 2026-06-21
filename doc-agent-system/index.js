const path = require('path');
const { AgentA } = require('./agents/agentA');
const { AgentB } = require('./agents/agentB');
const { MockSlack } = require('./adapters/mockSlack');
const { MockJira } = require('./adapters/mockJira');

const root = __dirname;
const defaultPrd = path.resolve(root, '..', 'samplePRD', 'sample-prd-scheduled-compliance-reports.md');

function createSystem(options = {}) {
  const agentA = new AgentA(options); const agentB = new AgentB(options);
  const slack = new MockSlack({ agentA, agentB, defaultPrd: options.defaultPrd || defaultPrd });
  const jira = new MockJira(options.jiraFile || path.join(options.dataDir || path.join(root, 'store'), 'jira.json'));
  return { agentA, agentB, slack, jira };
}

function demo(prdFile = defaultPrd, options = {}) {
  const system = createSystem({ ...options, defaultPrd: prdFile });
  console.log(system.slack.handle(`/agent-a generate-docs "${prdFile}"`).message);
  const task = system.jira.createDocumentationTask('Generate user documentation from sample PRD');
  system.jira.attachGeneratedDocs(task.key, system.slack.last.outputFile);
  const feedback = system.slack.handle('/agent-a submit-feedback', { source: 'PM', targetSection: 'How to schedule reports', comment: 'Make retry timing explicit.', severity: 'high', suggestedChange: 'Call out the 5-minute and 15-minute retry delays.', status: 'applied' });
  system.jira.addFeedbackComment(task.key, `${feedback.data.id}: ${feedback.data.comment}`);
  console.log(feedback.message);
  console.log(system.slack.handle(`/agent-a regenerate-docs "${prdFile}"`).message);
  console.log(system.slack.handle('/agent-b sync-knowledge').message);
  const answer = system.slack.handle('/agent-b ask "How long are reports retained?"');
  console.log(`\nSlack Q&A\n${answer.message}`);
  system.jira.updateTaskStatus(task.key, 'Done');
  console.log(`\nMock Jira ${task.key} updated to Done.`);
  return system;
}

if (require.main === module) {
  const [command = 'demo', prdFile = defaultPrd, ...rest] = process.argv.slice(2);
  const system = createSystem({ defaultPrd: prdFile });
  try {
    if (command === 'demo') demo(path.resolve(prdFile));
    else if (command.startsWith('/')) console.log(system.slack.handle([command, prdFile, ...rest].join(' ')).message);
    else throw new Error('Use `node index.js demo [prd_file]` or a quoted mock Slack command.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { createSystem, demo };
