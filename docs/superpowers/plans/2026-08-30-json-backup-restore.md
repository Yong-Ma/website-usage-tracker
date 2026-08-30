# JSON Backup and Restore Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with test-first development and verify each checkpoint before moving on.

**Goal:** Add reliable JSON export/import controls that preserve all persistent extension data across uninstall and reinstall.

**Architecture:** Keep normal data in `chrome.storage.local`. Add a pure shared backup module for the versioned file format and validation, storage helpers for reading/writing the four persistent fields, a queued service-worker import message that safely resets the active session, and popup controls that download/select JSON files.

**Tech Stack:** Manifest V3 extension, native ES modules, Chrome Storage/Runtime APIs, browser `Blob`/`FileReader`, Node.js built-in test runner.

---

### Task 1: Define and validate the backup format

**Files:**
- Create: `src/shared/backup.js`
- Create: `tests/backup.test.js`

- [ ] **Step 1: Write failing tests** for creating a versioned backup and parsing valid/invalid JSON. Cover all four fields, malformed JSON, wrong `format`, unsupported `version`, invalid `usageByDate`, invalid language, and invalid excluded-origin entries.
- [ ] **Step 2: Run `node --test tests/backup.test.js`** and confirm the new tests fail because the module does not exist.
- [ ] **Step 3: Implement pure functions** `createBackup(data, exportedAt)`, `serializeBackup(data, exportedAt)`, and `parseBackup(text)`. Emit `{format:'website-usage-tracker-backup', version:1, exportedAt, data}` and return normalized data only after strict validation; throw user-neutral `Error` values for malformed input.
- [ ] **Step 4: Run the focused test and then `npm test`**; confirm all tests pass.
- [ ] **Step 5: Commit** with `git commit -m "feat: add versioned backup format"`.

### Task 2: Add complete persistent-storage helpers

**Files:**
- Modify: `src/background/storage.js`
- Modify: `tests/storage.test.js`

- [ ] **Step 1: Write failing tests** for `readAllData(storage)` returning normalized `usageByDate`, boolean `trackingPaused`, string-only `excludedOrigins`, and supported `popupLanguage`; and for `writeAllData(data, storage)` replacing all four keys in one storage write.
- [ ] **Step 2: Run the focused storage tests** and verify they fail because the helpers are not exported.
- [ ] **Step 3: Implement and export** `readAllData` and `writeAllData`, reusing the existing storage key constants and plain-object checks. Default the language to `en` when absent or invalid, pause to `false`, and excluded origins to an empty list. Keep the existing single-purpose helpers unchanged.
- [ ] **Step 4: Run `node --test tests/storage.test.js` and `npm test`**; confirm green.
- [ ] **Step 5: Commit** with `git commit -m "feat: add complete storage backup helpers"`.

### Task 3: Handle queued background imports safely

**Files:**
- Modify: `src/background/service-worker.js`
- Modify: `tests/service-worker.test.js`

- [ ] **Step 1: Write a failing service-worker test** that sends `{type:'importBackup', data}` and asserts the response is successful, the four local fields equal the imported values, the old session is removed, and a fresh session is created for the active tab when tracking is not paused. Add a paused-data assertion that no active session remains.
- [ ] **Step 2: Run `node --test tests/service-worker.test.js`** and confirm the message is currently unhandled.
- [ ] **Step 3: Implement `importBackupData` and `queueImportBackup`**. Include `importBackup` in the message allow-list, validate the payload with the shared backup validator, wait on `refreshQueue`, flush/clear the active session, write all four fields, reset in-memory state, and call `refreshActiveSession`. Return localized-safe error text through the existing response pattern.
- [ ] **Step 4: Run the focused service-worker test and `npm test`**; confirm no regressions in session handling.
- [ ] **Step 5: Commit** with `git commit -m "feat: restore backups through service worker"`.

### Task 4: Add popup export/import interactions

**Files:**
- Modify: `src/popup/popup.html`
- Modify: `src/popup/popup.css`
- Modify: `src/popup/popup.js`
- Modify: `_locales/zh_CN/messages.json`
- Modify: `_locales/en/messages.json`

- [ ] **Step 1: Add the settings controls**: an export button, a hidden JSON file input accepting `.json`/`application/json`, and an import button/label in the existing settings panel; add matching styles without changing unrelated layout.
- [ ] **Step 2: Add localized strings** for export/import labels, import confirmation, success, invalid-file, read, and write errors in both locale files.
- [ ] **Step 3: Implement export** in `popup.js`: call `readAllData`, `serializeBackup`, create a `Blob`, click a temporary download anchor named `website-usage-tracker-backup-YYYY-MM-DD.json`, and always revoke the object URL.
- [ ] **Step 4: Implement import**: read the selected file as text, call `parseBackup`, confirm replacement, send `{type:'importBackup', data}` to the service worker, reload usage/settings, close settings, rerender, and show localized status. Clear the input value after each attempt so the same file can be selected again; disable controls while pending.
- [ ] **Step 5: Run `npm test`** and manually inspect the popup DOM for keyboard/focus behavior and accessible labels.
- [ ] **Step 6: Commit** with `git commit -m "feat: add JSON backup controls to popup"`.

### Task 5: Final verification and documentation

**Files:**
- Modify: `README.zh-CN.md`
- Modify: `README.md`

- [ ] **Step 1: Document** that users should export before uninstalling and import after reinstalling, and list the four restored data categories.
- [ ] **Step 2: Run the complete test suite** with `npm test` and verify a clean pass.
- [ ] **Step 3: Review `git diff --check`** and inspect the final changed-file list for scope creep.
- [ ] **Step 4: Commit** with `git commit -m "docs: describe backup and restore workflow"`.
