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
};

test('createBackup returns a versioned package with all persistent data', () => {
  const backup = createBackup(data, '2026-08-30T12:00:00.000Z');

  assert.deepEqual(backup, {
    format: 'website-usage-tracker-backup',
    version: 1,
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
  assert.throws(() => parseBackup(JSON.stringify({ ...createBackup(data), version: 2 })), /版本/);
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
