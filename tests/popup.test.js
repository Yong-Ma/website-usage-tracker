import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getLocalDateKey } from '../src/shared/site-utils.js';

class FakeElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName;
    this.id = id;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.classList = { toggle: (name, on) => { this.className = on ? `${this.className} ${name}`.trim() : this.className.split(' ').filter((x) => x !== name).join(' '); } };
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
  async click() { for (const callback of this.listeners.click ?? []) await callback({ target: this, stopPropagation() {} }); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  closest() { return null; }
  focus() {}
  remove() {}
}

function textOf(element) {
  return [element.textContent, ...element.children.map(textOf)].join(' ');
}

test('site actions stay hidden until their row is hovered or focused', async () => {
  const css = await readFile(new URL('../src/popup/popup.css', import.meta.url), 'utf8');
  assert.match(css, /\.site-row\s*\{[\s\S]*?grid-template-columns:\s*34px minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.site-row-actions\s*\{[\s\S]*?position:\s*absolute;/);
  assert.match(css, /\.site-row-actions\s*\{[\s\S]*?opacity:\s*0;/);
  assert.match(css, /\.site-row:hover \.site-row-actions,[\s\S]*?\.site-row:focus-within \.site-row-actions\s*\{[\s\S]*?opacity:\s*1;/);
});

test('site row groups open, delete, and exclude controls in a hover actions wrapper', { concurrency: false }, async () => {
  const { elements } = await loadPopup();
  const row = elements['site-list'].children[0];
  const actions = row.children.at(-1);

  assert.equal(actions.className, 'site-row-actions');
  assert.equal(actions.children.length, 3);
  assert.equal(actions.children[0].className, 'site-open-button');
  assert.equal(actions.children[1].className, 'site-delete-button');
  assert.equal(actions.children[2].className, 'site-exclude-button');
});

async function loadPopup({
  excludedOrigins = [],
  runtimeResponse = { ok: true },
  tabsCreateError = null,
} = {}) {
  const ids = ['app-title', 'summary-label', 'summary-value', 'site-list', 'empty-state', 'range-tabs', 'clear-today', 'clear-status', 'settings-toggle', 'settings-panel', 'pause-tracking-label', 'pause-tracking-hint', 'pause-tracking-switch', 'language-setting-label', 'backup-setting-label', 'export-data', 'import-data', 'import-file', 'leaderboard', 'excluded-sites-label', 'excluded-sites-hint', 'excluded-sites'];
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement('div', id)]));
  elements['clear-today'].click = FakeElement.prototype.click.bind(elements['clear-today']);
  const tabs = ['today', 'week', 'total'].map((range) => { const el = new FakeElement('button'); el.dataset.range = range; return el; });
  const body = new FakeElement('body');
  globalThis.document = {
    documentElement: new FakeElement('html'), body,
    title: '',
    querySelector(selector) { return elements[selector.slice(1)] ?? null; },
    querySelectorAll(selector) { return selector === '.range-tab' ? tabs : selector === '.language-option' ? [] : []; },
    addEventListener() {},
    createElement(tag) { return new FakeElement(tag); },
  };
  globalThis.navigator = { languages: ['en'], language: 'en' };
  globalThis.window = { confirm: () => true };
  const today = getLocalDateKey(new Date());
  const usageByDate = { [today]: { github: { origin: 'https://github.com', seconds: 120, lastVisitedAt: 1 } } };
  const data = { usageByDate, popupLanguage: 'en', trackingPaused: false, excludedOrigins };
  const sent = [];
  const openedTabs = [];
  globalThis.chrome = {
    storage: { local: {
      async get(key) { return { [key]: data[key] }; },
      async set(values) { Object.assign(data, values); },
    } },
    runtime: { async sendMessage(message) {
      sent.push(message);
      if (message.type === 'setOriginExcluded' && runtimeResponse.ok) {
        data.excludedOrigins = message.isExcluded
          ? [...new Set([...data.excludedOrigins, message.origin])]
          : data.excludedOrigins.filter((origin) => origin !== message.origin);
      }
      return runtimeResponse;
    } },
    tabs: { async create(createProperties) {
      if (tabsCreateError) {
        throw tabsCreateError;
      }
      openedTabs.push(createProperties);
    } },
  };
  await import(`../src/popup/popup.js?test=${Date.now()}-${Math.random()}`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { elements, tabs, sent, data, openedTabs };
}

test('opening a listed origin creates a new tab for its full URL', { concurrency: false }, async () => {
  const { elements, openedTabs } = await loadPopup();
  const button = elements['site-list'].children[0].children.at(-1).children[0];

  await button.click();

  assert.deepEqual(openedTabs, [{ url: 'https://github.com' }]);
});

test('a failed tab creation reports an opening error', { concurrency: false }, async () => {
  const { elements } = await loadPopup({ tabsCreateError: new Error('tabs unavailable') });
  const button = elements['site-list'].children[0].children.at(-1).children[0];

  await button.click();

  assert.equal(elements['clear-status'].textContent, 'Could not open the website. Please try again.');
  assert.match(elements['clear-status'].className, /is-error/);
});

test('excluding a listed origin sends setOriginExcluded and removes it after storage refresh', { concurrency: false }, async () => {
  const { elements, sent, data } = await loadPopup();
  const button = elements['site-list'].children[0].children.at(-1).children.at(-1);
  await button.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(sent.at(-1), { type: 'setOriginExcluded', origin: 'https://github.com', isExcluded: true });
  assert.equal(textOf(elements['site-list']).includes('github.com'), false);
});

test('settings renders excluded origins and restores one through setOriginExcluded', { concurrency: false }, async () => {
  const { elements, sent } = await loadPopup({ excludedOrigins: ['https://github.com'] });
  assert.match(textOf(elements['excluded-sites']), /github\.com/);
  const button = elements['excluded-sites'].children[0].children.at(-1);
  await button.click();
  assert.deepEqual(sent.at(-1), { type: 'setOriginExcluded', origin: 'https://github.com', isExcluded: false });
});

test('a failed exclusion response leaves the origin visible and re-enables its button', { concurrency: false }, async () => {
  const { elements } = await loadPopup({ runtimeResponse: { ok: false } });
  const button = elements['site-list'].children[0].children.at(-1).children.at(-1);
  await button.click();
  assert.match(textOf(elements['site-list']), /github\.com/);
  assert.equal(button.disabled, false);
});
