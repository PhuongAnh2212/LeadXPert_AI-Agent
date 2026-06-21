const path = require('path');
const { KnowledgeBase } = require('../lib/knowledgeBase');

class AgentB {
  constructor({ knowledgeRoot } = {}) { this.kb = new KnowledgeBase(knowledgeRoot || path.join(__dirname, '..', 'knowledge_base')); }
  sync(prd, docsMarkdown, feedback) { return this.kb.sync(prd, docsMarkdown, feedback); }
  answerQuestion(question) { return this.kb.ask(question); }
}

module.exports = { AgentB };
