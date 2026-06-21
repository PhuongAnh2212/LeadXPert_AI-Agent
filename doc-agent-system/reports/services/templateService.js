const { ReportError } = require('../lib/errors');

const ALLOWED_DATE_RANGES = new Set(['last_n_days', 'previous_calendar_week', 'previous_calendar_month', 'previous_calendar_quarter', 'custom_rolling_window']);

function sanitizeInput(input) {
  if (!input.name || !String(input.name).trim()) throw new ReportError('Template name is required', 'VALIDATION_ERROR');
  if (!input.dateRange || !ALLOWED_DATE_RANGES.has(input.dateRange.type)) throw new ReportError('A supported date range is required', 'VALIDATION_ERROR');
  return {
    name: String(input.name).trim(),
    description: String(input.description || '').trim(),
    filters: input.filters || {},
    columns: Array.isArray(input.columns) ? input.columns : [],
    sortOrder: Array.isArray(input.sortOrder) ? input.sortOrder : [],
    groupingDimensions: Array.isArray(input.groupingDimensions) ? input.groupingDimensions : [],
    dateRange: input.dateRange,
    outputFormats: Array.isArray(input.outputFormats) && input.outputFormats.length ? input.outputFormats : ['pdf', 'csv'],
    delivery: input.delivery || { method: 'link', recipients: [] }
  };
}

class TemplateService {
  constructor(repository, audit, clock = () => new Date()) {
    this.repository = repository;
    this.audit = audit;
    this.clock = clock;
  }

  create(context, input) {
    const values = sanitizeInput(input);
    this.validateExternalRecipients(context, values.delivery, input.externalRecipientAcknowledged);
    const timestamp = this.clock().toISOString();
    const template = {
      id: this.repository.id('tpl'), tenantId: context.tenantId, ownerId: context.userId,
      schemaVersion: 1, version: 1, ...values, createdAt: timestamp, updatedAt: timestamp, deletedAt: null
    };
    this.repository.transaction((data) => {
      data.templates.push(template);
      data.templateVersions.push({ id: this.repository.id('tplv'), templateId: template.id, version: 1, snapshot: template, createdAt: timestamp, createdBy: context.userId });
    });
    this.audit.record({ tenantId: context.tenantId, actorId: context.userId, action: 'report_template_created', templateId: template.id, parameters: { version: 1 } });
    this.recordExternalAcknowledgments(context, template, input.externalRecipientAcknowledged);
    return template;
  }

  list(context) {
    return this.repository.read().templates.filter((item) => item.tenantId === context.tenantId && !item.deletedAt);
  }

  get(context, id) {
    const template = this.repository.read().templates.find((item) => item.id === id && item.tenantId === context.tenantId && !item.deletedAt);
    if (!template) throw new ReportError('Template not found', 'NOT_FOUND', 404);
    return template;
  }

  update(context, id, input) {
    const current = this.get(context, id);
    if (current.ownerId !== context.userId) throw new ReportError('Only the owner can update this template', 'FORBIDDEN', 403);
    const values = sanitizeInput({ ...current, ...input });
    this.validateExternalRecipients(context, values.delivery, input.externalRecipientAcknowledged);
    const timestamp = this.clock().toISOString();
    const updated = { ...current, ...values, version: current.version + 1, updatedAt: timestamp };
    this.repository.transaction((data) => {
      const index = data.templates.findIndex((item) => item.id === id);
      data.templates[index] = updated;
      data.templateVersions.push({ id: this.repository.id('tplv'), templateId: id, version: updated.version, snapshot: updated, createdAt: timestamp, createdBy: context.userId });
    });
    this.audit.record({ tenantId: context.tenantId, actorId: context.userId, action: 'report_template_updated', templateId: id, parameters: { version: updated.version } });
    this.recordExternalAcknowledgments(context, updated, input.externalRecipientAcknowledged);
    return updated;
  }

  remove(context, id) {
    const current = this.get(context, id);
    if (current.ownerId !== context.userId) throw new ReportError('Only the owner can delete this template', 'FORBIDDEN', 403);
    const deletedAt = this.clock().toISOString();
    this.repository.transaction((data) => {
      data.templates.find((item) => item.id === id).deletedAt = deletedAt;
      data.schedules.filter((item) => item.templateId === id).forEach((item) => { item.enabled = false; item.updatedAt = deletedAt; });
    });
    this.audit.record({ tenantId: context.tenantId, actorId: context.userId, action: 'report_template_deleted', templateId: id });
  }

  versions(context, id) {
    this.get(context, id);
    return this.repository.read().templateVersions.filter((item) => item.templateId === id);
  }

  recordExternalAcknowledgments(context, template, acknowledged) {
    const external = this.externalRecipients(context, template.delivery);
    if (external.length) this.audit.record({ tenantId: context.tenantId, actorId: context.userId, action: 'external_recipient_acknowledged', templateId: template.id, parameters: { recipients: external } });
  }

  externalRecipients(context, delivery) {
    const users = this.repository.read().users.filter((user) => user.tenantId === context.tenantId).map((user) => user.email.toLowerCase());
    return (delivery.recipients || []).filter((recipient) => !users.includes(String(recipient).toLowerCase()));
  }

  validateExternalRecipients(context, delivery, acknowledged) {
    if (this.externalRecipients(context, delivery).length && !acknowledged) throw new ReportError('External recipient acknowledgment is required', 'EXTERNAL_ACK_REQUIRED');
  }
}

module.exports = { TemplateService };
