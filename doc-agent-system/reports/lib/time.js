const { ReportError } = require('./errors');

function zonedParts(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(value);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function assertTimezone(timezone) {
  try {
    zonedParts(new Date(), timezone);
  } catch (error) {
    throw new ReportError(`Invalid timezone: ${timezone}`, 'INVALID_TIMEZONE');
  }
}

function zonedDateToUtc(parts, timezone) {
  assertTimezone(timezone);
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0);
  let guess = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = zonedParts(new Date(guess), timezone);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const difference = target - actualUtc;
    guess += difference;
    if (difference === 0) break;
  }
  return new Date(guess);
}

function shiftCalendarDate(parts, days) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function startOfLocalDay(value, timezone) {
  const parts = zonedParts(value, timezone);
  return zonedDateToUtc({ year: parts.year, month: parts.month, day: parts.day }, timezone);
}

function addLocalDays(value, days, timezone) {
  const shifted = shiftCalendarDate(zonedParts(value, timezone), days);
  return zonedDateToUtc(shifted, timezone);
}

module.exports = { addLocalDays, assertTimezone, shiftCalendarDate, startOfLocalDay, zonedDateToUtc, zonedParts };
