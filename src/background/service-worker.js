import { canonicalizeUrl } from '../shared/site-utils.js';
import { createSession, calculateElapsedSeconds } from '../shared/session.js';
import { normalizeBackupData } from '../shared/backup.js';
import { clearStoredSession, readStoredSession, writeStoredSession } from './session-store.js';
import {
  addUsageSeconds,
  clearUsageForRange,
  deleteUsageForOrigin,
  isTrackingPaused,
  readExcludedOrigins,
  writeAllData,
  setOriginExcluded,
  setTrackingPaused,
} from './storage.js';

let activeSession = null;
let idleState = 'active';
let focusedWindowId = null;
let hasFocusSignal = false;
let refreshQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  ensureHeartbeatAlarm();
  queueRefresh();
});

chrome.runtime.onStartup.addListener(() => {
  ensureHeartbeatAlarm();
  queueRefresh();
});

chrome.tabs.onActivated.addListener(() => {
  queueRefresh();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    queueRefresh(tab);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  hasFocusSignal = true;
  focusedWindowId = windowId === chrome.windows.WINDOW_ID_NONE ? null : windowId;
  queueRefresh();
});

chrome.idle.onStateChanged.addListener((newState) => {
  idleState = newState;
  queueRefresh();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'usage-heartbeat') {
    queueRefresh();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    message?.type !== 'clearUsage'
    && message?.type !== 'clearTodayUsage'
    && message?.type !== 'deleteUsageForOrigin'
    && message?.type !== 'setOriginExcluded'
    && message?.type !== 'importBackup'
    && message?.type !== 'setTrackingPaused'
  ) {
    return false;
  }

  if (message?.type === 'setTrackingPaused') {
    queueSetTrackingPaused(message.isPaused === true)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error('Failed to update tracking pause setting', error);
        sendResponse({
          ok: false,
          error: error?.message || '设置失败，请重试',
        });
      });

    return true;
  }

  if (message?.type === 'importBackup') {
    queueImportBackup(message.data)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error('Failed to import backup', error);
        sendResponse({
          ok: false,
          error: error?.message || '导入失败，请重试',
        });
      });

    return true;
  }

  if (message?.type === 'deleteUsageForOrigin') {
    queueDeleteUsageForOrigin(message.origin, message.range)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error('Failed to delete usage for origin', error);
        sendResponse({
          ok: false,
          error: error?.message || '删除失败，请重试',
        });
      });

    return true;
  }

  if (message?.type === 'setOriginExcluded') {
    queueSetOriginExcluded(message.origin, message.isExcluded === true)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        console.error('Failed to update excluded origins', error);
        sendResponse({
          ok: false,
          error: error?.message || '排除设置失败，请重试',
        });
      });

    return true;
  }

  const range = message?.type === 'clearTodayUsage' ? 'today' : message?.range;

  queueClearUsage(range)
    .then(() => {
      sendResponse({ ok: true });
    })
    .catch((error) => {
      console.error('Failed to clear usage', error);
      sendResponse({
        ok: false,
        error: error?.message || '清空失败，请重试',
      });
    });

  return true;
});

chrome.idle.queryState(60, (state) => {
  idleState = state;
  ensureHeartbeatAlarm();
  queueRefresh();
});

function queueRefresh(updatedTab = null) {
  refreshQueue = refreshQueue
    .then(() => refreshActiveSession(updatedTab))
    .catch((error) => {
      console.error('Failed to refresh active usage session', error);
    });
  return refreshQueue;
}

function ensureHeartbeatAlarm() {
  chrome.alarms.create('usage-heartbeat', { periodInMinutes: 1 });
}

function queueClearUsage(range) {
  const clearPromise = refreshQueue.then(() => clearUsage(range));
  refreshQueue = clearPromise.catch((error) => {
    console.error('Failed to clear usage', error);
  });
  return clearPromise;
}

function queueDeleteUsageForOrigin(origin, range) {
  const deletePromise = refreshQueue.then(() => deleteUsageForOriginFromRange(origin, range));
  refreshQueue = deletePromise.catch((error) => {
    console.error('Failed to delete usage for origin', error);
  });
  return deletePromise;
}

function queueSetTrackingPaused(isPaused) {
  const pausePromise = refreshQueue.then(() => updateTrackingPaused(isPaused));
  refreshQueue = pausePromise.catch((error) => {
    console.error('Failed to update tracking pause setting', error);
  });
  return pausePromise;
}

