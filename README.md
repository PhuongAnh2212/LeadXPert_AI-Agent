# Agent A + Agent B Documentation System

This repository implements a two-agent product-documentation workflow powered by the official OpenRouter Agent SDK:

- **Agent A** ingests a markdown PRD, stores structured PRD data, generates a user-facing markdown guide, accepts PM/Customer Support/QA feedback, and regenerates the guide from applied feedback.
- **Agent B** synchronizes the PRD, generated guide, and feedback history into an Obsidian-style markdown knowledge base and answers Slack-style questions with file/section citations.
- **Slack and Jira Cloud adapters** provide production human-agent interfaces, with a local Slack adapter for credential-free development.

## Important project boundary

[`sample-prd-scheduled-compliance-reports.md`](/Users/pdpa/Desktop/LeadXPert_AI-Agent/samplePRD/sample-prd-scheduled-compliance-reports.md) is sample input data. This project does **not** implement Scheduled Compliance Reports. The actual product is the documentation-agent system in [`doc-agent-system`](/Users/pdpa/Desktop/LeadXPert_AI-Agent/doc-agent-system).

The old compliance-product prototype under `samplePRD/app/` is not part of the Agent A/B runtime or demo.

Optional design inputs are accepted as markdown or JSON through `createSystem({ designFiles: [...] })`; Agent A stores them with the structured source data and Agent B indexes them as design notes under `knowledge_base/prd/`.

## Quick start

Requires Node.js 18 or newer.

```bash
cd doc-agent-system
npm install
cp .env.example .env
# Replace OPENROUTER_API_KEY with a real key
npm run demo:ai
```

`demo:ai` fails fast unless a real `OPENROUTER_API_KEY` is configured. It performs PRD ingestion, OpenRouter Agent A generation, applied PM feedback, AI regeneration, knowledge sync, OpenRouter Agent B Q&A with citations, and Jira task completion. Set `OPENROUTER_MODEL` to any compatible OpenRouter model; the default is `openai/gpt-5-nano`.

For credential-free development, `npm run demo` uses the same workflow with deterministic fallbacks. Every Slack response prints `Mode: openrouter-agent` or `Mode: deterministic-fallback`, so execution mode is never hidden.

Generated runtime artifacts are written to:

- `doc-agent-system/store/prd-structured.json`
- `doc-agent-system/store/feedback.json`
- `doc-agent-system/store/jira-current.json` (latest Jira issue reference)
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

await system.slack.handle('/agent-a submit-feedback', {
  source: 'PM',
  targetSection: 'How to schedule reports',
  comment: 'Make retry timing explicit.',
  severity: 'high',
  suggestedChange: 'Call out the 5-minute and 15-minute retry delays.',
  status: 'applied'
});

await system.slack.handle('/agent-a regenerate-docs');
```

Valid sources are `PM`, `Customer Support`, and `QA`. Valid statuses are `open`, `applied`, and `rejected`. Only `applied` feedback changes regenerated documentation. All records remain in history, and repeated applied suggestions are counted as learned preferences.

## Agent B Q&A

Agent B must synchronize the latest sources before answering:

```js
await system.slack.handle('/agent-b sync-knowledge');
console.log((await system.slack.handle('/agent-b ask "What formats are supported?"')).message);
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

## Jira Cloud integration

Agent A creates a Jira `Task` named `Documentation Review - {document_name}` after generating a guide and attaches the generated Markdown. Slack feedback is copied to the active issue as a Jira comment. Regeneration moves the issue through `In Progress` and `Review`; knowledge synchronization moves it to `Done`.

### 1. Configure Jira

1. Create an API token from your Atlassian account security settings.
2. Ensure the Jira user can browse and create issues, add attachments and comments, and transition issues in the target project.
3. Add these values to `doc-agent-system/.env`:

```dotenv
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-api-token
JIRA_PROJECT_KEY=DOC
```

The adapter uses Jira Cloud REST API v3 with email/API-token basic authentication. Issue descriptions and comments use Atlassian Document Format. Workflow transition IDs are discovered at runtime, so no numeric transition IDs are stored in configuration. The project workflow must expose the statuses `To Do`, `In Progress`, `Review`, and `Done`.

### 2. Use the integrated workflow

Run the Slack server, then generate documentation normally:

```bash
npm run slack
```

```text
/agent-a generate-docs sample-prd-scheduled-compliance-reports.md
/agent-a submit-feedback section="FAQ" severity="high" comment="Clarify formats"
/agent-a regenerate-docs
/agent-b sync-knowledge
/agent-b jira-status
```

`/agent-b jira-status` returns the active issue key, current status, and Jira's last-updated timestamp. The active issue reference is persisted locally in `store/jira-current.json`; Jira remains the source of truth for issue state.

## Real Slack integration

The production Slack entry point is an Express server backed by Slack's Web API. It exposes:

```text
GET  /health
POST /mock-response
POST /slack/commands
POST /slack/events
```

Slack request timestamps and HMAC signatures are verified with `SLACK_SIGNING_SECRET`. Slash commands are acknowledged immediately; completed AI results are delivered asynchronously through Slack's `response_url`, avoiding Slack's three-second command timeout.

### 1. Create and configure the Slack app

