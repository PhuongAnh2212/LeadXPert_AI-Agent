const fs = require('fs');
const path = require('path');

function safeVersion(version) { return String(version).replace(/[^a-z0-9._-]+/gi, '-'); }

class VersionStore {
  constructor(knowledgeRoot) { this.root = path.join(knowledgeRoot, 'versions'); for (const kind of ['prd', 'figma']) fs.mkdirSync(path.join(this.root, kind), { recursive: true }); }
  directory(kind) { if (!['prd', 'figma'].includes(kind)) throw new Error(`Unsupported version kind: ${kind}`); return path.join(this.root, kind); }
  latest(kind) { const file = path.join(this.directory(kind), 'latest.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }
  list(kind) {
    return fs.readdirSync(this.directory(kind)).filter((name) => name.endsWith('.json') && name !== 'latest.json')
      .map((name) => JSON.parse(fs.readFileSync(path.join(this.directory(kind), name), 'utf8')))
      .sort((left, right) => (new Date(left.uploadedAt || left.uploaded_at || 0) - new Date(right.uploadedAt || right.uploaded_at || 0)) || String(left.version).localeCompare(String(right.version), undefined, { numeric: true }));
  }
  save(kind, snapshot) {
    const directory = this.directory(kind); const file = path.join(directory, `${safeVersion(snapshot.version)}.json`);
    fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`); fs.writeFileSync(path.join(directory, 'latest.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
    return file;
  }
}

module.exports = { VersionStore, safeVersion };
