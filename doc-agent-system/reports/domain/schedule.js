const { ReportError } = require('../lib/errors');
const { assertTimezone, zonedDateToUtc, zonedParts } = require('../lib/time');

function parseField(value, min, max) {
  const result = new Set();
  const parts = String(value).split(',');
  for (const part of parts) {
    const [range, stepText] = part.split('/');
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) throw new ReportError('Invalid cron step', 'INVALID_CRON');
    let start = min;
    let end = max;
    if (range !== '*') {
      const bounds = range.split('-').map(Number);
      start = bounds[0];
      end = bounds.length === 2 ? bounds[1] : bounds[0];
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
      throw new ReportError('Invalid cron field', 'INVALID_CRON');
    }
    for (let valueAtStep = start; valueAtStep <= end; valueAtStep += step) result.add(valueAtStep);
  }
  return result;
}

function parseCron(expression) {
  const fields = String(expression || '').trim().split(/\s+/);
  if (fields.length !== 5) throw new ReportError('Cron must have five fields', 'INVALID_CRON');
  return {
    minute: parseField(fields[0], 0, 59), hour: parseField(fields[1], 0, 23),
    day: parseField(fields[2], 1, 31), month: parseField(fields[3], 1, 12), weekday: parseField(fields[4], 0, 6)
  };
}

function cronMatches(cron, parts) {
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return cron.minute.has(parts.minute) && cron.hour.has(parts.hour) && cron.day.has(parts.day) && cron.month.has(parts.month) && cron.weekday.has(weekday);
}

function frequencyCron(frequency, config = {}) {
  const minute = Number(config.minute ?? 0);
  const hour = Number(config.hour ?? 6);
  if (frequency === 'daily') return `${minute} ${hour} * * *`;
  if (frequency === 'weekly') return `${minute} ${hour} * * ${Number(config.weekday ?? 1)}`;
  if (frequency === 'monthly') return `${minute} ${hour} ${Number(config.day ?? 1)} * *`;
  if (frequency === 'custom') return config.cron;
  throw new ReportError(`Unsupported frequency: ${frequency}`, 'INVALID_SCHEDULE');
}

function nextRunAt(schedule, after = new Date()) {
  assertTimezone(schedule.timezone);
  const cron = parseCron(frequencyCron(schedule.frequency, schedule.config));
  const candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  const limit = 366 * 24 * 60 * 2;
  for (let checked = 0; checked < limit; checked += 1) {
    const parts = zonedParts(candidate, schedule.timezone);
    if (cronMatches(cron, parts)) {
      return zonedDateToUtc({ ...parts, second: 0 }, schedule.timezone);
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  throw new ReportError('Could not find next schedule time', 'INVALID_SCHEDULE');
}

module.exports = { frequencyCron, nextRunAt, parseCron };
