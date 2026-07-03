import { canonicalizeUrl } from '../shared/site-utils.js';
import { createSession, calculateElapsedSeconds } from '../shared/session.js';
import { addUsageSeconds } from './storage.js';

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

async function refreshActiveSession(updatedTab = null) {
  const now = Date.now();
  await flushActiveSession(now);

  const tab = await getCurrentActiveTab(updatedTab);
  const nextSession = getSessionFromTab(tab, now);
  activeSession = nextSession;
}

async function flushActiveSession(now = Date.now()) {
  const elapsedSeconds = calculateElapsedSeconds(activeSession, now);
  if (elapsedSeconds > 0) {
    await addUsageSeconds({
      origin: activeSession.origin,
      faviconUrl: activeSession.faviconUrl,
      seconds: elapsedSeconds,
      visitedAt: now,
    });
  }
  activeSession = null;
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
