# Clear Usage Range Design

## Goal

Make the popup clear button clear the currently selected range: today's data, the recent 7-day data, or all tracked data. The confirmation and success messages must match the selected range.

## Recommended Approach

The popup keeps one clear button in the header and derives its behavior from the active range tab. The popup sends `{ type: 'clearUsage', range }` to the background service worker. The service worker owns the reset workflow: it discards the currently active session without flushing elapsed time, removes the requested `usageByDate` buckets, then refreshes the active session so timing restarts from the reset moment.

## Components

- `src/background/storage.js` exposes helpers to remove one local date key or a whole range from `usageByDate`.
- `src/background/service-worker.js` handles a `clearUsage` runtime message and coordinates session reset plus refresh. The existing `clearTodayUsage` message remains as a compatibility alias for `today`.
- `src/popup/popup.html`, `src/popup/popup.css`, and `src/popup/popup.js` keep the clear button, send the selected range, reload storage, and re-render the current range.

## Data Flow

1. User selects `今日`, `7 天`, or `总计`.
2. User clicks `清空`.
3. Popup uses range-specific confirmation text:
   - `今日`: `确定要清空今日统计吗？`
   - `7 天`: `确定要清空最近 7 天统计吗？`
   - `总计`: `确定要清空全部统计吗？`
4. Popup disables the button and sends `{ type: 'clearUsage', range }`.
5. Background clears the active session without adding elapsed seconds.
6. Background deletes the requested usage buckets from local storage:
   - `today`: today's local date key.
   - `week`: today and the previous 6 local date keys.
   - `total`: every stored date key.
7. Background refreshes the active tab session with a new `startedAt`.
8. Popup reloads `usageByDate`, keeps the same range selected, re-renders, and shows the matching success message.

## Errors

If the background message fails, the popup keeps the existing data visible and shows a concise status message. The clear button is re-enabled so the user can retry.

## Testing

Add storage unit tests that prove clearing one date removes only that day, clearing the recent 7-day range preserves older data, and clearing total usage removes all stored date buckets. Existing tests should continue to pass through `npm test`.
