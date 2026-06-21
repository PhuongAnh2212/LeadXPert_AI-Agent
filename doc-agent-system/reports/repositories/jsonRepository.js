const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EMPTY_DATABASE = {
  templates: [], templateVersions: [], schedules: [], runs: [], artifacts: [], audit: [], notifications: [], users: []
};

class JsonRepository {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) this.write(EMPTY_DATABASE);
  }

  read() {
    return { ...EMPTY_DATABASE, ...JSON.parse(fs.readFileSync(this.filePath, 'utf8')) };
  }

  write(data) {
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
  }

  transaction(callback) {
    const data = this.read();
    const result = callback(data);
    this.write(data);
    return result;
  }

  id(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
}

module.exports = { JsonRepository };
