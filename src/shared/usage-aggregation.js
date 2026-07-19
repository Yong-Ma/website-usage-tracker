import { getLocalDateKey, getRecentDateKeys } from './site-utils.js';

const MAX_RANKING_ROWS = 10;

export function aggregateUsage(usageByDate = {}, range = 'today', today = new Date()) {
  const dateKeys = getDateKeysForRange(usageByDate, range, today);
  const byOrigin = new Map();

  for (const dateKey of dateKeys) {
    const sites = usageByDate?.[dateKey] ?? {};
    for (const record of Object.values(sites)) {
      if (!record?.origin || !Number.isFinite(record.seconds)) {
        continue;
      }

      const existing = byOrigin.get(record.origin) ?? {
        origin: record.origin,
        seconds: 0,
        faviconUrl: '',
        lastVisitedAt: 0,
      };

      existing.seconds += Math.max(0, Math.floor(record.seconds));

      if (record.lastVisitedAt && record.lastVisitedAt >= existing.lastVisitedAt) {
        existing.lastVisitedAt = record.lastVisitedAt;
        if (record.faviconUrl) {
          existing.faviconUrl = record.faviconUrl;
        }
      } else if (!existing.faviconUrl && record.faviconUrl) {
        existing.faviconUrl = record.faviconUrl;
      }

      byOrigin.set(record.origin, existing);
    }
  }

  const rows = [...byOrigin.values()].sort((a, b) => {
    if (b.seconds !== a.seconds) return b.seconds - a.seconds;
    if (b.lastVisitedAt !== a.lastVisitedAt) return b.lastVisitedAt - a.lastVisitedAt;
    return a.origin.localeCompare(b.origin);
  });

  const totalSeconds = rows.reduce((sum, row) => sum + row.seconds, 0);

  return {
    rows: rows.slice(0, MAX_RANKING_ROWS),
    totalSeconds,
  };
}

function getDateKeysForRange(usageByDate, range, today) {
  if (range === 'week') {
    return getRecentDateKeys(today, 7);
  }

  if (range === 'total') {
    return Object.keys(usageByDate ?? {});
  }

  return [getLocalDateKey(today)];
}
