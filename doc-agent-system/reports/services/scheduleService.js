const { ReportError } = require('../lib/errors');
const { nextRunAt } = require('../domain/schedule');
const { resolveDateRange } = require('../domain/dateRanges');

class ScheduleService {
  constructor(repository, templateService, audit, clock = () => new Date()) {
    this.repository = repository;
    this.templateService = templateService;
    this.audit = audit;
    this.clock = clock;
  }

  create(context, templateId, input) {
    const template = this.templateService.get(context, templateId);
    if (template.ownerId !== context.userId) throw new ReportError('Only the owner can schedule this template', 'FORBIDDEN', 403);
    const timestamp = this.clock().toISOString();
    const schedule = {
      id: this.repository.id('sch'), tenantId: context.tenantId, templateId,
      frequency: input.frequency, config: input.config || {}, timezone: input.timezone || context.timezone || 'UTC',
      enabled: input.enabled !== false, createdAt: timestamp, updatedAt: timestamp
    };
    schedule.nextRunAt = schedule.enabled ? nextRunAt(schedule, this.clock()).toISOString() : null;
    this.repository.transaction((data) => data.schedules.push(schedule));
    this.audit.record({ tenantId: context.tenantId, actorId: context.userId, action: 'report_schedule_created', templateId, parameters: { scheduleId: schedule.id, frequency: schedule.frequency } });
    return schedule;
  }

  list(context, templateId) {
    this.templateService.get(context, templateId);
    return this.repository.read().schedules.filter((item) => item.tenantId === context.tenantId && item.templateId === templateId);
  }

  enqueueDue(now = this.clock()) {
    const due = this.repository.read().schedules.filter((schedule) => schedule.enabled && schedule.nextRunAt && new Date(schedule.nextRunAt) <= now);
    const queued = [];
    for (const schedule of due) {
      const template = this.repository.read().templates.find((item) => item.id === schedule.templateId && !item.deletedAt);
      if (!template) continue;
      const resolved = resolveDateRange(template.dateRange, new Date(schedule.nextRunAt), schedule.timezone);
      const key = `${schedule.id}:${resolved.start}:${resolved.end}`;
      const created = this.repository.transaction((data) => {
        const existing = data.runs.find((run) => run.idempotencyKey === key);
        const stored = data.schedules.find((item) => item.id === schedule.id);
        stored.nextRunAt = nextRunAt(schedule, new Date(schedule.nextRunAt)).toISOString();
        stored.updatedAt = now.toISOString();
        if (existing) return null;
        const run = {
          id: this.repository.id('run'), tenantId: schedule.tenantId, templateId: schedule.templateId,
          scheduleId: schedule.id, idempotencyKey: key, periodStart: resolved.start, periodEnd: resolved.end,
          resolvedParameters: resolved, status: 'queued', attempt: 0, availableAt: now.toISOString(),
          createdAt: now.toISOString(), updatedAt: now.toISOString(), error: null
        };
        data.runs.push(run);
        return run;
      });
      if (created) {
        queued.push(created);
        this.audit.record({ tenantId: schedule.tenantId, actorId: 'system', action: 'report_generation_queued', reportId: created.id, templateId: schedule.templateId, parameters: resolved });
      }
    }
    return queued;
  }

  enqueueManual(context, templateId, now = this.clock()) {
    const template = this.templateService.get(context, templateId);
    const resolved = resolveDateRange(template.dateRange, now, context.timezone || 'UTC');
    const key = `manual:${templateId}:${resolved.start}:${resolved.end}:${now.toISOString()}`;
    return this.repository.transaction((data) => {
      const run = {
        id: this.repository.id('run'), tenantId: context.tenantId, templateId, scheduleId: null,
        idempotencyKey: key, periodStart: resolved.start, periodEnd: resolved.end, resolvedParameters: resolved,
        status: 'queued', attempt: 0, availableAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString(), error: null
      };
      data.runs.push(run);
      return run;
    });
  }
}

module.exports = { ScheduleService };
