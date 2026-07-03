# 网站使用时长统计插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个原生 Chrome Manifest V3 插件，记录当前激活网站的使用时长，并在弹窗中按今日、7 天、总计展示带 icon 的时长榜单。

**Architecture:** 纯逻辑模块放在 `src/shared/`，用 Node 内置 test runner 测试；后台 `src/background/service-worker.js` 只负责监听 Chrome 事件、维护当前会话并调用存储函数；弹窗 `src/popup/` 读取存储并渲染 B 布局榜单。插件无构建步骤，Chrome 直接加载仓库中的静态文件。

**Tech Stack:** Chrome Manifest V3, vanilla JavaScript ES modules, HTML, CSS, Node built-in `node:test`.

---

## File Structure

- Create `package.json`: defines `npm test`.
- Create `manifest.json`: Chrome extension manifest.
- Create `src/shared/site-utils.js`: URL 规范化、日期 key、时长格式化、favicon fallback helpers.
- Create `src/shared/usage-aggregation.js`: 今日/7 天/总计聚合和排序。
- Create `src/shared/session.js`: 计时会话 elapsed seconds 计算。
- Create `src/background/storage.js`: `chrome.storage.local` read/write wrapper.
- Create `src/background/service-worker.js`: Chrome event integration.
- Create `src/popup/popup.html`: popup markup.
- Create `src/popup/popup.css`: B 布局样式。
- Create `src/popup/popup.js`: popup rendering and range switching.
- Create `assets/icon.svg`: extension icon and favicon fallback.
- Create tests under `tests/`: pure logic tests.

## Task 1: Shared Site Utilities

**Files:**
- Create: `package.json`
- Create: `src/shared/site-utils.js`
- Test: `tests/site-utils.test.js`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeUrl,
  formatDuration,
  getLocalDateKey,
  getRecentDateKeys,
} from '../src/shared/site-utils.js';

test('canonicalizeUrl keeps protocol and hostname while dropping path and query', () => {
  assert.equal(
    canonicalizeUrl('https://www.youtube.com/watch?v=gFV2eAjHjiU'),
    'https://www.youtube.com',
  );
});

test('canonicalizeUrl preserves subdomains and ignores ports', () => {
  assert.equal(canonicalizeUrl('https://mail.google.com/mail/u/0'), 'https://mail.google.com');
  assert.equal(canonicalizeUrl('http://localhost:3000/path'), 'http://localhost');
});

test('canonicalizeUrl returns null for unsupported or invalid URLs', () => {
  assert.equal(canonicalizeUrl('chrome://extensions'), null);
  assert.equal(canonicalizeUrl('file:///Users/demo/index.html'), null);
  assert.equal(canonicalizeUrl('not a url'), null);
});

test('formatDuration formats seconds, minutes, and hours', () => {
  assert.equal(formatDuration(35), '35s');
  assert.equal(formatDuration(60), '1m');
  assert.equal(formatDuration(48 * 60), '48m');
  assert.equal(formatDuration(2 * 3600 + 14 * 60 + 20), '2h 14m');
});

test('getLocalDateKey formats local dates as YYYY-MM-DD', () => {
  assert.equal(getLocalDateKey(new Date(2026, 6, 4, 9, 5, 0)), '2026-07-04');
});