1. Create an app at [api.slack.com/apps](https://api.slack.com/apps) and select the target workspace.
2. Under **OAuth & Permissions**, add these bot token scopes:
   - `commands`
   - `chat:write`
   - `files:read`
   - `app_mentions:read`
3. Install or reinstall the app and copy the `xoxb-...` bot token.
4. Copy the signing secret from **Basic Information > App Credentials**.
5. Make the local server reachable through an HTTPS tunnel or deploy it to a public HTTPS host.

### 2. Configure environment variables

```bash
cd doc-agent-system
cp .env.example .env
```

Set at least:

```dotenv
SLACK_BOT_TOKEN=xoxb-your-real-token
SLACK_SIGNING_SECRET=your-real-signing-secret
PORT=3000
```

Agent A and Agent B also use `OPENROUTER_API_KEY` when AI mode is enabled.

### 3. Register slash commands

Create two slash commands in **Slash Commands**:

| Command | Request URL |
|---|---|
| `/agent-a` | `https://YOUR_HOST/slack/commands` |
| `/agent-b` | `https://YOUR_HOST/slack/commands` |

Supported command text:

```text
/agent-a generate-docs [prd_file]
/agent-a regenerate-docs [prd_file]
/agent-a submit-feedback source="PM" section="FAQ" severity="high" status="applied" comment="Clarify formats" suggested="Name PDF and CSV"
/agent-b ask <question>
/agent-b sync-knowledge [prd_file]
/agent-b diff-prd
/agent-b status
/agent-b jira-status
/agent-a help
/agent-b help
```

Examples and completed responses:

```text
/agent-a generate-docs sample-prd-scheduled-compliance-reports.md
→ Agent A started documentation generation.
→ Agent A completed documentation generation.
  Documentation saved to .../generated_docs/sample-prd-scheduled-compliance-reports.md

/agent-a regenerate-docs
→ Agent A regenerated documentation.
  Affected sections: FAQ, How to schedule reports

/agent-a submit-feedback section="How to schedule reports" severity=high comment="Add timezone examples"
→ Feedback stored.
  Feedback ID: FB-XXX

/agent-b ask How long are reports retained?
→ Answer text
  Sources: docs/scheduled-compliance-reports.md#Report retention and audit trail

/agent-b sync-knowledge
→ Knowledge base synchronized.
  Updated nodes: X
  Updated edges: Y

/agent-b diff-prd
→ Changed sections detected between latest PRD versions (v1.2 → v1.3).
  • Recurring Schedule (modified)

/agent-b status
→ Latest PRD version: v1.3
  Latest documentation version: v1.3
  Knowledge base status: synchronized
  Feedback count: 3
  FAQ stale count: 1
```

`prd_file` must be readable by the server. Alternatively, upload a `.md` or `.markdown` PRD to Slack and subscribe to `file_shared`; Agent A downloads it with the bot token and generates documentation.

### 4. Configure Events API

Enable **Event Subscriptions** and set the request URL to:

```text
https://YOUR_HOST/slack/events
```

Subscribe to these bot events:

- `app_mention` — asks Agent B a threaded question
- `file_shared` — ingests uploaded Markdown PRDs

The endpoint supports Slack URL verification and deduplicates retried `event_id` values in process memory.

### 5. Start the server

```bash
npm run slack
```

The server listens on port `3000` by default. Verify it with:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{"status":"ok","service":"ai-documentation-slack"}
```

### Local slash-command testing

Signature verification remains enabled by default. For local-only `curl` testing, opt into the development bypass when starting the server:

```bash
DEV_DISABLE_SLACK_SIGNATURE=true npm run slack
```

The server prints a warning whenever this bypass is active. In another terminal, send a local slash command and point its asynchronous response back to the mock response endpoint:

```bash
curl -i -X POST http://localhost:3000/slack/commands \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "command=/agent-a&text=help&user_id=U123&channel_id=C123&response_url=http://localhost:3000/mock-response"
```

The command request returns immediately. `POST /mock-response` then logs the final JSON payload and returns HTTP `200 OK`. Never set `DEV_DISABLE_SLACK_SIGNATURE=true` in a deployed environment.

The credential-free local adapter used by tests and demos remains in `adapters/localSlack.js`; production HTTP traffic uses `adapters/mockSlack.js`, which now contains the real Slack Web API adapter.

## Change-aware PRD and Figma monitoring

The mock upload watcher accepts `{ prdFile, figmaFile?, source, uploaded_by, version }`, where `source` is `slack` or `shared_drive`. Agent B stores immutable snapshots and hashes under:

- `knowledge_base/versions/prd/`
- `knowledge_base/versions/figma/`

It compares normalized content by heading, posts one Slack alert per added/modified/removed section, maps changes to affected guide sections, and sends only those sections—plus applicable feedback, existing documentation, and matched Figma screens—to Agent A. Unchanged H2 sections are preserved byte-for-byte.

Updated guide versions are stored in `generated_docs/versions/`. Supersedes relationships are written to `knowledge_base/graph/edges.json`; FAQ freshness is maintained in `knowledge_base/qa/faq_index.json`.

Run the end-to-end change demo:

```bash
npm run demo:change
```

The demo indexes v1.2, uploads a changed v1.3 PRD and Figma export, prints the mock Slack alerts, performs partial regeneration, updates the graph, and prints the PM summary.

## Tests

```bash
cd doc-agent-system
npm test
```

The suite covers markdown PRD parsing, documentation generation, feedback persistence, feedback-based regeneration, knowledge-base creation and backlinks, Slack command handling, and Q&A citations.

## How the AI agents work

- Agent A uses an OpenRouter multi-turn agent with a `get_source_bundle` tool. The tool supplies parsed PRD sections, optional design inputs, accepted feedback, and accumulated preferences. The model writes the guide and source backlinks.
- Agent B uses a `search_knowledge_base` tool. The model searches indexed notes, answers only from returned evidence, and returns citations that are validated against actual search results before being shown in Slack.
- `DOCS_AGENT_REQUIRE_AI=true` prevents fallback execution. `OPENROUTER_STRICT=true` surfaces API/provider failures rather than replacing them with local output.
