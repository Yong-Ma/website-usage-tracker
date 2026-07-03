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
