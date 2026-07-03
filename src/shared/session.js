export function createSession(origin, faviconUrl = '', startedAt = Date.now()) {
  return {
    origin,
    faviconUrl: faviconUrl || '',
    startedAt,
  };
}

export function calculateElapsedSeconds(session, now = Date.now()) {
  if (!session?.startedAt) {
    return 0;
  }
  return Math.max(0, Math.floor((now - session.startedAt) / 1000));
}
