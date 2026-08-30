import test from 'node:test';
import assert from 'node:assert/strict';

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

function createChromeEnvironment() {
  const local = createMemoryStorage({
    usageByDate: {},
    excludedOrigins: [],
  });
  const session = createMemoryStorage({
    activeUsageSession: {
      origin: 'https://example.com',
      faviconUrl: '',
      startedAt: Date.now() - 5000,
    },
  });
  const listeners = new Map();
  const activeTab = {
    id: 1,
    active: true,
    windowId: 1,
    url: 'https://github.com',
    favIconUrl: '',
  };

  function addListener(name, listener) {
    listeners.set(name, listener);
  }

  globalThis.chrome = {
    runtime: {
      onInstalled: { addListener: (listener) => addListener('installed', listener) },
      onStartup: { addListener: (listener) => addListener('startup', listener) },
      onMessage: { addListener: (listener) => addListener('message', listener) },
    },
    tabs: {
      onActivated: { addListener: (listener) => addListener('tab-activated', listener) },
      onUpdated: { addListener: (listener) => addListener('tab-updated', listener) },
      query: async () => [activeTab],
    },
    windows: {
      WINDOW_ID_NONE: -1,
      onFocusChanged: { addListener: (listener) => addListener('focus-changed', listener) },
      getLastFocused: async () => ({ id: 1 }),
    },
    idle: {
      onStateChanged: { addListener: (listener) => addListener('idle-changed', listener) },
      queryState: (_threshold, callback) => {
        queueMicrotask(() => callback('active'));
      },
    },
    alarms: {
      create: () => {},
      onAlarm: { addListener: (listener) => addListener('alarm', listener) },
    },
    storage: {
      local,
      session,
    },
  };

  return {
    local,
    session,
    listeners,
    activeTab,
  };
}

function sendRuntimeMessage(environment, message) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Runtime message was not handled'));
    }, 100);

    const result = environment.listeners.get('message')(
      message,
      {},
      (response) => {
        clearTimeout(timeout);
        resolve(response);
      },
    );

    if (result === false) {
      clearTimeout(timeout);
      resolve({ ok: false, error: 'unhandled message' });
    }
  });
}

function waitForAsyncWork() {
  return new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
}

test('service worker stops and resumes active sessions for excluded origins', async () => {
  const environment = createChromeEnvironment();

  await import('../src/background/service-worker.js');
  await waitForAsyncWork();

  const excludeResponse = await sendRuntimeMessage(environment, {
    type: 'setOriginExcluded',
    origin: 'https://github.com',
    isExcluded: true,
  });
  await waitForAsyncWork();

  assert.equal(excludeResponse.ok, true);
  assert.deepEqual(environment.local.data.excludedOrigins, ['https://github.com']);
  assert.equal(environment.session.data.activeUsageSession, undefined);

  const exitResponse = await sendRuntimeMessage(environment, {
    type: 'setOriginExcluded',
    origin: 'https://github.com',
    isExcluded: false,
  });
  await waitForAsyncWork();

  assert.equal(exitResponse.ok, true);
  assert.deepEqual(environment.local.data.excludedOrigins, []);
  assert.equal(environment.session.data.activeUsageSession?.origin, 'https://github.com');
});
