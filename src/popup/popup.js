import { aggregateUsage } from '../shared/usage-aggregation.js';
import { formatDuration } from '../shared/site-utils.js';

const STORAGE_KEY = 'usageByDate';
const FALLBACK_ICON = '../../assets/icon.svg';
const RANGE_LABELS = {
  today: '今日总使用',
  week: '7 天总使用',
  total: '总使用',
};

const state = {
  range: 'today',
  usageByDate: {},
};

const summaryLabel = document.querySelector('#summary-label');
const summaryValue = document.querySelector('#summary-value');
const siteList = document.querySelector('#site-list');
const emptyState = document.querySelector('#empty-state');
const rangeTabs = [...document.querySelectorAll('.range-tab')];

initPopup();

async function initPopup() {
  state.usageByDate = await loadUsageByDate();
  bindRangeTabs();
  render();
}

async function loadUsageByDate() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const usageByDate = result?.[STORAGE_KEY];
  if (!usageByDate || typeof usageByDate !== 'object' || Array.isArray(usageByDate)) {
    return {};
  }
  return usageByDate;
}

function bindRangeTabs() {
  for (const tab of rangeTabs) {
    tab.addEventListener('click', () => {
      state.range = tab.dataset.range;
      render();
    });
  }
}

function render() {
  const { rows, totalSeconds } = aggregateUsage(state.usageByDate, state.range);
  summaryLabel.textContent = RANGE_LABELS[state.range];
  summaryValue.textContent = formatDuration(totalSeconds);
  renderTabs();
  renderRows(rows);
}

function renderTabs() {
  for (const tab of rangeTabs) {
    const isActive = tab.dataset.range === state.range;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
  }
}

function renderRows(rows) {
  siteList.replaceChildren();
  emptyState.classList.toggle('is-visible', rows.length === 0);

  rows.forEach((row, index) => {
    const item = document.createElement('li');
    item.className = 'site-row';

    const icon = document.createElement('img');
    icon.className = 'site-icon';
    icon.src = row.faviconUrl || FALLBACK_ICON;
    icon.alt = '';
    icon.addEventListener('error', () => {
      icon.src = FALLBACK_ICON;
    }, { once: true });

    const meta = document.createElement('div');
    meta.className = 'site-meta';

    const rank = document.createElement('span');
    rank.className = 'site-rank';
    rank.textContent = `#${index + 1}`;

    const origin = document.createElement('div');
    origin.className = 'site-origin';
    origin.textContent = row.origin;
    origin.title = row.origin;

    const duration = document.createElement('div');
    duration.className = 'site-duration';
    duration.textContent = formatDuration(row.seconds);

    meta.append(rank, origin);
    item.append(icon, meta, duration);
    siteList.append(item);
  });
}
