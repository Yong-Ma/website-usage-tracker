import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '../src/background/session-store.js';

function createMemoryStorage(initialData = {}) {
  const data = { ...initialData };
  return {
    data,
    async get(key) {
      return { [key]: data[key] };
    },
    async set(values) {
      Object.assign(data, values);
    },
    async remove(key) {
      delete data[key];
    },
  };
}

test('stored active session survives a new read and can be cleared', async () => {
  const storage = createMemoryStorage();
  const session = {
    origin: 'https://github.com',
    faviconUrl: 'github.ico',
    startedAt: 1000,
  };

  await writeStoredSession(session, storage);

  assert.deepEqual(await readStoredSession(storage), session);

  await clearStoredSession(storage);

  assert.equal(await readStoredSession(storage), null);
});

test('invalid stored session is ignored', async () => {
  const storage = createMemoryStorage({
    activeUsageSession: {
      origin: '',
      faviconUrl: '',
      startedAt: 1000,
    },
  });

  assert.equal(await readStoredSession(storage), null);
});

test('stored active session falls back when chrome session storage is unavailable', async () => {
  const originalChrome = globalThis.chrome;
  globalThis.chrome = { storage: {} };

  try {
    const session = {
      origin: 'https://example.com',
      faviconUrl: '',
      startedAt: 2000,
    };

    await writeStoredSession(session);

    assert.deepEqual(await readStoredSession(), session);

    await clearStoredSession();

    assert.equal(await readStoredSession(), null);
  } finally {
    if (originalChrome) {
      globalThis.chrome = originalChrome;
    } else {
      delete globalThis.chrome;
    }
  }
});
