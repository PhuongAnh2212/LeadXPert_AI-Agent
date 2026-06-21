const { ReportError } = require('../lib/errors');
const { addLocalDays, shiftCalendarDate, startOfLocalDay, zonedDateToUtc, zonedParts } = require('../lib/time');

function result(type, start, end, timezone, extra = {}) {
  return { type, timezone, start: start.toISOString(), end: end.toISOString(), endExclusive: true, ...extra };
}

function resolveDateRange(config, now = new Date(), timezone = 'UTC') {
  if (!config || !config.type) throw new ReportError('Date range type is required', 'INVALID_DATE_RANGE');
  const today = startOfLocalDay(now, timezone);
  const todayParts = zonedParts(today, timezone);

  if (config.type === 'last_n_days') {
    const days = Number(config.days);
    if (!Number.isInteger(days) || days < 1 || days > 3660) throw new ReportError('days must be between 1 and 3660', 'INVALID_DATE_RANGE');
    return result(config.type, addLocalDays(today, -(days - 1), timezone), addLocalDays(today, 1, timezone), timezone, { days });
  }

  if (config.type === 'previous_calendar_week') {
    const weekday = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day)).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    const currentMonday = addLocalDays(today, -daysSinceMonday, timezone);
    return result(config.type, addLocalDays(currentMonday, -7, timezone), currentMonday, timezone);
  }

  if (config.type === 'previous_calendar_month') {
    const currentMonth = zonedDateToUtc({ year: todayParts.year, month: todayParts.month, day: 1 }, timezone);
    const previous = todayParts.month === 1
      ? { year: todayParts.year - 1, month: 12, day: 1 }
      : { year: todayParts.year, month: todayParts.month - 1, day: 1 };
    return result(config.type, zonedDateToUtc(previous, timezone), currentMonth, timezone);
  }

  if (config.type === 'previous_calendar_quarter') {
    const currentQuarterMonth = Math.floor((todayParts.month - 1) / 3) * 3 + 1;
    const currentQuarter = zonedDateToUtc({ year: todayParts.year, month: currentQuarterMonth, day: 1 }, timezone);
    const previousMonth = currentQuarterMonth - 3;
    const previous = previousMonth < 1
      ? { year: todayParts.year - 1, month: previousMonth + 12, day: 1 }
      : { year: todayParts.year, month: previousMonth, day: 1 };
    return result(config.type, zonedDateToUtc(previous, timezone), currentQuarter, timezone);
  }

  if (config.type === 'custom_rolling_window') {
    const days = Number(config.days);
    if (!Number.isInteger(days) || days < 1 || days > 3660) throw new ReportError('days must be between 1 and 3660', 'INVALID_DATE_RANGE');
    if (!config.excludeWeekends) {
      return result(config.type, addLocalDays(today, -(days - 1), timezone), addLocalDays(today, 1, timezone), timezone, { days, excludeWeekends: false });
    }
    let cursor = today;
    let included = 0;
    while (included < days) {
      const local = zonedParts(cursor, timezone);
      const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
      if (weekday !== 0 && weekday !== 6) included += 1;
      if (included < days) cursor = addLocalDays(cursor, -1, timezone);
    }
    return result(config.type, cursor, addLocalDays(today, 1, timezone), timezone, { days, excludeWeekends: true });
  }

  throw new ReportError(`Unsupported date range: ${config.type}`, 'INVALID_DATE_RANGE');
}

function containsDate(resolved, value) {
  const timestamp = new Date(value).getTime();
  return timestamp >= new Date(resolved.start).getTime() && timestamp < new Date(resolved.end).getTime();
}

module.exports = { containsDate, resolveDateRange };
