import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReport } from '../src/shared/weekly-report-aggregation.js';

class Element {
  constructor(tag = '') { this.tagName = tag; this.children = []; this.listeners = {}; this.value = ''; this.textContent = ''; this.attributes = {}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
  async dispatch(type) { await this.listeners[type]?.({ preventDefault() {} }); }
}
const textOf = node => [node.textContent, ...node.children.map(textOf)].join(' ');

async function loadPage({ language = 'zh', reports = [], search = '', permission = 'granted', error = false } = {}) {
  const elements = new Map();
  globalThis.document = {
    documentElement: new Element(),
    querySelector: selector => { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); },
    createElement: tag => new Element(tag),
  };
  Object.defineProperty(globalThis, 'navigator', { value: { language, languages: [language] }, configurable: true });
  globalThis.location = { search };
  const sent = [];
  let settings = { enabled: false, weekday: 7, time: '21:00' };
  globalThis.chrome = {
    runtime: { async sendMessage(message) {
      sent.push(message);
      if (error) return { ok: false };
      if (message.settings) settings = message.settings;
      return { ok: true, settings, reports, notificationPermission: permission, status: { nextScheduledTime: settings.enabled ? new Date(2026, 10, 15, 21).getTime() : null } };
    } },
    storage: {
      local: { async get() { return { popupLanguage: language }; }, async set() {} },
      onChanged: { addListener() {} },
    },
  };
  await import(`../src/reports/reports.js?test=${Math.random()}`);
  await new Promise(resolve => setTimeout(resolve, 0));
  return { el: id => elements.get(`#${id}`), sent };
}

test('empty history explains the report and lets users save Sunday 21:00 reminders', async () => {
  const { el, sent } = await loadPage();
  assert.equal(el('reminder-time').value, '21:00');
  assert.equal(el('reminder-weekday').value, '7');
  assert.equal(el('reminder-enabled').checked, false);
  assert.equal(el('empty-state').hidden, false);
  assert.match(el('next-reminder').textContent, /关闭/);
  el('reminder-enabled').checked = true;
  await el('reminder-form').dispatch('submit');
  assert.deepEqual(sent.at(-1), { type: 'setWeeklyReportSettings', settings: { enabled: true, weekday: 7, time: '21:00' } });
  assert.match(el('form-status').textContent, /保存/);
  assert.match(el('next-reminder').textContent, /2026/);
});

test('history sorts newest first and a notification link expands and locates the selected report', async () => {
  const record = { origin: 'https://example.com', seconds: 600 };
  const older = buildWeeklyReport({ '2026-11-01': { a: record } }, new Date(2026, 10, 8), [], 1);
  const newer = buildWeeklyReport({ '2026-11-08': { a: record } }, new Date(2026, 10, 15), [], 2);
  const { el } = await loadPage({ reports: [older, newer], search: `?report=${older.id}`, permission: 'denied' });
  const cards = el('report-list').children;
  assert.equal(cards.length, 2);
  assert.match(textOf(cards[0]), /2026-11-08/);
  assert.match(textOf(cards[1]), /2026-11-01/);
  assert.equal(cards[1].open, true);
  assert.equal(cards[1].scrolled, true);
  assert.match(textOf(cards[1]), /example.com/);
  assert.match(textOf(cards[1]), /首份/);
  assert.equal(el('notification-warning').hidden, false);
});

test('English page shows a recoverable loading error', async () => {
  const { el } = await loadPage({ language: 'en', error: true });
  assert.match(el('page-status').textContent, /load/i);
  assert.equal(el('retry-load').hidden, false);
});

test('invalid reminder values show an error without sending a save request', async () => {
  const { el, sent } = await loadPage();
  el('reminder-time').value = '25:00';
  await el('reminder-form').dispatch('submit');
  assert.equal(sent.filter(message => message.type === 'setWeeklyReportSettings').length, 0);
  assert.match(el('form-status').textContent, /时间|有效/);
});

test('language changes preserve expanded reports and show the correct ISO week across New Year', async () => {
  const report = buildWeeklyReport({ '2027-01-03': { a: { origin: 'https://a.com', seconds: 60 } } }, new Date(2027, 0, 10), [], 1);
  const { el } = await loadPage({ reports: [report], search: `?report=${report.id}` });
  assert.match(textOf(el('report-list')), /第 1 周/);
  assert.equal(el('report-list').children[0].open, true);
  el('report-language').value = 'en';
  await el('report-language').dispatch('change');
  assert.equal(el('report-list').children[0].open, true);
  assert.match(textOf(el('report-list')), /Week 1/);
});
