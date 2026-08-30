import {
  canonicalizeUrl,
  getLocalDateKey,
  getRecentDateKeys,
} from '../shared/site-utils.js';

const STORAGE_KEY = 'usageByDate';
const TRACKING_PAUSED_KEY = 'trackingPaused';
const EXCLUDED_ORIGINS_KEY = 'excludedOrigins';

export async function readUsageByDate() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const usageByDate = result?.[STORAGE_KEY];
  return isPlainObject(usageByDate) ? usageByDate : {};
}

export async function isTrackingPaused(storage = chrome.storage.local) {
  const result = await storage.get(TRACKING_PAUSED_KEY);
  return result?.[TRACKING_PAUSED_KEY] === true;
}

export async function setTrackingPaused(isPaused, storage = chrome.storage.local) {
  await storage.set({ [TRACKING_PAUSED_KEY]: isPaused === true });
}

export async function readExcludedOrigins(storage = chrome.storage.local) {
  const result = await storage.get(EXCLUDED_ORIGINS_KEY);
  const origins = result?.[EXCLUDED_ORIGINS_KEY];
  return Array.isArray(origins)
    ? origins.filter((origin) => typeof origin === 'string')
    : [];
}

export async function setOriginExcluded(origin, isExcluded, storage = chrome.storage.local) {
  const canonicalOrigin = canonicalizeUrl(origin);
  if (!canonicalOrigin) {
    throw new Error('无效的网站');
  }

  const currentOrigins = await readExcludedOrigins(storage);
  const nextOrigins = isExcluded === true
    ? Array.from(new Set([...currentOrigins, canonicalOrigin]))
    : currentOrigins.filter((currentOrigin) => currentOrigin !== canonicalOrigin);

  await storage.set({ [EXCLUDED_ORIGINS_KEY]: nextOrigins });
}

export async function clearUsageForDate(date = new Date(), storage = chrome.storage.local) {
  const result = await storage.get(STORAGE_KEY);
  const usageByDate = isPlainObject(result?.[STORAGE_KEY]) ? result[STORAGE_KEY] : {};
  delete usageByDate[getLocalDateKey(date)];
  await storage.set({ [STORAGE_KEY]: usageByDate });
}

export async function clearUsageForRange(range, date = new Date(), storage = chrome.storage.local) {
  const result = await storage.get(STORAGE_KEY);
  const usageByDate = isPlainObject(result?.[STORAGE_KEY]) ? result[STORAGE_KEY] : {};

  if (range === 'total') {
    await storage.set({ [STORAGE_KEY]: {} });
    return;
  }

  const dateKeys = range === 'week'
    ? getRecentDateKeys(date, 7)
    : [getLocalDateKey(date)];

  for (const dateKey of dateKeys) {
    delete usageByDate[dateKey];
  }

  await storage.set({ [STORAGE_KEY]: usageByDate });
}

export async function deleteUsageForOrigin(origin, range, date = new Date(), storage = chrome.storage.local) {
  if (!origin) {
    return;
  }

  const result = await storage.get(STORAGE_KEY);
  const usageByDate = isPlainObject(result?.[STORAGE_KEY]) ? result[STORAGE_KEY] : {};
  const dateKeys = getDateKeysForRange(usageByDate, range, date);

  for (const dateKey of dateKeys) {
    const dayUsage = usageByDate[dateKey];
    if (isPlainObject(dayUsage)) {
      delete dayUsage[origin];
    }
  }

  await storage.set({ [STORAGE_KEY]: usageByDate });
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

function getDateKeysForRange(usageByDate, range, date) {
  if (range === 'week') {
    return getRecentDateKeys(date, 7);
  }

  if (range === 'total') {
    return Object.keys(usageByDate);
  }

  return [getLocalDateKey(date)];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