function queueSetOriginExcluded(origin, isExcluded) {
  const excludePromise = refreshQueue.then(() => updateOriginExcluded(origin, isExcluded));
  refreshQueue = excludePromise.catch((error) => {
    console.error('Failed to update excluded origins', error);
  });
  return excludePromise;
}

function queueImportBackup(data) {
  const importPromise = refreshQueue.then(() => importBackupData(data));
  refreshQueue = importPromise.catch((error) => {
    console.error('Failed to import backup', error);
  });
  return importPromise;
}

async function importBackupData(data) {
  const normalizedData = normalizeBackupData(data);
  await flushActiveSession();
  await writeAllData(normalizedData);
  activeSession = null;
  await refreshActiveSession();
}

async function clearUsage(range, now = Date.now()) {
  if (!['today', 'week', 'total'].includes(range)) {
    throw new Error('未知的清空范围');
  }

  activeSession = null;
  await clearStoredSession();
  await clearUsageForRange(range, new Date(now));
  await refreshActiveSession();
}

async function deleteUsageForOriginFromRange(origin, range, now = Date.now()) {
  if (!origin) {
    throw new Error('缺少要删除的网站');
  }

  if (!['today', 'week', 'total'].includes(range)) {
    throw new Error('未知的删除范围');
  }

  await flushActiveSession(now);
  await deleteUsageForOrigin(origin, range, new Date(now));
  await refreshActiveSession();
}

async function refreshActiveSession(updatedTab = null) {
  const now = Date.now();
  if (await isTrackingPaused()) {
    activeSession = null;
    await clearStoredSession();
    return;
  }

  await flushActiveSession(now);

  const tab = await getCurrentActiveTab(updatedTab);
  const nextSession = getSessionFromTab(tab, now);
  if (nextSession && await isOriginExcluded(nextSession.origin)) {
    activeSession = null;
    await clearStoredSession();
    return;
  }

  activeSession = nextSession;
  await writeActiveSession(nextSession);
}

async function isOriginExcluded(origin) {
  const excludedOrigins = await readExcludedOrigins();
  return excludedOrigins.includes(origin);
}

async function updateTrackingPaused(isPaused, now = Date.now()) {
  if (isPaused) {
    await flushActiveSession(now);
    await setTrackingPaused(true);
    activeSession = null;
    await clearStoredSession();
    return;
  }

  await setTrackingPaused(false);
  await refreshActiveSession();
}

async function updateOriginExcluded(origin, isExcluded, now = Date.now()) {
  const canonicalOrigin = canonicalizeUrl(origin);
  if (!canonicalOrigin) {
    throw new Error('无效的网站');
  }

  if (isExcluded) {
    await flushActiveSession(now);
  }

  await setOriginExcluded(canonicalOrigin, isExcluded);
  await refreshActiveSession();
}

async function flushActiveSession(now = Date.now()) {
  const session = activeSession ?? await readStoredSession();
  const elapsedSeconds = calculateElapsedSeconds(session, now);
  if (elapsedSeconds > 0) {
    await addUsageSeconds({
      origin: session.origin,
      faviconUrl: session.faviconUrl,
      seconds: elapsedSeconds,
      visitedAt: now,
    });
  }
  activeSession = null;
  await clearStoredSession();
}

async function getCurrentActiveTab(updatedTab) {
  if (idleState !== 'active') {
    return null;
  }

  const windowId = await getFocusedWindowId();
  if (!windowId) {
    return null;
  }

  if (updatedTab?.active && updatedTab.windowId === windowId) {
    return updatedTab;
  }

  const tabs = await chrome.tabs.query({ active: true, windowId });
  return tabs[0] ?? null;
}

async function getFocusedWindowId() {
  if (hasFocusSignal) {
    return focusedWindowId;
  }

  try {
    const focusedWindow = await chrome.windows.getLastFocused({
      populate: false,
      windowTypes: ['normal'],
    });
    focusedWindowId = focusedWindow?.id ?? null;
    hasFocusSignal = true;
    return focusedWindowId;
  } catch {
    return null;
  }
}

function getSessionFromTab(tab, now) {
  if (!tab?.url) {
    return null;
  }

  const origin = canonicalizeUrl(tab.url);
  if (!origin) {
    return null;
  }

  return createSession(origin, tab.favIconUrl || '', now);
}

async function writeActiveSession(session) {
  if (session) {
    await writeStoredSession(session);
  } else {
    await clearStoredSession();
  }
}
