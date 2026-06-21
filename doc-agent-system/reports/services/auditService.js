class AuditService {
  constructor(repository, clock = () => new Date()) {
    this.repository = repository;
    this.clock = clock;
  }

  record({ tenantId, actorId, action, reportId = null, templateId = null, parameters = {}, status = 'success' }) {
    const entry = {
      id: this.repository.id('audit'), tenantId, actorId, action, reportId, templateId,
      parameters, status, timestamp: this.clock().toISOString()
    };
    this.repository.transaction((data) => data.audit.push(entry));
    return entry;
  }

  list(tenantId) {
    return this.repository.read().audit.filter((entry) => entry.tenantId === tenantId);
  }
}

module.exports = { AuditService };
