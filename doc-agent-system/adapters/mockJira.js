const fs = require('fs');
const path = require('path');

class MockJira {
  constructor(filePath) { this.filePath = filePath; }
  read() { return fs.existsSync(this.filePath) ? JSON.parse(fs.readFileSync(this.filePath, 'utf8')) : []; }
  save(tasks) { fs.mkdirSync(path.dirname(this.filePath), { recursive: true }); fs.writeFileSync(this.filePath, `${JSON.stringify(tasks, null, 2)}\n`); }
  createDocumentationTask(summary) { const tasks = this.read(); const task = { key: `DOC-${tasks.length + 1}`, summary, status: 'To Do', attachments: [], comments: [] }; tasks.push(task); this.save(tasks); return task; }
  attachGeneratedDocs(key, file) { return this.update(key, (task) => task.attachments.push(path.resolve(file))); }
  addFeedbackComment(key, comment) { return this.update(key, (task) => task.comments.push(comment)); }
  updateTaskStatus(key, status) { return this.update(key, (task) => { task.status = status; }); }
  update(key, change) { const tasks = this.read(); const task = tasks.find((item) => item.key === key); if (!task) throw new Error(`Jira task not found: ${key}`); change(task); this.save(tasks); return task; }
}

module.exports = { MockJira };
