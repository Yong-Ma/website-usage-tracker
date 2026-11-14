import { canonicalizeUrl } from './site-utils.js';
import { reportDateKeys } from './weekly-report-schedule.js';

export function buildWeeklyReport(usageByDate, scheduledTime, excludedOrigins = [], createdAt = Date.now()) {
  const dates = reportDateKeys(scheduledTime);
  const current = aggregateDays(dates, usageByDate, excludedOrigins);
  if (current.totalSeconds === 0) return null;
  const previous = aggregateDays(reportDateKeys(scheduledTime, 7), usageByDate, excludedOrigins);
  const hasPrevious = previous.totalSeconds > 0;
  const origins = new Set([...current.sites.keys(), ...previous.sites.keys()]);
  const changes = [...origins].map(origin => ({
    origin,
    secondsDelta: (current.sites.get(origin)?.seconds || 0) - (previous.sites.get(origin)?.seconds || 0),
  })).sort((a, b) => Math.abs(b.secondsDelta) - Math.abs(a.secondsDelta)
    || (current.sites.get(b.origin)?.seconds || 0) - (current.sites.get(a.origin)?.seconds || 0)
    || a.origin.localeCompare(b.origin));
  return {
    id: `${dates[0]}_${dates[6]}`,
    rangeStart: dates[0],
    rangeEnd: dates[6],
    createdAt,
    totalSeconds: current.totalSeconds,
    previousTotalSeconds: hasPrevious ? previous.totalSeconds : null,
    topSites: [...current.sites.values()].sort((a, b) => b.seconds - a.seconds || a.origin.localeCompare(b.origin)).slice(0, 3),
    largestChange: hasPrevious ? changes[0] : null,
    leastUsedDay: current.days.sort((a, b) => a.seconds - b.seconds || a.dateKey.localeCompare(b.dateKey))[0],
  };
}

function aggregateDays(dates, usage, excludedOrigins) {
  const sites = new Map();
  const excluded = new Set(excludedOrigins);
  const days = dates.map(dateKey => {
    let seconds = 0;
    for (const record of Object.values(usage?.[dateKey] || {})) {
      if (!record || canonicalizeUrl(record.origin) !== record.origin || excluded.has(record.origin)
        || !Number.isFinite(record.seconds) || record.seconds < 1) continue;
      const amount = Math.floor(record.seconds);
      const site = sites.get(record.origin) || { origin: record.origin, seconds: 0, faviconUrl: '' };
      site.seconds += amount;
      if (typeof record.faviconUrl === 'string') site.faviconUrl = record.faviconUrl;
      sites.set(record.origin, site);
      seconds += amount;
    }
    return { dateKey, seconds };
  });
  return { sites, days, totalSeconds: days.reduce((sum, day) => sum + day.seconds, 0) };
}
