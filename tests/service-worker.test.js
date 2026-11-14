import test from 'node:test';
import assert from 'node:assert/strict';

function createMemoryStorage(initialData = {}) {
  const data = { ...initialData };
  let failWeeklyWrite = false;
  return {
    data,
    async get(key) {
      if (Array.isArray(key)) return Object.fromEntries(key.map(name => [name, data[name]]));
      return { [key]: data[key] };
    },
    async set(values) {
      if (values.weeklyReports && failWeeklyWrite) {
        failWeeklyWrite = false;
        throw new Error('Storage unavailable');
      }
      Object.assign(data, values);
    },
    failNextWeeklyWrite() { failWeeklyWrite = true; },
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
  const alarms = new Map();
  const notifications = [];
  const openedTabs = [];
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
      getURL: path => `chrome-extension://test/${path}`,
      onInstalled: { addListener: (listener) => addListener('installed', listener) },
      onStartup: { addListener: (listener) => addListener('startup', listener) },
      onMessage: { addListener: (listener) => addListener('message', listener) },
    },
    tabs: {
      onActivated: { addListener: (listener) => addListener('tab-activated', listener) },
      onUpdated: { addListener: (listener) => addListener('tab-updated', listener) },
      query: async () => [activeTab],
      create: async options => openedTabs.push(options),
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
      create: async (name, options) => alarms.set(name, { name, scheduledTime: options.when, ...options }),
      get: async name => alarms.get(name),
      clear: async name => alarms.delete(name),
      onAlarm: { addListener: (listener) => addListener('alarm', listener) },
    },
    storage: {
      local,
      session,
    },
    notifications: {
      getPermissionLevel: async () => 'granted',
      create: async (id, options) => notifications.push({ id, ...options }),
      onClicked: { addListener: listener => addListener('notification-clicked', listener) },
    },
  };

  return {
    local,
    session,
    listeners,
    activeTab,
    alarms,
    notifications,
    openedTabs,
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

test('weekly settings schedule and disable the local alarm while rejecting invalid settings', async () => {
  const environment = createChromeEnvironment();
  await import('../src/background/service-worker.js?weekly-settings');
  await waitForAsyncWork();
  assert.equal(environment.alarms.has('weekly-report'), false);
  const settings = { enabled: true, weekday: 7, time: '21:00' };
  const response = await sendRuntimeMessage(environment, { type: 'setWeeklyReportSettings', settings });
  assert.equal(response.ok, true);
  assert.deepEqual(environment.local.data.weeklyReportSettings, settings);
  const alarm = environment.alarms.get('weekly-report');
  assert.ok(alarm.scheduledTime > Date.now());
  assert.equal(new Date(alarm.scheduledTime).getDay(), 0);
  assert.equal(new Date(alarm.scheduledTime).getHours(), 21);
  const invalid = await sendRuntimeMessage(environment, { type: 'setWeeklyReportSettings', settings: { ...settings, time: '25:00' } });
  assert.equal(invalid.ok, false);
  assert.deepEqual(environment.local.data.weeklyReportSettings, settings);
  await sendRuntimeMessage(environment, { type: 'setWeeklyReportSettings', settings: { ...settings, enabled: false } });
  assert.equal(environment.alarms.has('weekly-report'), false);
});

test('delayed weekly alarm saves one snapshot, resumes tracking and opens the matching report', async () => {
  const environment = createChromeEnvironment();
  const scheduledTime = new Date(2026, 10, 8, 21).getTime();
  environment.local.data.weeklyReportSettings = { enabled: true, weekday: 7, time: '21:00' };
  environment.local.data.usageByDate = { '2026-11-01': { a: { origin: 'https://a.com', seconds: 120 } } };
  await import('../src/background/service-worker.js?weekly-alarm');
  await waitForAsyncWork();
  environment.listeners.get('alarm')({ name: 'weekly-report', scheduledTime });
  await waitForAsyncWork();
  const report = environment.local.data.weeklyReports?.[0];
  assert.equal(report?.id, '2026-11-01_2026-11-07');
  assert.equal(report.totalSeconds, 120);
  assert.equal(environment.notifications.length, 1);
  assert.equal(environment.session.data.activeUsageSession?.origin, 'https://github.com');
  assert.ok(environment.alarms.get('weekly-report').scheduledTime > Date.now());
  environment.listeners.get('alarm')({ name: 'weekly-report', scheduledTime });
  await waitForAsyncWork();
  assert.equal(environment.local.data.weeklyReports.length, 1);
  assert.equal(environment.notifications.length, 1);
  environment.listeners.get('notification-clicked')(`weekly-report:${report.id}`);
  await waitForAsyncWork();
  assert.equal(environment.openedTabs[0].url, `chrome-extension://test/src/reports/reports.html?report=${report.id}`);
  await sendRuntimeMessage(environment, { type: 'clearUsage', range: 'total' });
  assert.equal(environment.local.data.weeklyReports[0].totalSeconds, 120);
});

test('startup recovers an overdue alarm even when Chrome lost the alarm itself', async () => {
  const environment = createChromeEnvironment();
  const scheduledTime = new Date(2026, 10, 8, 21).getTime();
  environment.local.data.weeklyReportSettings = { enabled: true, weekday: 7, time: '21:00' };
  environment.local.data.weeklyReportStatus = { nextScheduledTime: scheduledTime };
  environment.local.data.usageByDate = { '2026-11-01': { a: { origin: 'https://a.com', seconds: 120 } } };
  globalThis.chrome.notifications.create = async () => { throw new Error('Notifications blocked'); };
  await import('../src/background/service-worker.js?weekly-recovery');
  await waitForAsyncWork();
  assert.equal(environment.local.data.weeklyReports?.[0].id, '2026-11-01_2026-11-07');
  assert.equal(environment.local.data.weeklyReportStatus.notificationError, true);
  assert.equal(environment.local.data.weeklyReportStatus.notificationPermission, 'granted');
  assert.ok(environment.alarms.get('weekly-report').scheduledTime > Date.now());
  const state = await sendRuntimeMessage(environment, { type: 'getWeeklyReports' });
  assert.equal(state.ok, true);
  assert.equal(state.reports.length, 1);
});

test('a failed overdue report write retains its scheduled time and retries on the next heartbeat', async () => {
  const environment = createChromeEnvironment();
  const scheduledTime = new Date(2026, 10, 8, 21).getTime();
  environment.local.data.weeklyReportSettings = { enabled: true, weekday: 7, time: '21:00' };
  environment.local.data.weeklyReportStatus = { nextScheduledTime: scheduledTime };
  environment.local.data.usageByDate = { '2026-11-01': { a: { origin: 'https://a.com', seconds: 120 } } };
  environment.local.failNextWeeklyWrite();
  await import('../src/background/service-worker.js?weekly-write-retry');
  await waitForAsyncWork();
  assert.equal(environment.local.data.weeklyReports?.length || 0, 0);
  assert.equal(environment.local.data.weeklyReportStatus.nextScheduledTime, scheduledTime);
  assert.equal(environment.local.data.weeklyReportStatus.generationError, true);
  environment.listeners.get('alarm')({ name: 'usage-heartbeat' });
  await waitForAsyncWork();
  assert.equal(environment.local.data.weeklyReports[0].id, '2026-11-01_2026-11-07');
  assert.ok(environment.local.data.weeklyReportStatus.nextScheduledTime > Date.now());
  assert.equal(environment.local.data.weeklyReportStatus.generationError, false);
});

test('an empty interval skips the report and disabled settings ignore late alarms', async () => {
  const environment = createChromeEnvironment();
  environment.local.data.weeklyReportSettings = { enabled: true, weekday: 7, time: '21:00' };
  await import('../src/background/service-worker.js?weekly-empty');
  await waitForAsyncWork();
  const alarm = { name: 'weekly-report', scheduledTime: new Date(2026, 10, 8, 21).getTime() };
  environment.listeners.get('alarm')(alarm);
  await waitForAsyncWork();
  assert.equal(environment.local.data.weeklyReports?.length || 0, 0);
  assert.equal(environment.notifications.length, 0);
  assert.ok(environment.alarms.get('weekly-report').scheduledTime > Date.now());
  await sendRuntimeMessage(environment, { type: 'setWeeklyReportSettings', settings: { enabled: false, weekday: 7, time: '21:00' } });
  environment.local.data.usageByDate['2026-11-01'] = { a: { origin: 'https://a.com', seconds: 120 } };
  environment.listeners.get('alarm')(alarm);
  await waitForAsyncWork();
  assert.equal(environment.local.data.weeklyReports?.length || 0, 0);
});

test('failed rescheduling keeps the chosen time and repairs a stale Chrome alarm on retry', async () => {
  const environment = createChromeEnvironment();
  await import('../src/background/service-worker.js?weekly-schedule-failure');
  await waitForAsyncWork();
  await sendRuntimeMessage(environment, { type: 'setWeeklyReportSettings', settings: { enabled: true, weekday: 7, time: '21:00' } });
  const originalCreate = chrome.alarms.create;
  chrome.alarms.create = async () => { throw new Error('Alarm unavailable'); };
  const response = await sendRuntimeMessage(environment, { type: 'setWeeklyReportSettings', settings: { enabled: true, weekday: 1, time: '08:30' } });
  assert.equal(response.ok, true);
  assert.equal(response.status.scheduleError, true);
  const requestedTime = response.status.nextScheduledTime;
  chrome.alarms.create = originalCreate;
  environment.listeners.get('alarm')({ name: 'usage-heartbeat' });
  await waitForAsyncWork();
  assert.equal(environment.alarms.get('weekly-report').scheduledTime, requestedTime);
  assert.equal(environment.local.data.weeklyReportStatus.scheduleError, false);
});

test('import replaces the weekly schedule and keeps imported snapshots', async () => {
  const environment = createChromeEnvironment();
  await import('../src/background/service-worker.js?weekly-import');
  await waitForAsyncWork();
  const { buildWeeklyReport } = await import('../src/shared/weekly-report-aggregation.js');
  const report = buildWeeklyReport({ '2026-11-01': { a: { origin: 'https://a.com', seconds: 120 } } }, new Date(2026, 10, 8));
  const response = await sendRuntimeMessage(environment, { type: 'importBackup', data: {
    usageByDate: {}, trackingPaused: false, excludedOrigins: [], popupLanguage: 'zh',
    weeklyReportSettings: { enabled: true, weekday: 2, time: '12:30' }, weeklyReports: [report],
  } });
  assert.equal(response.ok, true);
  assert.deepEqual(environment.local.data.weeklyReports, [report]);
  const time = new Date(environment.alarms.get('weekly-report').scheduledTime);
  assert.equal(time.getDay(), 2);
  assert.equal(time.getHours(), 12);
  assert.equal(time.getMinutes(), 30);
});

test('service worker restores a complete backup and refreshes the active session', async () => {
  const environment = createChromeEnvironment();
  await import('../src/background/service-worker.js?backup-import');
  const response = await sendRuntimeMessage(environment, {
    type: 'importBackup',
    data: {
      usageByDate: {
        '2026-08-30': {
          'https://restored.example': { seconds: 300 },
        },
      },
      trackingPaused: false,
      excludedOrigins: ['https://blocked.example'],
      popupLanguage: 'zh',
    },
  });
  await waitForAsyncWork();

  assert.equal(response.ok, true);
  assert.deepEqual(environment.local.data.usageByDate, {
    '2026-08-30': {
      'https://restored.example': { seconds: 300 },
    },
  });
  assert.equal(environment.local.data.trackingPaused, false);
  assert.deepEqual(environment.local.data.excludedOrigins, ['https://blocked.example']);
  assert.equal(environment.local.data.popupLanguage, 'zh');
  assert.equal(environment.session.data.activeUsageSession?.origin, 'https://github.com');
});

test('service worker does not keep an active session when an imported backup is paused', async () => {
  const environment = createChromeEnvironment();
  await import('../src/background/service-worker.js?backup-import-paused');
  const response = await sendRuntimeMessage(environment, {
    type: 'importBackup',
    data: {
      usageByDate: {},
      trackingPaused: true,
      excludedOrigins: [],
      popupLanguage: 'en',
    },
  });
  await waitForAsyncWork();

  assert.equal(response.ok, true);
  assert.equal(environment.local.data.trackingPaused, true);
  assert.equal(environment.session.data.activeUsageSession, undefined);
});

test('service worker rejects invalid backup data without changing storage', async () => {
  const environment = createChromeEnvironment();
  await import('../src/background/service-worker.js?backup-import-invalid');
  await waitForAsyncWork();
  const before = structuredClone(environment.local.data);
  const response = await sendRuntimeMessage(environment, {
    type: 'importBackup',
    data: {
      usageByDate: [],
      trackingPaused: false,
      excludedOrigins: [],
      popupLanguage: 'en',
    },
  });

  assert.equal(response.ok, false);
  assert.deepEqual(environment.local.data, before);
});
