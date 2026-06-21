const fs = require('fs');
const path = require('path');
const { KnowledgeBase } = require('../lib/knowledgeBase');
const openRouter = require('../utils/openRouterAgent');

class AgentB {
  constructor({ knowledgeRoot, modelClient = openRouter } = {}) { this.kb = new KnowledgeBase(knowledgeRoot || path.join(__dirname, '..', 'knowledge_base')); this.modelClient = modelClient; }
  sync(prd, docsMarkdown, feedback) { return this.kb.sync(prd, docsMarkdown, feedback); }
  async answerQuestion(question) {
    if (process.env.DOCS_AGENT_REQUIRE_AI === 'true' && !this.modelClient.configured()) throw new Error('OPENROUTER_API_KEY is required when DOCS_AGENT_REQUIRE_AI=true');
    try {
      if (this.modelClient.configured()) {
        const searchedSources = new Set();
        const searchTool = await this.modelClient.knowledgeSearchTool((query, limit) => {
          const results = this.kb.search(query, limit); results.forEach((item) => searchedSources.add(item.source)); return results;
        });
        const text = await this.modelClient.runAgent({
          instructions: 'You are Agent B, a grounded product knowledge agent. Call search_knowledge_base before answering. Use only returned evidence; never invent facts. Return ONLY JSON with shape {"answer":"concise answer","citations":["file#section"]}. Every citation must exactly match a returned source identifier. If evidence is insufficient, say so and return an empty citations array.',
          input: `Answer this Slack question: ${question}`,
          tools: [searchTool], maxOutputTokens: 1800, sessionId: `agent-b-${Date.now()}`
        });
        const result = JSON.parse(text);
        const citations = Array.isArray(result.citations) ? result.citations.filter((citation) => searchedSources.has(citation)) : [];
        if (result.answer && citations.length) { this.writeQa(question, result.answer, citations, 'openrouter-agent'); return { answer: result.answer, citations, mode: 'openrouter-agent' }; }
      }
    } catch (error) {
      if (process.env.OPENROUTER_STRICT === 'true') throw error;
      console.warn(`Agent B OpenRouter call failed; using deterministic fallback: ${error.message}`);
    }
    return { ...this.kb.ask(question), mode: 'deterministic-fallback' };
  }
  writeQa(question, answer, citations, mode) {
    const file = path.join(this.kb.root, 'qa', `${Date.now()}.md`);
    fs.writeFileSync(file, `# Q&A\n\nMode: ${mode}\n\nQuestion: ${question}\n\nAnswer: ${answer}\n\nSources: ${citations.map((item) => `[[${item}]]`).join(', ')}\n`);
  }
}

module.exports = { AgentB };
