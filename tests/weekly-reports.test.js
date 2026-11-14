import test from 'node:test';
import assert from 'node:assert/strict';

test('schedule uses local Sunday 21:00 by default and advances after the exact deadline', async () => {
  const { DEFAULT_WEEKLY_REPORT_SETTINGS: defaults, nextWeeklyReportTime, reportDateKeys, normalizeWeeklyReportSettings } = await import('../src/shared/weekly-report-schedule.js');
  assert.deepEqual(defaults, { enabled: false, weekday: 7, time: '21:00' });
  const sunday = new Date(2026, 10, 15, 21);
  assert.equal(nextWeeklyReportTime(defaults, new Date(2026, 10, 14)), sunday.getTime());
  assert.equal(nextWeeklyReportTime(defaults, sunday), new Date(2026, 10, 22, 21).getTime());
  for (let weekday = 1; weekday <= 7; weekday++) {
    const next = new Date(nextWeeklyReportTime({ enabled: true, weekday, time: '08:30' }, sunday));
    assert.equal(next.getDay() || 7, weekday);
    assert.equal(next.getHours(), 8);
    assert.equal(next.getMinutes(), 30);
    assert.ok(next > sunday);
  }
  assert.deepEqual(reportDateKeys(new Date(2027, 0, 3, 21)), ['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  for (const invalid of [{ enabled: 'yes', weekday: 7, time: '21:00' }, { enabled: true, weekday: 0, time: '21:00' }, { enabled: true, weekday: 1, time: '24:00' }]) {
    assert.throws(() => normalizeWeeklyReportSettings(invalid));
  }
});

test('weekly snapshot excludes the scheduled day, compares two full weeks and breaks ties consistently', async () => {
  const { buildWeeklyReport } = await import('../src/shared/weekly-report-aggregation.js');
  const record = (origin, seconds) => ({ origin, seconds, faviconUrl: '' });
  const usage = {
    '2026-11-01': { a: record('https://a.com', 500), b: record('https://b.com', 100) },
    '2026-11-08': { a: record('https://a.com', 100), b: record('https://b.com', 500), c: record('https://c.com', 100), d: record('https://d.com', 100), x: record('https://excluded.com', 999) },
    '2026-11-15': { a: record('https://a.com', 9999) },
  };
  const report = buildWeeklyReport(usage, new Date(2026, 10, 15, 21).getTime(), ['https://excluded.com'], 123);
  assert.equal(report.id, '2026-11-08_2026-11-14');
  assert.equal(report.createdAt, 123);
  assert.equal(report.totalSeconds, 800);
  assert.equal(report.previousTotalSeconds, 600);
  assert.deepEqual(report.topSites.map(s => s.origin), ['https://b.com', 'https://a.com', 'https://c.com']);
  assert.deepEqual(report.largestChange, { origin: 'https://b.com', secondsDelta: 400 });
  assert.deepEqual(report.leastUsedDay, { dateKey: '2026-11-09', seconds: 0 });
  usage['2026-11-08'].b.seconds = 0;
  assert.equal(report.topSites[0].seconds, 500);
  const first = buildWeeklyReport({ '2026-11-08': usage['2026-11-08'] }, new Date(2026, 10, 15, 21), ['https://excluded.com']);
  assert.equal(first.previousTotalSeconds, null);
  assert.equal(first.largestChange, null);
  assert.equal(buildWeeklyReport({}, new Date(2026, 10, 15)), null);
});

test('narrative distinguishes missing comparison, equal usage, increases and decreases in both languages', async () => {
  const { reportHeadline } = await import('../src/shared/weekly-report-copy.js');
  assert.match(reportHeadline({ totalSeconds: 3600, previousTotalSeconds: null }, 'zh'), /首份/);
  assert.match(reportHeadline({ totalSeconds: 3600, previousTotalSeconds: null }, 'en'), /first/i);
  assert.match(reportHeadline({ totalSeconds: 3600, previousTotalSeconds: 7200 }, 'zh'), /少/);
  assert.match(reportHeadline({ totalSeconds: 7200, previousTotalSeconds: 3600 }, 'en'), /more/);
  assert.match(reportHeadline({ totalSeconds: 60, previousTotalSeconds: 60 }, 'zh'), /持平/);
});
