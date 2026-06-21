const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parseSections } = require('./prdParser');

function normalizeContent(value = '') { return String(value).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
function hashContent(value) { return crypto.createHash('sha256').update(normalizeContent(value)).digest('hex'); }
function sectionKey(heading) { return String(heading).toLowerCase().replace(/^\d+(?:\.\d+)*\.?\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim(); }

function snapshotMarkdown(filePath, metadata) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sections = parseSections(content).map((section) => ({ ...section, hash: hashContent(section.content) }));
  const uploadedAt = new Date().toISOString(); const resolved = path.resolve(filePath); const sectionHashes = Object.fromEntries(sections.map((section) => [section.title, section.hash]));
  return { kind: 'prd', ...metadata, filePath: resolved, file_path: resolved, uploadedAt, uploaded_at: uploadedAt, uploaded_by: metadata.uploadedBy, contentHash: hashContent(content), content_hash: hashContent(content), sectionHashes, section_hashes: sectionHashes, content, sections };
}

function figmaUnits(value) {
  if (Array.isArray(value)) return value;
  for (const key of ['screens', 'frames', 'artboards', 'pages']) if (Array.isArray(value?.[key])) return value[key];
  return Object.entries(value || {}).map(([name, content]) => ({ name, content }));
}

function snapshotFigma(filePath, metadata) {
  const raw = fs.readFileSync(filePath, 'utf8'); const extension = path.extname(filePath).toLowerCase();
  const content = extension === '.json' ? JSON.parse(raw) : raw;
  const units = extension === '.json' ? figmaUnits(content) : parseSections(raw);
  const sections = units.map((unit, index) => { const heading = unit.name || unit.title || unit.id || `screen-${index + 1}`; const body = JSON.stringify(unit); return { heading, content: unit, hash: hashContent(body) }; });
  const uploadedAt = new Date().toISOString(); const resolved = path.resolve(filePath); const sectionHashes = Object.fromEntries(sections.map((section) => [section.heading, section.hash]));
  return { kind: 'figma', ...metadata, filePath: resolved, file_path: resolved, uploadedAt, uploaded_at: uploadedAt, uploaded_by: metadata.uploadedBy, contentHash: hashContent(raw), content_hash: hashContent(raw), sectionHashes, section_hashes: sectionHashes, content, sections };
}

function diffSections(previous, current) {
  const oldMap = new Map((previous?.sections || []).map((section) => [sectionKey(section.title || section.heading), section]));
  const newMap = new Map((current?.sections || []).map((section) => [sectionKey(section.title || section.heading), section]));
  const changes = [];
  for (const [key, section] of newMap) {
    const old = oldMap.get(key); const heading = section.title || section.heading;
    changes.push({ heading, oldHash: old?.hash || null, newHash: section.hash, oldContent: old?.content || null, newContent: section.content, changeType: !old ? 'added' : old.hash === section.hash ? 'unchanged' : 'modified' });
  }
  for (const [key, section] of oldMap) if (!newMap.has(key)) changes.push({ heading: section.title || section.heading, oldHash: section.hash, newHash: null, oldContent: section.content, newContent: null, changeType: 'removed' });
  return {
    sections: changes,
    added: changes.filter((item) => item.changeType === 'added'),
    removed: changes.filter((item) => item.changeType === 'removed'),
    modified: changes.filter((item) => item.changeType === 'modified'),
    unchanged: changes.filter((item) => item.changeType === 'unchanged'),
    changedSections: changes.filter((item) => item.changeType !== 'unchanged')
  };
}

const docMappings = [
  [/background|problem|current state/, ['Overview', 'Who this feature is for']],
  [/template creation|fr 01|save.*template/, ['How to create a report template']],
  [/recurring schedule|fr 02|schedule/, ['How to schedule reports']],
  [/email delivery|fr 03/, ['How to configure email delivery']],
  [/artifact|history|download|fr 04|fr 08/, ['How to download generated reports', 'Report retention and audit trail']],
  [/retention|audit|security|compliance/, ['Report retention and audit trail']],
  [/pdf|csv|format|fr 05|fr 06/, ['How to download generated reports', 'FAQ']],
  [/out of scope|future consideration|limitation/, ['Known limitations / out-of-scope items', 'FAQ']],
  [/assumption|dependenc|open question/, ['FAQ']]
];

function affectedDocSections(changes, availableHeadings = []) {
  const result = new Set();
  for (const change of changes) {
    const haystack = `${sectionKey(change.heading)} ${normalizeContent(change.newContent || change.oldContent || '').slice(0, 500)}`.toLowerCase();
    for (const [pattern, headings] of docMappings) if (pattern.test(haystack)) headings.forEach((heading) => result.add(heading));
    const exact = availableHeadings.find((heading) => sectionKey(heading) === sectionKey(change.heading)); if (exact) result.add(exact);
  }
  if (!result.size && changes.length) result.add('Overview');
  return [...result].filter((heading) => !availableHeadings.length || availableHeadings.includes(heading));
}

function isGlobalChange(changes) { return changes.some((change) => /global documentation|documentation structure|all documentation/i.test(change.heading)); }

function matchFigmaScreens(changes, figmaSnapshot) {
  if (!figmaSnapshot) return [];
  const tokens = new Set(changes.flatMap((change) => sectionKey(change.heading).split(' ')).filter((token) => token.length > 3));
  return figmaSnapshot.sections.map((screen) => ({ screen: screen.heading, hash: screen.hash, score: [...tokens].filter((token) => sectionKey(screen.heading).includes(token)).length, content: screen.content })).filter((screen) => screen.score > 0).sort((a, b) => b.score - a.score);
}

module.exports = { normalizeContent, hashContent, sectionKey, snapshotMarkdown, snapshotFigma, diffSections, affectedDocSections, isGlobalChange, matchFigmaScreens };
