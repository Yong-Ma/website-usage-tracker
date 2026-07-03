import { getLocalDateKey } from '../shared/site-utils.js';

const STORAGE_KEY = 'usageByDate';

export async function readUsageByDate() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const usageByDate = result?.[STORAGE_KEY];
  return isPlainObject(usageByDate) ? usageByDate : {};
}

export async function addUsageSeconds({ origin, faviconUrl = '', seconds, visitedAt = Date.now() }) {
  if (!origin || !Number.isFinite(seconds) || seconds < 1) {
    return;
  }

  const usageByDate = await readUsageByDate();
  const dateKey = getLocalDateKey(new Date(visitedAt));
  const dayUsage = isPlainObject(usageByDate[dateKey]) ? usageByDate[dateKey] : {};
  const existing = isPlainObject(dayUsage[origin]) ? dayUsage[origin] : {};
  const previousSeconds = Number.isFinite(existing.seconds) ? existing.seconds : 0;

  dayUsage[origin] = {
    origin,
    seconds: previousSeconds + Math.floor(seconds),
    faviconUrl: faviconUrl || existing.faviconUrl || '',
    lastVisitedAt: visitedAt,
  };

  usageByDate[dateKey] = dayUsage;
  await chrome.storage.local.set({ [STORAGE_KEY]: usageByDate });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
