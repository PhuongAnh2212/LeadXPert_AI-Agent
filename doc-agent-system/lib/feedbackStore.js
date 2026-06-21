const fs = require('fs');
const path = require('path');

class FeedbackStore {
  constructor(filePath) { this.filePath = filePath; }
  read() { return fs.existsSync(this.filePath) ? JSON.parse(fs.readFileSync(this.filePath, 'utf8')) : []; }
  write(items) { fs.mkdirSync(path.dirname(this.filePath), { recursive: true }); fs.writeFileSync(this.filePath, `${JSON.stringify(items, null, 2)}\n`); }
  submit(input) {
    const allowedSources = ['PM', 'Customer Support', 'QA'];
    const allowedStatuses = ['open', 'applied', 'rejected'];
    if (!allowedSources.includes(input.source)) throw new Error(`Invalid feedback source: ${input.source}`);
    if (input.status && !allowedStatuses.includes(input.status)) throw new Error(`Invalid feedback status: ${input.status}`);
    const items = this.read();
    const item = { id: `FB-${String(items.length + 1).padStart(3, '0')}`, source: input.source, targetSection: input.targetSection, comment: input.comment, severity: input.severity || 'medium', suggestedChange: input.suggestedChange || '', status: input.status || 'open', createdAt: new Date().toISOString() };
    items.push(item); this.write(items); return item;
  }
  updateStatus(id, status) {
    if (!['open', 'applied', 'rejected'].includes(status)) throw new Error(`Invalid feedback status: ${status}`);
    const items = this.read(); const item = items.find((entry) => entry.id === id);
    if (!item) throw new Error(`Feedback not found: ${id}`);
    item.status = status; item.updatedAt = new Date().toISOString(); this.write(items); return item;
  }
  accepted() { return this.read().filter((item) => item.status === 'applied'); }
  preferences() {
    const counts = {};
    for (const item of this.accepted()) { const key = `${item.targetSection}: ${item.suggestedChange || item.comment}`; counts[key] = (counts[key] || 0) + 1; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([preference, occurrences]) => ({ preference, occurrences }));
  }
}

module.exports = { FeedbackStore };
