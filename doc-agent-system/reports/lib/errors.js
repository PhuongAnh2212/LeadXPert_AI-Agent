class ReportError extends Error {
  constructor(message, code = 'REPORT_ERROR', statusCode = 400) {
    super(message);
    this.name = 'ReportError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

module.exports = { ReportError };
