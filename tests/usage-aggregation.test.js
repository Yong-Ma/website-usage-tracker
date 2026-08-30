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

test('aggregateUsage returns only the top ten rows while keeping the full total', () => {
  const sites = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => {
      const rank = index + 1;
      const origin = `https://site-${rank}.example`;
      return [
        origin,
        {
          origin,
          seconds: rank,
          lastVisitedAt: rank,
        },
      ];
    }),
  );

  const result = aggregateUsage({ '2026-07-04': sites }, 'today', new Date(2026, 6, 4));

  assert.equal(result.rows.length, 10);
  assert.deepEqual(result.rows.map((row) => row.origin), [
    'https://site-12.example',
    'https://site-11.example',
    'https://site-10.example',
    'https://site-9.example',
    'https://site-8.example',
    'https://site-7.example',
    'https://site-6.example',
    'https://site-5.example',
    'https://site-4.example',
    'https://site-3.example',
  ]);
  assert.equal(result.totalSeconds, 78);
});

test('aggregateUsage hides excluded origins from rows and totals', () => {
  const result = aggregateUsage(
    usageByDate,
    'total',
    new Date(2026, 6, 4),
    ['https://www.youtube.com', 'https://old.example'],
  );

  assert.deepEqual(result.rows.map((row) => row.origin), ['https://github.com']);
  assert.equal(result.totalSeconds, 60);
});
