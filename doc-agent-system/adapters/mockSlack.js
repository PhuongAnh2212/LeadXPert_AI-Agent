const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { WebClient } = require('@slack/web-api');

function tokenize(input = '') { return input.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) || []; }

function parseFeedback(text) {
  const trimmed = String(text || '').trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const fields = {};
  const pattern = /(source|section|targetSection|severity|status|comment|suggested|suggestedChange)=("[^"]*"|'[^']*'|\S+)/g;
  for (const match of trimmed.matchAll(pattern)) fields[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  return { source: fields.source, targetSection: fields.targetSection || fields.section, severity: fields.severity, status: fields.status, comment: fields.comment, suggestedChange: fields.suggestedChange || fields.suggested };
}

class SlackAdapter {
  constructor({ agentA, agentB, defaultPrd, token = process.env.SLACK_BOT_TOKEN, client, fetchImpl = global.fetch, uploadDir } = {}) {
    this.agentA = agentA; this.agentB = agentB; this.defaultPrd = defaultPrd; this.last = null;
    this.token = token; this.client = client || new WebClient(token); this.fetchImpl = fetchImpl;
    this.uploadDir = uploadDir || path.join(__dirname, '..', 'store', 'slack-uploads'); fs.mkdirSync(this.uploadDir, { recursive: true });
  }
  async execute(command, text, context = {}) {
    const args = tokenize(text); const action = args.shift(); const remainder = args.join(' ');
    if (action === 'help' || !action) return this.help(command);
    if (command === '/agent-a' && action === 'generate-docs') {
      const prdFile = this.resolvePrdFile(remainder || this.defaultPrd); const outputFile = path.join(this.agentA.docsDir, path.basename(prdFile).replace(/\.markdown$/i, '.md'));
      this.last = await this.agentA.generate(prdFile, outputFile);
      return `Agent A completed documentation generation.\nDocumentation saved to ${this.last.outputFile}\nMode: ${this.last.mode}`;
    }
    if (command === '/agent-a' && action === 'regenerate-docs') {
      const prdFile = this.resolvePrdFile(remainder || this.last?.prd?.sourceFile || this.defaultPrd); const outputFile = this.last?.outputFile || path.join(this.agentA.docsDir, path.basename(prdFile).replace(/\.markdown$/i, '.md'));
      this.last = await this.agentA.regenerate(prdFile, outputFile);
      const affected = [...new Set(this.agentA.feedback.accepted().map((item) => item.targetSection))];
      return `Agent A regenerated documentation.\nAffected sections: ${affected.length ? affected.join(', ') : 'all generated sections'}\nDocumentation saved to ${this.last.outputFile}\nMode: ${this.last.mode}`;
    }
    if (command === '/agent-a' && action === 'submit-feedback') {
      const feedback = parseFeedback(String(text).replace(/^submit-feedback\s*/i, ''));
      feedback.source ||= 'PM'; feedback.status ||= 'open'; feedback.suggestedChange ||= feedback.comment;
      if (!feedback.targetSection || !feedback.severity || !feedback.comment) throw new Error('Usage: /agent-a submit-feedback section="Section name" severity=high comment="Feedback text"');
      const item = this.agentA.submitFeedback(feedback); return `Feedback stored.\nFeedback ID: ${item.id}`;
    }
    if (command === '/agent-b' && action === 'ask') {
      if (!remainder) throw new Error('Usage: /agent-b ask <question>');
      const result = await this.agentB.answerQuestion(remainder);
      return `${result.answer}\n\nSources: ${result.citations.join(', ') || 'No grounded source'}\nMode: ${result.mode}`;
    }
    if (command === '/agent-b' && action === 'sync-knowledge') {
      if (remainder || !this.last) this.last = await this.agentA.regenerate(this.resolvePrdFile(remainder || this.defaultPrd));
      const result = this.agentB.sync(this.last.prd, this.last.markdown, this.agentA.feedback.read());
      return `Knowledge base synchronized.\nUpdated nodes: ${result.updatedNodes}\nUpdated edges: ${result.updatedEdges}`;
    }
    if (command === '/agent-b' && action === 'diff-prd') {
      const diff = this.agentB.diffLatestPrdVersions();
      if (diff.message) return `Changed sections detected between latest PRD versions.\n${diff.message}`;
      const changed = diff.changedSections.map((item) => `• ${item.heading} (${item.changeType})`).join('\n') || 'No changed sections.';
      return `Changed sections detected between latest PRD versions (${diff.fromVersion} → ${diff.toVersion}).\n${changed}`;
    }
    if (command === '/agent-b' && action === 'status') {
      const status = this.agentB.status(this.agentA.feedback.read().length);
      return `Latest PRD version: ${status.latestPrdVersion}\nLatest documentation version: ${status.latestDocumentationVersion}\nKnowledge base status: ${status.knowledgeBaseStatus}\nFeedback count: ${status.feedbackCount}\nFAQ stale count: ${status.staleFaqCount}`;
    }
    throw new Error(this.usage(command));
  }
  acknowledgement(command, text) {
    const action = tokenize(text)[0];
    if (command === '/agent-a' && action === 'generate-docs') return 'Agent A started documentation generation.';
    if (command === '/agent-a' && action === 'regenerate-docs') return 'Agent A started documentation regeneration.';
    return `Received ${command} ${text}. Working on it…`;
  }
  resolvePrdFile(value) {
    if (path.isAbsolute(value) && fs.existsSync(value)) return value;
    const candidates = [path.resolve(value), path.resolve(__dirname, '..', value), path.resolve(__dirname, '..', '..', 'samplePRD', value), path.resolve(path.dirname(this.defaultPrd), value)];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (!found) throw new Error(`PRD file not found: ${value}`); return found;
  }
  help(command) {
    if (command === '/agent-a') return `Agent A commands:\n• /agent-a generate-docs <prd_file>\n• /agent-a regenerate-docs [prd_file]\n• /agent-a submit-feedback section="Section" severity=high comment="Comment"\n• /agent-a help`;
    if (command === '/agent-b') return `Agent B commands:\n• /agent-b ask <question>\n• /agent-b sync-knowledge [prd_file]\n• /agent-b diff-prd\n• /agent-b status\n• /agent-b help`;
    return this.usage(command);
  }
  usage(command) {
    if (command === '/agent-a') return 'Usage: /agent-a generate-docs [prd_file] | regenerate-docs [prd_file] | submit-feedback source="PM" section="FAQ" severity="high" status="applied" comment="..." suggested="..."';
    if (command === '/agent-b') return 'Usage: /agent-b ask <question> | sync-knowledge [prd_file] | diff-prd | status | help';
    return `Unsupported Slack command: ${command}`;
  }
  async deliver(responseUrl, text, responseType = 'ephemeral') {
    if (!responseUrl) return;
    const response = await this.fetchImpl(responseUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ response_type: responseType, replace_original: false, text }) });
    if (!response.ok) throw new Error(`Slack response_url failed: ${response.status} ${await response.text()}`);
  }
  async handleEvent(payload) {
    const event = payload.event || {};
    if (event.type === 'app_mention' && event.channel) {
      const question = String(event.text || '').replace(/<@[A-Z0-9]+>/gi, '').trim();
      const result = await this.agentB.answerQuestion(question);
      await this.client.chat.postMessage({ channel: event.channel, thread_ts: event.ts, text: `${result.answer}\n\nSources: ${result.citations.join(', ') || 'No grounded source'}\nMode: ${result.mode}` });
      return;
    }
    if (event.type === 'file_shared') await this.handleSharedFile(event);
  }
  async handleSharedFile(event) {
    const info = await this.client.files.info({ file: event.file_id }); const file = info.file;
    if (!file?.url_private_download || !/\.(md|markdown)$/i.test(file.name || '')) return;
    const response = await this.fetchImpl(file.url_private_download, { headers: { authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error(`Unable to download Slack file: ${response.status}`);
    const destination = path.join(this.uploadDir, `${Date.now()}-${path.basename(file.name)}`); fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
    this.last = await this.agentA.generate(destination);
    const channel = event.channel_id || file.channels?.[0];
    if (channel) await this.client.chat.postMessage({ channel, text: `Agent A generated documentation from ${file.name}: ${this.last.outputFile} (${this.last.mode}).` });
  }
}

module.exports = { SlackAdapter, tokenize, parseFeedback, parseCommandBody: (raw) => querystring.parse(raw) };
