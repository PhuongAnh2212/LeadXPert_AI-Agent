const fs = require('fs');
const path = require('path');

class MockUploadWatcher {
  constructor({ agentA, agentB, slack }) { this.agentA = agentA; this.agentB = agentB; this.slack = slack; }
  async upload({ prdFile, figmaFile = null, source, uploadedBy, uploaded_by, version }) {
    uploadedBy ||= uploaded_by;
    if (!['slack', 'shared_drive'].includes(source)) throw new Error('Upload source must be slack or shared_drive');
    if (!prdFile || !fs.existsSync(prdFile)) throw new Error(`PRD upload not found: ${prdFile}`);
    if (figmaFile && !fs.existsSync(figmaFile)) throw new Error(`Figma upload not found: ${figmaFile}`);
    if (!uploadedBy || !version) throw new Error('uploadedBy and version are required');
    return this.agentB.processUpload({ prdFile: path.resolve(prdFile), figmaFile: figmaFile ? path.resolve(figmaFile) : null, source, uploadedBy, version, agentA: this.agentA, slack: this.slack });
  }
}

module.exports = { MockUploadWatcher };
