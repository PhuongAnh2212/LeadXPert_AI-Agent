const fs = require('fs');
const path = require('path');
const { ingestPrd } = require('../lib/prdParser');
const { FeedbackStore } = require('../lib/feedbackStore');
const { generateDocumentation, saveDocumentation } = require('../lib/documentGenerator');
const { ingestDesign } = require('../lib/designParser');
const openRouter = require('../utils/openRouterAgent');
const { sectionMap, replaceSections } = require('../lib/docSections');
const { safeVersion } = require('../lib/versionStore');

const requiredHeadings = ['Overview', 'Who this feature is for', 'How to create a report template', 'How to schedule reports', 'How to configure email delivery', 'How to download generated reports', 'Report retention and audit trail', 'FAQ', 'Known limitations / out-of-scope items'];

class AgentA {
  constructor({ dataDir, docsDir, designFiles = [], modelClient = openRouter } = {}) {
    this.dataDir = dataDir || path.join(__dirname, '..', 'store');
    this.docsDir = docsDir || path.join(__dirname, '..', 'generated_docs');
    this.feedback = new FeedbackStore(path.join(this.dataDir, 'feedback.json'));
    this.designFiles = designFiles; this.modelClient = modelClient;
  }
  ingest(prdFile) {
    const prd = ingestPrd(prdFile); prd.designInputs = this.designFiles.map(ingestDesign);
    const output = path.join(this.dataDir, 'prd-structured.json'); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(prd, null, 2)}\n`); return prd;
  }
  async generate(prdFile, outputFile = path.join(this.docsDir, 'scheduled-compliance-reports.md')) { return this.create(prdFile, outputFile, []); }
  submitFeedback(input) { return this.feedback.submit(input); }
  async regenerate(prdFile, outputFile = path.join(this.docsDir, 'scheduled-compliance-reports.md')) { return this.create(prdFile, outputFile, this.feedback.accepted()); }
  async regenerateSections(request) {
    this.lastPartialRequest = request;
    const { prdFile, version, changedSections, affectedSections, existingMarkdown, figmaScreens = [], activeFeedback = [], activeRules = [] } = request;
    const prd = this.ingest(prdFile); const existing = sectionMap(existingMarkdown); const replacements = new Map(); const preferences = this.feedback.preferences(); let aiSections = 0;
    if (process.env.DOCS_AGENT_REQUIRE_AI === 'true' && !this.modelClient.configured()) throw new Error('OPENROUTER_API_KEY is required when DOCS_AGENT_REQUIRE_AI=true');
    const applicableFeedback = activeFeedback.filter((item) => item.status === 'applied' && (affectedSections.includes(item.targetSection) || /global|all docs|every section/i.test(`${item.targetSection} ${item.comment} ${item.suggestedChange}`)));
    const freshFallback = sectionMap(generateDocumentation(prd, applicableFeedback));
    for (const heading of affectedSections) {
      const oldSection = existing.get(heading); if (!oldSection) continue;
      let revised = null;
      if (this.modelClient.configured()) {
        try {
          let sourceRead = false;
          const bundle = { prd, changedSections, targetDocumentationSection: heading, existingDocumentationSection: oldSection, acceptedFeedback: applicableFeedback, activeRules, learnedPreferences: preferences, matchedFigmaScreens: figmaScreens };
          const sourceTool = await this.modelClient.sourceBundleTool(bundle, () => { sourceRead = true; });
          revised = await this.modelClient.runAgent({
            instructions: `You are Agent A performing a surgical documentation update. Call get_source_bundle. Rewrite ONLY the H2 section named "${heading}" using the changed PRD/design evidence and applicable feedback. Return exactly one H2 Markdown section beginning "## ${heading}". Preserve facts and citations that remain valid.`,
            input: `Regenerate only the affected documentation section: ${heading}`,
            tools: [sourceTool], maxOutputTokens: 2500, sessionId: `agent-a-change-${safeVersion(version)}-${heading}`
          });
          if (!sourceRead || !revised?.startsWith(`## ${heading}`)) revised = null; else aiSections += 1;
        } catch (error) {
          if (process.env.OPENROUTER_STRICT === 'true') throw error;
          console.warn(`Agent A partial OpenRouter call failed for ${heading}: ${error.message}`);
        }
      }
      if (!revised) {
        const base = (freshFallback.get(heading) || oldSection).trimEnd();
        const evidence = changedSections.map((change) => `- **${change.heading}** (${change.changeType}): ${String(change.newContent || 'Section removed from the PRD.').replace(/\s+/g, ' ').slice(0, 500)}`).join('\n');
        const designs = figmaScreens.length ? `\n\nMatched design screens: ${figmaScreens.map((screen) => screen.screen).join(', ')}.` : '';
        revised = `${base}\n\n### Change-aware update\n\n${evidence}${designs}\n`;
      }
      replacements.set(heading, revised.endsWith('\n') ? `${revised}\n` : `${revised}\n\n`);
    }
    const markdown = replaceSections(existingMarkdown, replacements);
    const versionDir = path.join(this.docsDir, 'versions'); fs.mkdirSync(versionDir, { recursive: true });
    const outputFile = path.join(versionDir, `scheduled-compliance-reports-${safeVersion(version)}.md`); saveDocumentation(markdown, outputFile);
    saveDocumentation(markdown, path.join(this.docsDir, 'scheduled-compliance-reports.md'));
    const mode = aiSections === replacements.size && replacements.size ? 'openrouter-agent' : aiSections ? 'hybrid-fallback' : 'deterministic-fallback';
    return { prd, markdown, outputFile, regeneratedSections: [...replacements.keys()], revisedSections: Object.fromEntries(replacements), preferences, mode };
  }
  async create(prdFile, outputFile, acceptedFeedback) {
    const prd = this.ingest(prdFile); const preferences = this.feedback.preferences();
    if (process.env.DOCS_AGENT_REQUIRE_AI === 'true' && !this.modelClient.configured()) throw new Error('OPENROUTER_API_KEY is required when DOCS_AGENT_REQUIRE_AI=true');
    let markdown = null; let mode = 'deterministic-fallback';
    try {
      if (this.modelClient.configured()) {
        const bundle = { prd, designInputs: prd.designInputs || [], acceptedFeedback, learnedPreferences: preferences };
        let sourceRead = false;
        const sourceTool = await this.modelClient.sourceBundleTool(bundle, () => { sourceRead = true; });
        markdown = await this.modelClient.runAgent({
          instructions: `You are Agent A, an expert product documentation agent. You MUST call get_source_bundle before writing. Create accurate user-facing Markdown using only supplied sources. Apply every accepted feedback item and repeated preference when relevant. Include wiki-link citations such as [[FR-01]], [[AC-04]], and [[FB-001]]. Do not describe the PRD as a product implementation. Required H2 sections, in order: ${requiredHeadings.join('; ')}. Return only the complete Markdown document.`,
          input: 'Generate the complete user guide from the available PRD, design inputs, feedback, and learned preferences.',
          tools: [sourceTool], maxOutputTokens: 7000, sessionId: `agent-a-${Date.now()}`
        });
        if (sourceRead && markdown && requiredHeadings.every((heading) => markdown.includes(`## ${heading}`))) mode = 'openrouter-agent';
        else markdown = null;
      }
    } catch (error) {
      if (process.env.OPENROUTER_STRICT === 'true') throw error;
      console.warn(`Agent A OpenRouter call failed; using deterministic fallback: ${error.message}`);
    }
    markdown ||= generateDocumentation(prd, acceptedFeedback);
    saveDocumentation(markdown, outputFile);
    return { prd, markdown, outputFile, preferences, mode };
  }
}

module.exports = { AgentA, requiredHeadings };
