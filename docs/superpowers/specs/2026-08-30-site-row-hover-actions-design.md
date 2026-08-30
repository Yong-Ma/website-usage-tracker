# Site Row Hover Actions Design

## Goal

Let an unhovered site row use the horizontal space currently reserved for the delete and exclude controls, so more of a long origin is visible.

## Layout

Each site row remains a three-column grid: favicon, flexible site metadata, and duration. The delete and exclude controls are placed in a separate actions wrapper that is absolutely positioned at the row's right edge, rather than occupying grid columns.

The wrapper is visually hidden by default. On row hover or when a child has keyboard focus, it becomes visible with an opaque background matching the row. The background prevents the controls from visually colliding with content below them.

## Behavior and accessibility

The existing delete and exclude labels, confirmation dialogs, storage messages, and click handlers remain unchanged. `:focus-within` exposes the controls for keyboard users. Disabled controls remain visible while an action is in progress.

## Verification

Add a popup rendering test that asserts both controls are wrapped in the dedicated actions container. Keep the CSS regression test focused on the default hidden and hover/focus-visible states. Run the popup test file and the full test suite.
