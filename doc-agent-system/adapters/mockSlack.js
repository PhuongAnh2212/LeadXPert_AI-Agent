const path = require('path');

function tokenize(input) { return input.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, '')) || []; }

class MockSlack {
  constructor({ agentA, agentB, defaultPrd }) { this.agentA = agentA; this.agentB = agentB; this.defaultPrd = defaultPrd; this.last = null; }
  async handle(command, payload = {}) {
    const args = tokenize(command.trim()); const namespace = args.shift(); const action = args.shift();
    if (namespace === '/agent-a' && action === 'generate-docs') { this.last = await this.agentA.generate(path.resolve(args[0] || this.defaultPrd)); return { message: `Agent A generated ${this.last.outputFile} (${this.last.mode})`, data: this.last }; }
    if (namespace === '/agent-a' && action === 'submit-feedback') { const item = this.agentA.submitFeedback(payload); return { message: `Feedback ${item.id} submitted`, data: item }; }
    if (namespace === '/agent-a' && action === 'regenerate-docs') { this.last = await this.agentA.regenerate(path.resolve(args[0] || this.defaultPrd)); return { message: `Agent A regenerated ${this.last.outputFile} (${this.last.mode})`, data: this.last }; }
    if (namespace === '/agent-b' && action === 'sync-knowledge') { if (!this.last) this.last = await this.agentA.regenerate(path.resolve(args[0] || this.defaultPrd)); const data = this.agentB.sync(this.last.prd, this.last.markdown, this.agentA.feedback.read()); return { message: `Agent B synced ${data.root}`, data }; }
    if (namespace === '/agent-b' && action === 'ask') { const data = await this.agentB.answerQuestion(args.join(' ')); return { message: `${data.answer}\nSources: ${data.citations.join(', ')}\nMode: ${data.mode}`, data }; }
    throw new Error(`Unknown mock Slack command: ${command}`);
  }
}

module.exports = { MockSlack, tokenize };