test('getRecentDateKeys includes today and previous days', () => {
  assert.deepEqual(getRecentDateKeys(new Date(2026, 6, 4), 3), [
    '2026-07-04',
    '2026-07-03',
    '2026-07-02',
  ]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/site-utils.test.js`
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement site utilities**

```js
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

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/site-utils.test.js`
Expected: PASS.

## Task 2: Usage Aggregation

**Files:**
- Create: `src/shared/usage-aggregation.js`
- Test: `tests/usage-aggregation.test.js`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsage } from '../src/shared/usage-aggregation.js';

const usageByDate = {
  '2026-07-04': {
    'https://www.youtube.com': {
      origin: 'https://www.youtube.com',
      seconds: 120,
      faviconUrl: 'youtube.ico',
      lastVisitedAt: 400,
    },
    'https://github.com': {
      origin: 'https://github.com',
      seconds: 60,
      faviconUrl: 'github.ico',
      lastVisitedAt: 300,
    },
  },
  '2026-07-03': {
    'https://www.youtube.com': {
      origin: 'https://www.youtube.com',
      seconds: 30,
      faviconUrl: 'youtube-new.ico',
      lastVisitedAt: 500,
    },
  },
  '2026-06-20': {
    'https://old.example': {
      origin: 'https://old.example',
      seconds: 999,
      faviconUrl: '',
      lastVisitedAt: 100,
    },
  },
};

test('aggregateUsage returns today rows and total seconds sorted by duration', () => {
  const result = aggregateUsage(usageByDate, 'today', new Date(2026, 6, 4));
  assert.equal(result.totalSeconds, 180);
  assert.deepEqual(result.rows.map((row) => row.origin), [
    'https://www.youtube.com',
    'https://github.com',
  ]);
});

test('aggregateUsage combines the current day and previous six days for week range', () => {
  const result = aggregateUsage(usageByDate, 'week', new Date(2026, 6, 4));
  assert.equal(result.totalSeconds, 210);
  assert.equal(result.rows[0].origin, 'https://www.youtube.com');
  assert.equal(result.rows[0].seconds, 150);
  assert.equal(result.rows[0].faviconUrl, 'youtube-new.ico');
});

test('aggregateUsage includes every stored date for total range', () => {
  const result = aggregateUsage(usageByDate, 'total', new Date(2026, 6, 4));
  assert.equal(result.totalSeconds, 1209);
  assert.equal(result.rows[0].origin, 'https://old.example');
});

test('aggregateUsage breaks ties by latest visit and then origin', () => {
  const result = aggregateUsage(
    {
      '2026-07-04': {
        'https://b.example': { origin: 'https://b.example', seconds: 60, lastVisitedAt: 2 },
        'https://a.example': { origin: 'https://a.example', seconds: 60, lastVisitedAt: 2 },
        'https://z.example': { origin: 'https://z.example', seconds: 60, lastVisitedAt: 3 },
      },
    },
    'today',
    new Date(2026, 6, 4),
  );
  assert.deepEqual(result.rows.map((row) => row.origin), [
    'https://z.example',
    'https://a.example',
    'https://b.example',
  ]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/usage-aggregation.test.js`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement aggregation**

```js
import { getLocalDateKey, getRecentDateKeys } from './site-utils.js';

export function aggregateUsage(usageByDate = {}, range = 'today', today = new Date()) {
  const dateKeys = getDateKeysForRange(usageByDate, range, today);
  const byOrigin = new Map();

  for (const dateKey of dateKeys) {
    const sites = usageByDate?.[dateKey] ?? {};
    for (const record of Object.values(sites)) {
      if (!record?.origin || !Number.isFinite(record.seconds)) {
        continue;
      }
      const existing = byOrigin.get(record.origin) ?? {
        origin: record.origin,
        seconds: 0,
        faviconUrl: '',
        lastVisitedAt: 0,
      };
      existing.seconds += Math.max(0, Math.floor(record.seconds));
      if (record.lastVisitedAt && record.lastVisitedAt >= existing.lastVisitedAt) {
        existing.lastVisitedAt = record.lastVisitedAt;
        if (record.faviconUrl) {
          existing.faviconUrl = record.faviconUrl;
        }
      } else if (!existing.faviconUrl && record.faviconUrl) {
        existing.faviconUrl = record.faviconUrl;
      }
      byOrigin.set(record.origin, existing);
    }
  }

  const rows = [...byOrigin.values()].sort((a, b) => {
    if (b.seconds !== a.seconds) return b.seconds - a.seconds;
    if (b.lastVisitedAt !== a.lastVisitedAt) return b.lastVisitedAt - a.lastVisitedAt;
    return a.origin.localeCompare(b.origin);
  });

  return {
    rows,
    totalSeconds: rows.reduce((sum, row) => sum + row.seconds, 0),
  };
}

function getDateKeysForRange(usageByDate, range, today) {
  if (range === 'week') {
    return getRecentDateKeys(today, 7);
  }
  if (range === 'total') {
    return Object.keys(usageByDate ?? {});
  }
  return [getLocalDateKey(today)];
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/usage-aggregation.test.js`
Expected: PASS.

## Task 3: Session Logic

**Files:**
- Create: `src/shared/session.js`
- Test: `tests/session.test.js`

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, calculateElapsedSeconds } from '../src/shared/session.js';

test('createSession stores origin favicon and start time', () => {
  assert.deepEqual(createSession('https://github.com', 'icon.png', 1000), {
    origin: 'https://github.com',
    faviconUrl: 'icon.png',
    startedAt: 1000,
  });
});

test('calculateElapsedSeconds floors milliseconds to whole seconds', () => {
  assert.equal(calculateElapsedSeconds({ startedAt: 1000 }, 3999), 2);
});

test('calculateElapsedSeconds ignores missing sessions and negative elapsed time', () => {
  assert.equal(calculateElapsedSeconds(null, 3999), 0);
  assert.equal(calculateElapsedSeconds({ startedAt: 5000 }, 3999), 0);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/session.test.js`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement session helpers**

```js
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/session.test.js`
Expected: PASS.

## Task 4: Chrome Extension Files

**Files:**
- Create: `manifest.json`
- Create: `assets/icon.svg`
- Create: `src/background/storage.js`
- Create: `src/background/service-worker.js`

- [ ] **Step 1: Write service worker integration using tested helpers**

Use `canonicalizeUrl`, `getLocalDateKey`, `createSession`, and `calculateElapsedSeconds`. Implement:

- Query focused window and active tab.
- Start a session only when tab URL is valid and idle state is active.
- Flush before switching sessions.
- Add seconds to `usageByDate[dateKey][origin]`.
- Preserve latest favicon and `lastVisitedAt`.

- [ ] **Step 2: Add manifest and icon**

Manifest declares:

- `manifest_version: 3`
- `permissions: ["tabs", "storage", "idle"]`
- `action.default_popup: "src/popup/popup.html"`
- `background.service_worker: "src/background/service-worker.js"`
- `background.type: "module"`

- [ ] **Step 3: Run syntax checks**

Run: `node --check src/background/storage.js`
Run: `node --check src/background/service-worker.js`
Expected: both pass.

## Task 5: Popup UI

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.js`

- [ ] **Step 1: Build B layout markup and styles**

Implement:

- Title `网站时长榜`
- Summary card
- Three segmented buttons: Today, Week, Total
- List container and empty state
- Row layout with icon, address, duration

- [ ] **Step 2: Render from storage**

Popup JS:

- Reads `usageByDate` from `chrome.storage.local`.
- Calls `aggregateUsage`.
- Calls `formatDuration`.
- Uses fallback icon when favicon is missing or image load fails.
- Switches range on segmented button click.

- [ ] **Step 3: Run syntax checks**

Run: `node --check src/popup/popup.js`
Expected: pass.

## Task 6: Full Verification

**Files:**
- Modify as needed based on test/syntax failures.

- [ ] **Step 1: Run all automated tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Check manifest JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"`
Expected: prints `manifest ok`.

- [ ] **Step 3: Manual loading instructions**

Document in final response:

- Open `chrome://extensions`.
- Enable Developer mode.
- Click Load unpacked.
- Select `/Users/mzy/Documents/网页使用统计`.
- Visit a few sites, keep one active, then open popup.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add package.json manifest.json assets src tests docs/superpowers/plans/2026-07-04-website-usage-tracker.md
git commit -m "feat: add website usage tracker extension"
```
