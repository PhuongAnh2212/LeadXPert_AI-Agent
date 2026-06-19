const fs = require('fs');
const path = require('path');
const { chatCompletion } = require('../utils/openRouterClient');
const promptBuilder = require('../utils/promptBuilder');
const { readKnowledgeNotes, writeKnowledgeNote, slugify } = require('../layers/layer3_knowledge');

const unansweredPath = path.join(__dirname, '..', 'store', 'unanswered.json');

function ensureUnansweredStore() {
  if (!fs.existsSync(unansweredPath)) {
    fs.writeFileSync(unansweredPath, '{}\n');
  }
}

function extractFirstFeature(docString) {
  return docString.match(/^## Feature:\s*(.+)$/m)?.[1]?.trim() || 'Smart Notification Center';
}

function fallbackIngestion(docString, sourceRef) {
  const feature = extractFirstFeature(docString);
  return {
    title: feature,
    feature,
    tags: slugify(feature).split('-').filter(Boolean),
    summary: `Approved documentation for ${feature}.`,
    content: docString,
    sourceRef
  };
}

async function ingestDoc(docString, sourceRef = 'PRD-NotificationCenter-v1.0') {
  const system = promptBuilder.agentBSystem();
  const user = `Extract a knowledge note from this approved documentation. Return only JSON.\n\nSOURCE: ${sourceRef}\n\nDOC:\n${docString}`;
  const completion = await chatCompletion({ system, user, maxTokens: 1600 });
  let note = null;

  if (completion) {
    try {
      note = JSON.parse(completion.replace(/^```json\s*|\s*```$/g, ''));
    } catch (error) {
      note = null;
    }
  }

  const normalized = note || fallbackIngestion(docString, sourceRef);
  const metadata = writeKnowledgeNote({
    title: normalized.title || normalized.feature || 'Smart Notification Center',
    feature: normalized.feature || normalized.title || 'Smart Notification Center',
    tags: Array.isArray(normalized.tags) && normalized.tags.length ? normalized.tags : ['notifications', 'documentation'],
    sourceRef,
    content: normalized.content || docString
  });

  return {
    ...metadata,
    summary: normalized.summary || `Indexed documentation for ${metadata.feature}.`
  };
}

function scoreNote(question, note) {
  const tokens = new Set(String(question).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2));
  const text = `${note.metadata.title || ''} ${note.metadata.feature || ''} ${Array.isArray(note.metadata.tags) ? note.metadata.tags.join(' ') : note.metadata.tags || ''} ${note.content}`.toLowerCase();
  let score = 0;
  tokens.forEach((token) => {
    if (text.includes(token)) score += 1;
  });
  return score / Math.max(tokens.size, 1);
}

function recordUnanswered(question) {
  ensureUnansweredStore();
  const store = JSON.parse(fs.readFileSync(unansweredPath, 'utf8'));
  const key = question.trim().toLowerCase();
  store[key] = {
    question,
    count: (store[key]?.count || 0) + 1,
    lastAskedAt: new Date().toISOString()
  };
  fs.writeFileSync(unansweredPath, `${JSON.stringify(store, null, 2)}\n`);
  return store[key];
}

async function answerQuestion(question) {
  const notes = readKnowledgeNotes();
  const ranked = notes
    .map((note) => ({ note, score: scoreNote(question, note) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const context = notes.map((note) => `SOURCE NOTE: ${note.metadata.title} — ${note.metadata.feature}\n${note.content}`).join('\n\n---\n\n');
  const system = promptBuilder.agentBSystem();
  const user = `QUESTION: ${question}\n\nKNOWLEDGE CONTEXT:\n${context}\n\nAnswer using only this context and end with the best source note title.`;
  const completion = await chatCompletion({ system, user, maxTokens: 1000 });

  if (completion && best?.score >= 0.2) {
    return {
      answer: completion,
      sourceTitle: best.note.metadata.title || 'Unknown Note',
      feature: best.note.metadata.feature || 'Unknown Feature',
      confidence: Math.min(0.95, Number((best.score + 0.25).toFixed(2))),
      gapAlert: null
    };
  }

  if (!best || best.score < 0.2) {
    const unanswered = recordUnanswered(question);
    return {
      answer: `I do not have a reliable indexed answer for that yet. This may be incomplete — ask the PM to verify.`,
      sourceTitle: 'No matching source note',
      feature: 'Knowledge Gap',
      confidence: 0.1,
      gapAlert: unanswered.count >= 3 ? { question, count: unanswered.count } : null
    };
  }

  const answer = buildFallbackAnswer(question, best.note, best.score);
  return {
    answer,
    sourceTitle: best.note.metadata.title || 'Unknown Note',
    feature: best.note.metadata.feature || 'Unknown Feature',
    confidence: Number(best.score.toFixed(2)),
    gapAlert: null
  };
}

function buildFallbackAnswer(question, note, score) {
  const paragraphs = note.content.split(/\n\n+/).filter(Boolean);
  const relevant = paragraphs.find((paragraph) => scoreNote(question, { ...note, content: paragraph }) > 0.25) || paragraphs[0];
  const caveat = score < 0.35 ? ' This may be incomplete — ask the PM to verify.' : '';
  return `${relevant.replace(/\s+/g, ' ').trim()}${caveat}`;
}

module.exports = { ingestDoc, answerQuestion, recordUnanswered };
