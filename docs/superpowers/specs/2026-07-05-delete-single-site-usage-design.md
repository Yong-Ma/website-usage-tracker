# Delete Single Site Usage Design

## Goal

Add a popup action that deletes one website row from the currently selected range. The user sees the delete action only when focusing or hovering a row, and deletion requires a confirmation dialog.

## Behavior

- Each website row includes a delete button.
- The delete button is visually hidden until the row is hovered or the button receives keyboard focus.
- Clicking the button opens a confirmation dialog naming the website.
- Confirming deletes that origin from the active range:
  - `today`: remove the origin from today's date bucket.
  - `week`: remove the origin from the recent seven local date buckets.
  - `total`: remove the origin from every stored date bucket.
- Cancelling leaves all usage data unchanged.
- After a successful delete, the popup reloads usage data and re-renders the list and summary.
- Failed deletes show a short status message and keep the current data visible.

## Architecture

The popup sends a new runtime message, `deleteUsageForOrigin`, with `origin` and `range`. The background service worker handles the message through the same queue used by clear actions so current active usage is flushed before storage changes are applied.

Storage exposes a helper that removes one origin from the date buckets selected by the active range. Empty date buckets may remain because existing aggregation logic already tolerates empty objects, and retaining that behavior keeps the change small.

## UI

The row remains compact: favicon, rank/origin metadata, duration, and a small delete button at the right edge. The duration stays visible until hover/focus, then the delete button appears. The button has an accessible label that includes the origin.

## Testing

Add focused storage tests for deleting one origin:

- deleting from `today` affects only today's matching origin.
- deleting from `week` affects only recent seven date buckets.
- deleting from `total` removes that origin from every date bucket.
- other origins remain intact.
