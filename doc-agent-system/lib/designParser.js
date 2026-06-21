const fs = require('fs');
const path = require('path');
const { parseSections } = require('./prdParser');

function ingestDesign(filePath) {
  const extension = path.extname(filePath).toLowerCase(); const raw = fs.readFileSync(filePath, 'utf8');
  if (extension === '.json') return { sourceFile: path.resolve(filePath), type: 'json', content: JSON.parse(raw) };
  if (extension === '.md' || extension === '.markdown') return { sourceFile: path.resolve(filePath), type: 'markdown', content: parseSections(raw) };
  throw new Error(`Unsupported design input: ${extension}`);
}

module.exports = { ingestDesign };
