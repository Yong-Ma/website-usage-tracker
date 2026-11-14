import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackup,
  parseBackup,
  serializeBackup,
} from '../src/shared/backup.js';

const data = {
  usageByDate: {
    '2026-08-30': {
      'https://example.com': {
        origin: 'https://example.com',
        seconds: 120,
        faviconUrl: '',
        lastVisitedAt: 1,
      },
    },
  },
  trackingPaused: true,
  excludedOrigins: ['https://github.com'],
  popupLanguage: 'zh',
  weeklyReportSettings: { enabled: false, weekday: 7, time: '21:00' },
  weeklyReports: [],
};

test('createBackup returns a versioned package with all persistent data', () => {
  const backup = createBackup(data, '2026-08-30T12:00:00.000Z');

  assert.deepEqual(backup, {
    format: 'website-usage-tracker-backup',
    version: 2,
    exportedAt: '2026-08-30T12:00:00.000Z',
    data,
  });
});

test('serializeBackup and parseBackup round-trip valid data', () => {
  const parsed = parseBackup(serializeBackup(data, '2026-08-30T12:00:00.000Z'));

  assert.deepEqual(parsed, data);
});

test('parseBackup rejects malformed JSON and unsupported packages', () => {
  assert.throws(() => parseBackup('{'), /JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ ...createBackup(data), format: 'other' })), /格式/);
  assert.throws(() => parseBackup(JSON.stringify({ ...createBackup(data), version: 3 })), /版本/);
});

test('version 1 backups gain default reports and version 2 requires valid weekly fields', () => {
  const { weeklyReports, weeklyReportSettings, ...legacy } = data;
  assert.deepEqual(parseBackup(JSON.stringify({ ...createBackup(data), version: 1, data: legacy })), data);
  assert.throws(() => parseBackup(JSON.stringify({ ...createBackup(data), data: legacy })), /周报/);
  assert.throws(() => createBackup({ ...data, weeklyReportSettings: { enabled: true, weekday: 8, time: '21:00' } }), /周报/);
  assert.throws(() => createBackup({ ...data, weeklyReports: [{ id: 'bad' }] }), /周报/);
});

test('version 2 round trips immutable weekly facts and rejects corrupt snapshots', async () => {
  const { buildWeeklyReport } = await import('../src/shared/weekly-report-aggregation.js');
  const report = buildWeeklyReport({ '2026-11-08': { a: { origin: 'https://a.com', seconds: 120 } } }, new Date(2026, 10, 15));
  const full = { ...data, weeklyReports: [report] };
  assert.deepEqual(parseBackup(serializeBackup(full)), full);
  for (const changes of [{ totalSeconds: -1 }, { rangeStart: '2026-02-30' }, { rangeEnd: '2026-11-15' }, { topSites: [{ origin: 'javascript:alert(1)', seconds: 1, faviconUrl: '' }] }, { previousTotalSeconds: NaN }, { leastUsedDay: { dateKey: '2026-01-01', seconds: 0 } }]) {
    assert.throws(() => createBackup({ ...data, weeklyReports: [{ ...report, ...changes }] }), /周报/);
  }
  assert.throws(() => createBackup({ ...data, weeklyReports: [report, report] }), /周报/);
});

test('parseBackup rejects invalid data fields', () => {
  assert.throws(() => parseBackup(JSON.stringify({
    ...createBackup(data),
    data: { ...data, usageByDate: [] },
  })), /usageByDate/);
  assert.throws(() => parseBackup(JSON.stringify({
    ...createBackup(data),
    data: { ...data, popupLanguage: 'fr' },
  })), /语言/);
  assert.throws(() => parseBackup(JSON.stringify({
    ...createBackup(data),
    data: { ...data, excludedOrigins: [1] },
  })), /网站/);
});
