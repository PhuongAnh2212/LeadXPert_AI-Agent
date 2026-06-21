# Agent A + Agent B Documentation System

This repository demonstrates a local two-agent product-documentation workflow:

- **Agent A** ingests a markdown PRD, stores structured PRD data, generates a user-facing markdown guide, accepts PM/Customer Support/QA feedback, and regenerates the guide from applied feedback.
- **Agent B** synchronizes the PRD, generated guide, and feedback history into an Obsidian-style markdown knowledge base and answers Slack-style questions with file/section citations.
- **Mock Slack and Jira adapters** provide a credential-free human-agent interface and task workflow.

## Important project boundary

[`sample-prd-scheduled-compliance-reports.md`](/Users/pdpa/Desktop/LeadXPert_AI-Agent/samplePRD/sample-prd-scheduled-compliance-reports.md) is sample input data. This project does **not** implement Scheduled Compliance Reports. The actual product is the documentation-agent system in [`doc-agent-system`](/Users/pdpa/Desktop/LeadXPert_AI-Agent/doc-agent-system).

The old compliance-product prototype under `samplePRD/app/` is not part of the Agent A/B runtime or demo.

Optional design inputs are accepted as markdown or JSON through `createSystem({ designFiles: [...] })`; Agent A stores them with the structured source data and Agent B indexes them as design notes under `knowledge_base/prd/`.

## Quick start

Requires Node.js 18 or newer.

```bash
cd doc-agent-system
npm install
npm run demo
```

The demo performs the complete assignment flow: PRD ingestion, initial documentation generation, applied PM feedback, regeneration, knowledge sync, cited Slack Q&A, and Jira task completion.

Generated runtime artifacts are written to:

- `doc-agent-system/store/prd-structured.json`
- `doc-agent-system/store/feedback.json`
- `doc-agent-system/store/jira.json`
- `doc-agent-system/generated_docs/scheduled-compliance-reports.md`
- `doc-agent-system/knowledge_base/{prd,docs,feedback,qa}/`

## Agent A

From `doc-agent-system`, generate documentation with the local Slack adapter:

```bash
node index.js "/agent-a generate-docs" ../samplePRD/sample-prd-scheduled-compliance-reports.md
```

Feedback submission is exposed through `MockSlack.handle(command, payload)` because feedback is structured rather than encoded into a fragile command string:

```js
const { createSystem } = require('./index');
const system = createSystem();

system.slack.handle('/agent-a submit-feedback', {
  source: 'PM',
  targetSection: 'How to schedule reports',
  comment: 'Make retry timing explicit.',
  severity: 'high',
  suggestedChange: 'Call out the 5-minute and 15-minute retry delays.',
  status: 'applied'
});

system.slack.handle('/agent-a regenerate-docs');
```

Valid sources are `PM`, `Customer Support`, and `QA`. Valid statuses are `open`, `applied`, and `rejected`. Only `applied` feedback changes regenerated documentation. All records remain in history, and repeated applied suggestions are counted as learned preferences.

## Agent B Q&A

Agent B must synchronize the latest sources before answering:

```js
system.slack.handle('/agent-b sync-knowledge');
console.log(system.slack.handle('/agent-b ask "What formats are supported?"').message);
```

Every successful answer includes a citation such as:

```text
Sources: docs/scheduled-compliance-reports.md#What formats are supported?
```

Supported local mock commands are:

```text
/agent-a generate-docs <prd_file>
/agent-a submit-feedback
/agent-a regenerate-docs [prd_file]
/agent-b sync-knowledge [prd_file]
/agent-b ask <question>
```

## Mock Jira

The `MockJira` adapter supports:

- `createDocumentationTask(summary)`
- `attachGeneratedDocs(taskKey, filePath)`
- `addFeedbackComment(taskKey, comment)`
- `updateTaskStatus(taskKey, status)`

State is persisted locally in `store/jira.json`.

## Tests

```bash
cd doc-agent-system
npm test
```

The suite covers markdown PRD parsing, documentation generation, feedback persistence, feedback-based regeneration, knowledge-base creation and backlinks, Slack command handling, and Q&A citations.
