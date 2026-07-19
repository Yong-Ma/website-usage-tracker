const ACTIVE_SESSION_KEY = 'activeUsageSession';
const fallbackData = {};

export async function readStoredSession(storage = getSessionStorage()) {
  const result = await storage.get(ACTIVE_SESSION_KEY);
  const session = result?.[ACTIVE_SESSION_KEY];
  return isValidSession(session) ? session : null;
}

export async function writeStoredSession(session, storage = getSessionStorage()) {
  if (!isValidSession(session)) {
    await clearStoredSession(storage);
    return;
  }

  await storage.set({ [ACTIVE_SESSION_KEY]: session });
}

export async function clearStoredSession(storage = getSessionStorage()) {
  await storage.remove(ACTIVE_SESSION_KEY);
}

function getSessionStorage() {
  return globalThis.chrome?.storage?.session ?? fallbackStorage;
}

const fallbackStorage = {
  async get(key) {
    return { [key]: fallbackData[key] };
  },
  async set(values) {
    Object.assign(fallbackData, values);
  },
  async remove(key) {
    delete fallbackData[key];
  },
};

function isValidSession(session) {
  return Boolean(
    session
      && typeof session.origin === 'string'
      && session.origin.length > 0
      && typeof session.faviconUrl === 'string'
      && Number.isFinite(session.startedAt)
      && session.startedAt > 0,
  );
}
