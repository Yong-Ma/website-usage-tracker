# Clear Usage Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the popup clear button clear the selected range: today, recent 7 days, or all usage.

**Architecture:** Keep popup UI thin and send `{ type: 'clearUsage', range }` to the background service worker. The background worker resets the active session, clears the requested local storage buckets, and refreshes the active tab so usage restarts immediately after the clear action.

**Tech Stack:** Chrome Extension Manifest V3, ES modules, `chrome.storage.local`, `chrome.storage.session`, Node's built-in test runner.

---

## File Structure

- Modify `src/background/storage.js` to export `clearUsageForRange(range, date, storage)` while preserving `clearUsageForDate(date, storage)`.
- Modify `tests/storage.test.js` to cover clearing today, recent 7 days, and total usage.
- Modify `src/background/service-worker.js` to handle `{ type: 'clearUsage', range }` and preserve `{ type: 'clearTodayUsage' }` as a today alias.
- Modify `src/popup/popup.js` to derive confirmation text, success text, and runtime message range from the active tab.
- Keep `src/popup/popup.html` and `src/popup/popup.css` structurally unchanged unless the clear button needs accessibility attributes.

### Task 1: Range Storage Helper

**Files:**
- Modify: `src/background/storage.js`
- Modify: `tests/storage.test.js`

- [x] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearUsageForDate, clearUsageForRange } from '../src/background/storage.js';

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
  };
}

test('clearUsageForDate removes only the requested local date bucket', async () => {
  const storage = createMemoryStorage({
    usageByDate: {
      '2026-07-04': { 'https://today.example': { seconds: 60 } },
      '2026-07-03': { 'https://yesterday.example': { seconds: 120 } },
    },
  });

  await clearUsageForDate(new Date(2026, 6, 4), storage);

  assert.deepEqual(storage.data.usageByDate, {
    '2026-07-03': { 'https://yesterday.example': { seconds: 120 } },
  });
});

test('clearUsageForRange removes only the recent seven local date buckets', async () => {
  const storage = createMemoryStorage({
    usageByDate: {
      '2026-07-05': { 'https://today.example': { seconds: 60 } },
      '2026-07-04': { 'https://one.example': { seconds: 70 } },
      '2026-07-03': { 'https://two.example': { seconds: 80 } },
      '2026-07-02': { 'https://three.example': { seconds: 90 } },
      '2026-07-01': { 'https://four.example': { seconds: 100 } },
      '2026-06-30': { 'https://five.example': { seconds: 110 } },
      '2026-06-29': { 'https://six.example': { seconds: 120 } },
      '2026-06-28': { 'https://outside.example': { seconds: 130 } },
    },
  });

  await clearUsageForRange('week', new Date(2026, 6, 5), storage);

  assert.deepEqual(storage.data.usageByDate, {
    '2026-06-28': { 'https://outside.example': { seconds: 130 } },
  });
});

test('clearUsageForRange removes all usage for the total range', async () => {
  const storage = createMemoryStorage({
    usageByDate: {
      '2026-07-05': { 'https://today.example': { seconds: 60 } },
      '2026-06-28': { 'https://older.example': { seconds: 130 } },
    },
  });

  await clearUsageForRange('total', new Date(2026, 6, 5), storage);

  assert.deepEqual(storage.data.usageByDate, {});
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/storage.test.js`

Expected: FAIL because `clearUsageForRange` is not exported.

- [x] **Step 3: Write minimal implementation**

```js
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/storage.test.js`

Expected: PASS.

### Task 2: Background Range Message

**Files:**
- Modify: `src/background/service-worker.js`

- [x] **Step 1: Accept range clear messages**

Handle `clearUsage` and `clearTodayUsage` in `chrome.runtime.onMessage`. Map `clearTodayUsage` to `today`.

- [x] **Step 2: Implement reset workflow**

Add `clearUsage(range)` that validates `today`, `week`, or `total`, sets `activeSession = null`, clears the stored session, calls `clearUsageForRange(range, new Date(now))`, and calls `refreshActiveSession()`.

- [x] **Step 3: Preserve async message response**

Return `true` from the listener for handled messages and call `sendResponse({ ok: true })` or `sendResponse({ ok: false, error })`.

### Task 3: Popup Range Copy

**Files:**
- Modify: `src/popup/popup.js`

- [x] **Step 1: Add range-specific copy**

Define copy for `today`, `week`, and `total` confirmations, success messages, button title, and `aria-label`.

- [x] **Step 2: Bind click behavior to the active range**

Send `{ type: 'clearUsage', range: state.range }`, reload `usageByDate`, keep `state.range` unchanged, and render.

- [x] **Step 3: Add failure handling**

Show `清空失败，请重试` if `chrome.runtime.sendMessage` fails or the response is not `{ ok: true }`.

### Task 4: Verification

**Files:**
- Check: all modified source and test files

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Inspect diff**

Run: `git diff -- src/background/storage.js src/background/service-worker.js src/popup/popup.js tests/storage.test.js docs/superpowers/specs/2026-07-04-clear-today-usage-design.md docs/superpowers/plans/2026-07-04-clear-today-usage.md`

Expected: Diff only contains range-clear behavior, matching copy, and documentation updates.

## Self-Review

- Spec coverage: The plan covers popup trigger, range-specific copy, background-owned reset, storage clearing for today/week/total, restart behavior, error handling, and tests.
- Placeholder scan: No placeholder steps remain.
- Type consistency: Message type is consistently `clearUsage`; compatibility message type is consistently `clearTodayUsage`; storage helper is consistently `clearUsageForRange`.
