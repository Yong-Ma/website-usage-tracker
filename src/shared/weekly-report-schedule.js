import { getLocalDateKey } from './site-utils.js';

export const DEFAULT_WEEKLY_REPORT_SETTINGS = Object.freeze({ enabled: false, weekday: 7, time: '21:00' });

export function normalizeWeeklyReportSettings(value = DEFAULT_WEEKLY_REPORT_SETTINGS) {
  if (!value || typeof value.enabled !== 'boolean' || !Number.isInteger(value.weekday)
    || value.weekday < 1 || value.weekday > 7 || typeof value.time !== 'string'
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) {
    throw new Error('周报提醒设置无效');
  }
  return { enabled: value.enabled, weekday: value.weekday, time: value.time };
}

export function nextWeeklyReportTime(settings, now = new Date()) {
  const { weekday, time } = normalizeWeeklyReportSettings(settings);
  const current = new Date(now);
  const next = new Date(current);
  const [hours, minutes] = time.split(':').map(Number);
  next.setDate(next.getDate() + (weekday - (current.getDay() || 7) + 7) % 7);
  next.setHours(hours, minutes, 0, 0);
  if (next <= current) next.setDate(next.getDate() + 7);
  return next.getTime();
}

export function reportDateKeys(scheduledTime, offset = 0) {
  const end = new Date(scheduledTime);
  end.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(end);
    day.setDate(day.getDate() - 7 + index - offset);
    return getLocalDateKey(day);
  });
}
