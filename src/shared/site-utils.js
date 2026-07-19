const TRACKABLE_PROTOCOLS = new Set(['http:', 'https:']);

export function canonicalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!TRACKABLE_PROTOCOLS.has(url.protocol)) {
      return null;
    }
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return null;
  }
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getRecentDateKeys(today = new Date(), count = 7) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - index);
    return getLocalDateKey(date);
  });
}

export function formatDuration(totalSeconds, language = 'en') {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const isChinese = language === 'zh';

  if (seconds < 60) {
    return isChinese ? `${seconds}秒` : `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return isChinese ? `${minutes}分${seconds % 60}秒` : `${minutes}m${seconds % 60}s`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return isChinese ? `${hours}小时${minutes % 60}分` : `${hours}h${minutes % 60}m`;
  }

  const days = Math.floor(hours / 24);
  return isChinese ? `${days}天${hours % 24}小时` : `${days}d${hours % 24}h`;
}
