const fs = require('fs');
const path = require('path');

const knowledgeDir = path.join(__dirname, '..', 'store', 'knowledge');

function slugify(value) {
  return String(value || 'general')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content: markdown };

  const metadata = {};
  match[1].split('\n').forEach((line) => {
    const [key, ...rest] = line.split(':');
    if (!key || rest.length === 0) return;
    const rawValue = rest.join(':').trim();
    metadata[key.trim()] = rawValue.startsWith('[')
      ? rawValue.replace(/[\[\]]/g, '').split(',').map((item) => item.trim()).filter(Boolean)
      : rawValue;
  });

  return { metadata, content: match[2].trim() };
}

function readKnowledgeNotes() {
  return fs.readdirSync(knowledgeDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => {
      const filePath = path.join(knowledgeDir, fileName);
      const raw = fs.readFileSync(filePath, 'utf8');
      return { fileName, filePath, raw, ...parseFrontmatter(raw) };
    });
}

function writeKnowledgeNote({ title, feature, tags, sourceRef, content }) {
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `${slugify(feature)}-${date}.md`;
  const filePath = path.join(knowledgeDir, fileName);
  const markdown = `---
title: ${title}
feature: ${feature}
tags: [${tags.join(', ')}]
source_prd: ${sourceRef}
doc_version: 1.0
created_at: ${new Date().toISOString()}
status: active
---
${content.trim()}
`;
  fs.writeFileSync(filePath, markdown);
  return { title, feature, tags, sourceRef, fileName, filePath };
}

module.exports = { readKnowledgeNotes, writeKnowledgeNote, slugify, parseFrontmatter };
