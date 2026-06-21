const fs = require('fs');
const path = require('path');
const { KnowledgeBase } = require('../lib/knowledgeBase');
const openRouter = require('../utils/openRouterAgent');
const { VersionStore, safeVersion } = require('../lib/versionStore');
const { snapshotMarkdown, snapshotFigma, diffSections, affectedDocSections, isGlobalChange, matchFigmaScreens } = require('../lib/changeMonitor');
const { splitDocument, sectionMap } = require('../lib/docSections');

class AgentB {
  constructor({ knowledgeRoot, modelClient = openRouter } = {}) { this.kb = new KnowledgeBase(knowledgeRoot || path.join(__dirname, '..', 'knowledge_base')); this.modelClient = modelClient; this.versions = new VersionStore(this.kb.root); }
  sync(prd, docsMarkdown, feedback) { return this.kb.sync(prd, docsMarkdown, feedback); }
  diffLatestPrdVersions() {
    const versions = this.versions.list('prd');
    if (versions.length < 2) return { fromVersion: versions[0]?.version || null, toVersion: versions[0]?.version || null, sections: [], changedSections: [], message: 'At least two indexed PRD versions are required.' };
    const previous = versions.at(-2); const current = versions.at(-1); const diff = diffSections(previous, current);
    return { ...diff, fromVersion: previous.version, toVersion: current.version };
  }
  status(feedbackCount = 0) {
    const latestPrd = this.versions.latest('prd');
    const docs = fs.readdirSync(path.join(this.kb.root, 'docs')).filter((name) => /^scheduled-compliance-reports-.+\.md$/.test(name)).map((name) => ({ name, modified: fs.statSync(path.join(this.kb.root, 'docs', name)).mtimeMs })).sort((a, b) => b.modified - a.modified);
    const faqFile = path.join(this.kb.root, 'qa', 'faq_index.json'); const faq = fs.existsSync(faqFile) ? JSON.parse(fs.readFileSync(faqFile, 'utf8')) : [];
    return { latestPrdVersion: latestPrd?.version || 'not indexed', latestDocumentationVersion: docs[0]?.name.match(/reports-(.+)\.md$/)?.[1] || latestPrd?.version || 'not indexed', knowledgeBaseStatus: fs.existsSync(path.join(this.kb.root, 'prd', 'index.md')) ? 'synchronized' : 'not synchronized', feedbackCount, staleFaqCount: faq.filter((item) => item.status === 'stale').length };
  }
  async processUpload({ prdFile, figmaFile, source, uploadedBy, version, agentA, slack }) {
    const metadata = { version, source, uploadedBy };
    const previous = this.versions.latest('prd'); const previousFigma = this.versions.latest('figma'); const current = snapshotMarkdown(prdFile, metadata); const diff = diffSections(previous, current);
    this.versions.save('prd', current);
    let figmaSnapshot = null;
    let figmaDiff = { sections: [], changedSections: [], added: [], removed: [], modified: [], unchanged: [] };
    if (figmaFile) { figmaSnapshot = snapshotFigma(figmaFile, metadata); figmaDiff = diffSections(previousFigma, figmaSnapshot); this.versions.save('figma', figmaSnapshot); }
    const currentDocFile = path.join(agentA.docsDir, 'scheduled-compliance-reports.md');
    const existingMarkdown = fs.existsSync(currentDocFile) ? fs.readFileSync(currentDocFile, 'utf8') : '';
    if (!previous || !existingMarkdown) {
      const generated = await agentA.regenerate(prdFile, currentDocFile); const headings = splitDocument(generated.markdown).sections.map((section) => section.heading);
      this.saveAgentDocVersion(agentA, version, generated.markdown);
      this.sync(generated.prd, generated.markdown, agentA.feedback.read());
      const graph = this.kb.indexDocumentVersion({ version, newMarkdown: generated.markdown, regeneratedSections: headings });
      const post = slack.postAlert(`PRD baseline indexed (${version}) from ${source}.`);
      return { baseline: true, threadTs: post.threadTs, diff, figmaDiff, generated, graph, summary: post.message };
    }
    const changeEvents = [...diff.changedSections.map((item) => ({ ...item, sourceType: 'PRD' })), ...figmaDiff.changedSections.map((item) => ({ ...item, sourceType: 'Figma' }))];
    if (!changeEvents.length) { const post = slack.postAlert(`No PRD or Figma content changes detected for ${version}.`); return { baseline: false, noChanges: true, threadTs: post.threadTs, diff, figmaDiff, summary: post.message }; }
    let threadTs = null;
    for (const change of changeEvents) {
      const verb = change.changeType === 'modified' ? 'changed' : change.changeType;
      const message = `${change.sourceType} updated: ${change.heading} section ${verb} (${previous.version} → ${version}). Regenerating affected documentation.`;
      const post = slack.postAlert(message, threadTs); threadTs ||= post.threadTs;
    }
    const availableHeadings = splitDocument(existingMarkdown).sections.map((section) => section.heading);
    const affectedSections = isGlobalChange(diff.changedSections) ? availableHeadings : affectedDocSections(changeEvents, availableHeadings);
    const activeFeedback = agentA.feedback.accepted(); const activeRules = agentA.feedback.preferences(); const figmaScreens = matchFigmaScreens(changeEvents, figmaSnapshot);
    const existingSections = sectionMap(existingMarkdown);
    const signal = { prdFile, version, oldVersion: previous.version, changedSections: changeEvents, affectedSections, activeFeedback, activeRules, figmaScreens, existingDocumentationSections: Object.fromEntries(affectedSections.map((heading) => [heading, existingSections.get(heading)])), existingMarkdown };
    let generated;
    if (isGlobalChange(diff.changedSections)) generated = await agentA.regenerate(prdFile, currentDocFile);
    else generated = await agentA.regenerateSections(signal);
    this.saveAgentDocVersion(agentA, version, generated.markdown);
    const regeneratedSections = generated.regeneratedSections || availableHeadings;
    for (const heading of regeneratedSections) slack.postReply(threadTs, `Revised documentation section (${version}):\n\n${sectionMap(generated.markdown).get(heading) || heading}`);
    this.sync(generated.prd, generated.markdown, agentA.feedback.read());
    const graph = this.kb.indexDocumentVersion({ version, oldVersion: previous.version, oldMarkdown: existingMarkdown, newMarkdown: generated.markdown, regeneratedSections });
    const staleFaqCount = graph.faq.filter((item) => item.status === 'stale' && item.staleSince === version).length;
    const summary = `Documentation updated. ${regeneratedSections.length} section${regeneratedSections.length === 1 ? '' : 's'} regenerated. ${staleFaqCount} FAQ${staleFaqCount === 1 ? '' : 's'} marked stale — review needed.`;
    slack.postReply(threadTs, summary);
    return { baseline: false, threadTs, diff, figmaDiff, signal, generated, graph, summary };
  }
  saveAgentDocVersion(agentA, version, markdown) { const directory = path.join(agentA.docsDir, 'versions'); fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, `scheduled-compliance-reports-${safeVersion(version)}.md`), markdown); }
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
