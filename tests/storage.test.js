import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearUsageForDate,
  clearUsageForRange,
  deleteUsageForOrigin,
  isTrackingPaused,
  readExcludedOrigins,
  setTrackingPaused,
  setOriginExcluded,
} from '../src/background/storage.js';

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

test('deleteUsageForOrigin removes only the matching origin for today', async () => {
  const storage = createMemoryStorage({
    usageByDate: {
      '2026-07-05': {
        'https://target.example': { seconds: 60 },
        'https://other.example': { seconds: 120 },
      },
      '2026-07-04': {
        'https://target.example': { seconds: 180 },
      },
    },
  });

  await deleteUsageForOrigin('https://target.example', 'today', new Date(2026, 6, 5), storage);

  assert.deepEqual(storage.data.usageByDate, {
    '2026-07-05': {
      'https://other.example': { seconds: 120 },
    },
    '2026-07-04': {
      'https://target.example': { seconds: 180 },
    },
  });
});

test('deleteUsageForOrigin removes the matching origin only from the recent seven days', async () => {
  const storage = createMemoryStorage({
    usageByDate: {
      '2026-07-05': {
        'https://target.example': { seconds: 60 },
        'https://other.example': { seconds: 120 },
      },
      '2026-07-04': {
        'https://target.example': { seconds: 70 },
      },
      '2026-06-29': {
        'https://target.example': { seconds: 80 },
      },
      '2026-06-28': {
        'https://target.example': { seconds: 90 },
      },
    },
  });

  await deleteUsageForOrigin('https://target.example', 'week', new Date(2026, 6, 5), storage);

  assert.deepEqual(storage.data.usageByDate, {
    '2026-07-05': {
      'https://other.example': { seconds: 120 },
    },
    '2026-07-04': {},
    '2026-06-29': {},
    '2026-06-28': {
      'https://target.example': { seconds: 90 },
    },
  });
});

test('deleteUsageForOrigin removes the matching origin from every date for total', async () => {
  const storage = createMemoryStorage({
    usageByDate: {
      '2026-07-05': {
        'https://target.example': { seconds: 60 },
        'https://other.example': { seconds: 120 },
      },
      '2026-06-28': {
        'https://target.example': { seconds: 90 },
      },
    },
  });

  await deleteUsageForOrigin('https://target.example', 'total', new Date(2026, 6, 5), storage);

  assert.deepEqual(storage.data.usageByDate, {
    '2026-07-05': {
      'https://other.example': { seconds: 120 },
    },
    '2026-06-28': {},
  });
});

test('tracking pause setting defaults to off and persists boolean values', async () => {
  const storage = createMemoryStorage();

  assert.equal(await isTrackingPaused(storage), false);

  await setTrackingPaused(true, storage);
  assert.equal(await isTrackingPaused(storage), true);

  await setTrackingPaused(false, storage);
  assert.equal(await isTrackingPaused(storage), false);
});

test('excluded origins default to an empty list and persist one canonical origin', async () => {
  const storage = createMemoryStorage();

  assert.deepEqual(await readExcludedOrigins(storage), []);

  await setOriginExcluded('https://github.com', true, storage);

  assert.deepEqual(await readExcludedOrigins(storage), ['https://github.com']);
});

test('adding an excluded origin ignores duplicates and removing it restores the list', async () => {
  const storage = createMemoryStorage({
    excludedOrigins: ['https://github.com', 'https://example.com'],
  });

  await setOriginExcluded('https://github.com', true, storage);
  assert.deepEqual(storage.data.excludedOrigins, [
    'https://github.com',
    'https://example.com',
  ]);

  await setOriginExcluded('https://github.com', false, storage);
  assert.deepEqual(await readExcludedOrigins(storage), ['https://example.com']);
});
