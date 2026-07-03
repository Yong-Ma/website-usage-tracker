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
