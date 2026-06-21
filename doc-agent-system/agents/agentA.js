const path = require('path');
const { ingestPrd } = require('../lib/prdParser');
const { FeedbackStore } = require('../lib/feedbackStore');
const { generateDocumentation, saveDocumentation } = require('../lib/documentGenerator');
const { ingestDesign } = require('../lib/designParser');

class AgentA {
  constructor({ dataDir, docsDir, designFiles = [] } = {}) {
    this.dataDir = dataDir || path.join(__dirname, '..', 'store');
    this.docsDir = docsDir || path.join(__dirname, '..', 'generated_docs');
    this.feedback = new FeedbackStore(path.join(this.dataDir, 'feedback.json'));
    this.designFiles = designFiles;
  }
  ingest(prdFile) {
    const prd = ingestPrd(prdFile);
    prd.designInputs = this.designFiles.map(ingestDesign);
    const output = path.join(this.dataDir, 'prd-structured.json');
    require('fs').mkdirSync(path.dirname(output), { recursive: true }); require('fs').writeFileSync(output, `${JSON.stringify(prd, null, 2)}\n`);
    return prd;
  }
  generate(prdFile, outputFile = path.join(this.docsDir, 'scheduled-compliance-reports.md')) {
    const prd = this.ingest(prdFile); const markdown = generateDocumentation(prd, []); saveDocumentation(markdown, outputFile); return { prd, markdown, outputFile };
  }
  submitFeedback(input) { return this.feedback.submit(input); }
  regenerate(prdFile, outputFile = path.join(this.docsDir, 'scheduled-compliance-reports.md')) {
    const prd = this.ingest(prdFile); const markdown = generateDocumentation(prd, this.feedback.accepted()); saveDocumentation(markdown, outputFile); return { prd, markdown, outputFile, preferences: this.feedback.preferences() };
  }
}

module.exports = { AgentA };
