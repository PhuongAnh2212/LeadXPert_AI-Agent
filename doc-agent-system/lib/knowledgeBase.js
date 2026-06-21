const fs = require('fs');
const path = require('path');
const { parseSections } = require('./prdParser');
const { sectionMap } = require('./docSections');
const { hashContent } = require('./changeMonitor');
const { safeVersion } = require('./versionStore');

function ensureDirs(root) { ['prd', 'docs', 'feedback', 'qa', 'graph', 'versions/prd', 'versions/figma'].forEach((dir) => fs.mkdirSync(path.join(root, dir), { recursive: true })); }
function safe(value) { return String(value || '').replace(/[\r\n|]/g, ' ').trim(); }
function write(file, content) { fs.writeFileSync(file, `${content.trim()}\n`); return file; }

class KnowledgeBase {
  constructor(root) { this.root = root; ensureDirs(root); }
  sync(prd, docsMarkdown, feedback = []) {
    ensureDirs(this.root);
    const prdLinks = prd.requirements.map((req) => `- [[${req.id}]] — ${req.text}`).join('\n');
    write(path.join(this.root, 'prd', 'index.md'), `# ${prd.title}\n\nSource: ${prd.sourceFile}\n\n## Requirements\n\n${prdLinks}\n\n## Source sections\n\n${prd.sections.filter((s) => s.level === 2).map((s) => `- [[${s.title}]]`).join('\n')}`);
    for (const [index, design] of (prd.designInputs || []).entries()) write(path.join(this.root, 'prd', `design-input-${index + 1}.md`), `# Design input ${index + 1}\n\nSource: ${design.sourceFile}\n\n\`\`\`json\n${JSON.stringify(design.content, null, 2)}\n\`\`\``);
    for (const req of prd.requirements) {
      const acs = prd.acceptanceCriteria.filter((ac) => ac.requirementId === req.id);
      write(path.join(this.root, 'prd', `${req.id}.md`), `# ${req.id}\n\n${req.text}\n\nPriority: ${req.priority}\n\nAcceptance criteria: ${acs.map((ac) => `[[${ac.id}]]`).join(', ') || 'None'}\n\nDocument: [[scheduled-compliance-reports]]`);
    }
    for (const ac of prd.acceptanceCriteria) write(path.join(this.root, 'prd', `${ac.id}.md`), `# ${ac.id}\n\nRequirement: [[${ac.requirementId}]]\n\n${ac.scenario}\n\nExpected: ${ac.expectedOutcome}`);
    for (const nfr of prd.nonFunctionalRequirements) if (nfr.ID) write(path.join(this.root, 'prd', `${nfr.ID}.md`), `# ${nfr.ID}\n\nCategory: ${nfr.Category}\n\n${nfr.Requirement}\n\nTarget: ${nfr.Target}\n\nDocument: [[scheduled-compliance-reports]]`);
    for (const section of prd.sections.filter((s) => s.level === 2)) write(path.join(this.root, 'prd', `${section.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}.md`), `# ${section.title}\n\n${section.content}`);
    const docBacklinks = feedback.filter((f) => f.status === 'applied').map((f) => `[[${f.id}]]`).join(', ');
    write(path.join(this.root, 'docs', 'scheduled-compliance-reports.md'), `${docsMarkdown}\n\n## Feedback backlinks\n\n${docBacklinks || 'No applied feedback.'}`);
    for (const item of feedback) write(path.join(this.root, 'feedback', `${item.id}.md`), `# ${item.id}\n\nSource: ${item.source}\nStatus: ${item.status}\nSeverity: ${item.severity}\nTarget: [[scheduled-compliance-reports#${safe(item.targetSection)}]]\n\n${item.comment}\n\nSuggested change: ${item.suggestedChange}`);
    const edgesFile = path.join(this.root, 'graph', 'edges.json'); const edgeCount = fs.existsSync(edgesFile) ? JSON.parse(fs.readFileSync(edgesFile, 'utf8')).length : 0;
    return { root: this.root, requirements: prd.requirements.length, acceptanceCriteria: prd.acceptanceCriteria.length, feedback: feedback.length, updatedNodes: prd.requirements.length + prd.acceptanceCriteria.length + feedback.length + 2, updatedEdges: edgeCount };
  }
  indexDocumentVersion({ version, oldVersion = null, oldMarkdown = '', newMarkdown, regeneratedSections = [] }) {
    const versionFile = path.join(this.root, 'docs', `scheduled-compliance-reports-${safeVersion(version)}.md`); write(versionFile, newMarkdown);
    const edgesFile = path.join(this.root, 'graph', 'edges.json'); const edges = fs.existsSync(edgesFile) ? JSON.parse(fs.readFileSync(edgesFile, 'utf8')) : [];
    const oldSections = sectionMap(oldMarkdown); const newSections = sectionMap(newMarkdown);
    if (oldVersion) for (const heading of regeneratedSections) {
      const edge = { from: `doc:${version}#${heading}`, relation: 'supersedes', to: `doc:${oldVersion}#${heading}`, oldHash: oldSections.has(heading) ? hashContent(oldSections.get(heading)) : null, newHash: newSections.has(heading) ? hashContent(newSections.get(heading)) : null, createdAt: new Date().toISOString() };
      if (!edges.some((item) => item.from === edge.from && item.to === edge.to && item.relation === edge.relation)) edges.push(edge);
    }
    fs.writeFileSync(edgesFile, `${JSON.stringify(edges, null, 2)}\n`);
    const faq = this.updateFaqIndex(newMarkdown, regeneratedSections, version);
    return { versionFile, edges, faq, staleFaqCount: faq.filter((item) => item.status === 'stale').length };
  }
  updateFaqIndex(markdown, regeneratedSections, version) {
    const file = path.join(this.root, 'qa', 'faq_index.json'); const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    let faq = prior; const initialized = !faq.length;
    if (initialized) {
      const faqRaw = sectionMap(markdown).get('FAQ') || ''; const questions = [...faqRaw.matchAll(/^###\s+(.+)\n([\s\S]*?)(?=^###\s+|(?![\s\S]))/gm)];
      faq = questions.map((match, index) => ({ id: `FAQ-${String(index + 1).padStart(3, '0')}`, question: match[1].trim(), content: match[2].trim(), linkedSections: inferFaqLinks(match[1]), status: 'active', version }));
    }
    faq = faq.map((item) => {
      if (initialized) return item;
      const stale = regeneratedSections.includes('FAQ') || (item.linkedSections || []).some((heading) => regeneratedSections.includes(heading));
      return stale ? { ...item, status: 'stale', staleSince: version } : item;
    });
    fs.writeFileSync(file, `${JSON.stringify(faq, null, 2)}\n`); return faq;
  }
  notes() {
    const result = [];
    for (const dir of ['prd', 'docs', 'feedback']) for (const name of fs.readdirSync(path.join(this.root, dir))) if (name.endsWith('.md')) result.push({ file: path.join(dir, name), content: fs.readFileSync(path.join(this.root, dir, name), 'utf8') });
    return result;
  }
  search(question, limit = 6) {
    const ignored = new Set(['what', 'how', 'are', 'the', 'and', 'does']);
    const aliases = { retained: ['retained', 'retention', 'years'], formats: ['formats', 'format', 'pdf', 'csv'], fails: ['fails', 'failure', 'retry', 'retries'], supported: ['supported', 'supports'] };
    const originalWords = String(question).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !ignored.has(word));
    const words = [...new Set(originalWords.flatMap((word) => aliases[word] || [word, word.replace(/s$/, '')]))];
    const chunks = this.notes().flatMap((note) => parseSections(note.content).map((section) => ({ ...note, section: section.title, content: section.content || section.title })));
    const ranked = chunks.map((chunk) => ({ ...chunk, score: words.reduce((score, word) => score + (`${chunk.section} ${chunk.content}`.toLowerCase().includes(word) ? 1 : 0), 0) + (chunk.file.startsWith('docs/') ? 2 : 0) })).sort((a, b) => b.score - a.score || a.content.length - b.content.length);
    return ranked.filter((item) => item.score > 0).slice(0, limit).map((item) => ({ source: `${item.file}#${item.section}`, content: item.content.slice(0, 4000), score: item.score }));
  }
  ask(question) {
    const ranked = this.search(question, 1); const best = ranked[0];
    if (!best || best.score === 0) return { answer: 'I could not find that in the indexed knowledge base.', citations: [] };
    const ignored = new Set(['what', 'how', 'are', 'the', 'and', 'does']);
    const aliases = { retained: ['retained', 'retention', 'years'], formats: ['formats', 'format', 'pdf', 'csv'], fails: ['fails', 'failure', 'retry', 'retries'] };
    const words = [...new Set(String(question).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !ignored.has(word)).flatMap((word) => aliases[word] || [word, word.replace(/s$/, '')]))];
    const sentences = best.content.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
    const relevant = sentences.filter((sentence) => words.some((word) => sentence.toLowerCase().includes(word))).slice(0, 3);
    const answer = (relevant.length ? relevant : sentences.slice(0, 2)).join(' ').replace(/^Source:\s*/i, '');
    const citation = best.source;
    write(path.join(this.root, 'qa', `${Date.now()}.md`), `# Q&A\n\nQuestion: ${question}\n\nAnswer: ${answer}\n\nSource: [[${citation}]]`);
    return { answer, citations: [citation] };
  }
}

function inferFaqLinks(question) {
  if (/format|download/i.test(question)) return ['How to download generated reports'];
  if (/fail|retry|schedule/i.test(question)) return ['How to schedule reports'];
  if (/retention|retain|audit/i.test(question)) return ['Report retention and audit trail'];
  if (/scope|limitation/i.test(question)) return ['Known limitations / out-of-scope items'];
  return ['Overview'];
}

module.exports = { KnowledgeBase, inferFaqLinks };
