# Delete Single Site Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users delete one website's usage entry from the currently selected popup range after confirmation.

**Architecture:** Add a storage helper that removes one origin from the date buckets selected by a range. Route popup delete actions through the background service worker message queue so active usage is flushed before storage mutation. Render a row-level delete button that appears on hover/focus and refreshes the popup after deletion.

**Tech Stack:** Chrome extension Manifest V3, plain JavaScript modules, CSS, `node:test`.

---

## File Structure

- Modify `src/background/storage.js`: export `deleteUsageForOrigin(origin, range, date, storage)`.
- Modify `src/background/service-worker.js`: handle the `deleteUsageForOrigin` runtime message and queue the mutation.
- Modify `src/popup/popup.js`: render a delete button per row, confirm, send message, reload state.
- Modify `src/popup/popup.css`: hide the delete button until row hover/focus and keep row layout stable.
- Modify `tests/storage.test.js`: add focused tests for origin deletion by range.

### Task 1: Storage Helper

**Files:**
- Modify: `tests/storage.test.js`
- Modify: `src/background/storage.js`

- [ ] **Step 1: Write failing storage tests**

Add tests that call `deleteUsageForOrigin` with `today`, `week`, and `total`, then assert only the matching origin in the selected date buckets is removed.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`

Expected: FAIL because `deleteUsageForOrigin` is not exported.

- [ ] **Step 3: Implement minimal storage helper**

Export `deleteUsageForOrigin(origin, range, date = new Date(), storage = chrome.storage.local)`. Use the same range-to-date-bucket rules as `clearUsageForRange`, delete `usageByDate[dateKey][origin]` where the bucket exists, and persist the updated object.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

Expected: PASS.

### Task 2: Background Message

**Files:**
- Modify: `src/background/service-worker.js`

- [ ] **Step 1: Extend message routing**

Accept `message.type === 'deleteUsageForOrigin'` in `chrome.runtime.onMessage`.

- [ ] **Step 2: Add queued deletion**

Add `queueDeleteUsageForOrigin(origin, range)` and `deleteUsageForOriginFromRange(origin, range, now)` beside the clear helpers. Validate that `origin` is present and `range` is one of `today`, `week`, or `total`.

- [ ] **Step 3: Keep session consistency**

Inside the deletion flow, set `activeSession = null`, clear the stored session, call the storage helper, then refresh the active session, mirroring the clear flow.

### Task 3: Popup UI

**Files:**
- Modify: `src/popup/popup.js`
- Modify: `src/popup/popup.css`

- [ ] **Step 1: Render delete controls**

Add a row delete button with text `删除`, title and `aria-label` including `row.origin`, and a click handler that stops propagation.

- [ ] **Step 2: Confirm and send delete message**

On click, call `window.confirm("确定要删除 " + row.origin + " 在当前范围内的记录吗？")`. If confirmed, send `{ type: 'deleteUsageForOrigin', origin: row.origin, range: state.range }`, reload usage data, render, and show a status message.

- [ ] **Step 3: Style hover/focus reveal**

Update `.site-row` layout to include the button area. Hide `.site-delete-button` by default with `opacity: 0` and reveal it on `.site-row:hover` and `.site-row:focus-within`.

### Task 4: Verification

**Files:**
- Verify changed files only.

- [ ] **Step 1: Run automated tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Review diff**

Run: `git diff -- src/background/storage.js src/background/service-worker.js src/popup/popup.js src/popup/popup.css tests/storage.test.js docs/superpowers/specs/2026-07-05-delete-single-site-usage-design.md docs/superpowers/plans/2026-07-05-delete-single-site-usage.md`

Expected: Diff contains only single-site delete behavior and its docs.
