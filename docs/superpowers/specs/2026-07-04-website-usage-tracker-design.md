# Website Usage Tracker Chrome Extension Design

## Overview

Build a Google Chrome extension that records how long the user actively spends on each website and shows a duration-sorted leaderboard in the extension popup.

The extension tracks websites at the origin-host level, not individual pages. For example, `https://www.youtube.com/watch?v=gFV2eAjHjiU` is recorded as `https://www.youtube.com`. Subdomains are preserved, so `https://mail.google.com` and `https://www.google.com` are separate sites.

## Goals

- Track only the currently active Chrome tab while the Chrome window is focused and the user is not idle.
- Store all data locally in Chrome extension storage.
- Show a popup leaderboard with website icon, website address, and usage duration.
- Support three time ranges: Today, 7 Days, and Total.
- Sort leaderboard rows by usage duration in descending order.
- Use layout B from the design discussion: a total-duration summary above the range switcher and leaderboard.

## Non-Goals

- Do not record individual page paths, query strings, or hashes.
- Do not upload data to a server.
- Do not build a full statistics page in the first version.
- Do not include a clear-data button in the first version.
- Do not merge subdomains into a registrable domain.

## Technical Approach

Use a native Chrome Manifest V3 extension with no build step. The repository will contain static JavaScript, HTML, CSS, and image assets that Chrome can load directly in developer mode.

The extension has three main parts:

- `manifest.json` declares permissions, popup entry point, service worker, and extension metadata.
- A background service worker tracks active tab state and writes elapsed seconds to `chrome.storage.local`.
- A popup reads stored data, aggregates it by selected time range, and renders the leaderboard.

This approach keeps the extension easy to install, inspect, and test without introducing a bundler.

## Permissions

The extension needs these Chrome permissions:

- `tabs`: read the active tab URL and favicon URL.
- `storage`: persist usage data locally.
- `idle`: stop counting when Chrome reports the user as idle or locked.

No host permissions are required because the extension only reads tab metadata exposed through the `tabs` permission and does not inject scripts into websites.

## Site Identity Rules

The canonical site key is:

```text
url.protocol + "//" + url.hostname
```

Examples:

- `https://www.youtube.com/watch?v=gFV2eAjHjiU` becomes `https://www.youtube.com`.
- `https://github.com/openai/codex` becomes `https://github.com`.
- `http://localhost:3000/path` becomes `http://localhost`.

Ignored URLs:

- `chrome://...`
- `chrome-extension://...`
- `edge://...`
- `about:...`
- `file://...`
- URLs that cannot be parsed by `new URL(...)`

## Data Model

Data is stored under one key in `chrome.storage.local`:

```json
{
  "usageByDate": {
    "2026-07-04": {
      "https://www.youtube.com": {
        "origin": "https://www.youtube.com",
        "seconds": 8040,
        "faviconUrl": "https://www.youtube.com/favicon.ico",
        "lastVisitedAt": 1783095000000
      }
    }
  }
}
```

Dates use the user's local date in `YYYY-MM-DD` format. Durations are stored as integer seconds.

If a site has no favicon URL, the popup uses an internal fallback icon. If a later visit includes a favicon URL, the stored favicon URL is updated.

## Tracking Rules

The service worker keeps an in-memory active session with:

- `origin`
- `faviconUrl`
- `startedAt`

Before changing or clearing the active session, it flushes elapsed seconds to storage. Elapsed time is rounded down to whole seconds. Flushes with less than one second are ignored.

Counting starts or resumes when all conditions are true:

- Chrome has a focused window.
- The focused window has an active tab.
- The active tab URL maps to a valid website origin.
- `chrome.idle` reports the user as active.

Counting pauses when any condition becomes false:

- User switches tabs.
- Active tab URL changes to a different origin or an ignored URL.
- Chrome window loses focus.
- User becomes idle or locked.
- Service worker receives a lifecycle event that requires flushing current state.

The service worker listens to:

- `chrome.tabs.onActivated`
- `chrome.tabs.onUpdated`
- `chrome.windows.onFocusChanged`
- `chrome.idle.onStateChanged`
- `chrome.runtime.onStartup`
- `chrome.runtime.onInstalled`

On startup and install, the service worker recomputes the current active tab state instead of assuming a previous in-memory session is still valid.

## Popup UI

The popup uses layout B:

1. Header: `网站时长榜`
2. Summary panel: total duration for the currently selected range.
3. Segmented control: `今日`, `7 天`, `总计`.
4. Leaderboard rows sorted by duration descending.

Each leaderboard row shows:

- Website favicon or fallback icon.
- Canonical website address, such as `https://www.youtube.com`.
- Formatted duration, such as `2h 14m`, `48m`, or `35s`.

If there is no usage data for the selected range, the popup shows an empty state message instead of an empty list.

The popup defaults to `今日` every time it opens. The first version does not need to remember the last selected range.

## Aggregation Rules

Today:

- Uses only the current local date.

7 Days:

- Includes the current local date and the previous 6 local dates.

Total:

- Includes every date stored in `usageByDate`.

For each range, records with the same origin across included dates are summed. The latest non-empty favicon URL and most recent `lastVisitedAt` value are kept for display metadata.

Sort order:

1. Higher total seconds first.
2. If durations tie, more recent `lastVisitedAt` first.
3. If still tied, alphabetical by origin.

## Error Handling

Invalid or unsupported tab URLs are ignored and do not appear in storage.

If `chrome.storage.local` returns missing or malformed data, the extension treats it as an empty dataset and overwrites it with valid data on the next successful flush.

If favicon loading fails in the popup, the image falls back to an internal icon without changing the recorded usage duration.

## Testing Strategy

Use small pure JavaScript modules for behavior that can be tested without Chrome APIs:

- URL-to-origin canonicalization.
- Local date key generation.
- Duration formatting.
- Range aggregation and sorting.
- Session elapsed-time calculation.

Tests will run with Node's built-in test runner. Chrome API integration will stay thin and call the tested pure functions.

Manual verification in Chrome developer mode will cover:

- Loading the unpacked extension.
- Opening several websites and switching active tabs.
- Confirming only the active focused tab accumulates time.
- Opening the popup and confirming Today, 7 Days, and Total sort correctly.
- Confirming every row shows an icon, address, and formatted duration.

## Success Criteria

- The extension can be loaded unpacked in Google Chrome.
- Visiting `https://www.youtube.com/watch?v=gFV2eAjHjiU` records time under `https://www.youtube.com`.
- Background tabs do not accumulate time while they are not active.
- Losing Chrome window focus pauses counting.
- Idle or locked user state pauses counting.
- Popup layout B displays a summary, range selector, and sorted leaderboard.
- Every leaderboard row includes an icon, website address, and usage duration.
- Automated tests pass for the pure logic modules.
