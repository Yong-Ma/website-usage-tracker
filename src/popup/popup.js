import { aggregateUsage } from '../shared/usage-aggregation.js';
import { formatDuration } from '../shared/site-utils.js';
import {
  getInitialLanguage,
  getTranslation,
  isSupportedLanguage,
} from './i18n.js';

const STORAGE_KEY = 'usageByDate';
const LANGUAGE_STORAGE_KEY = 'popupLanguage';
const TRACKING_PAUSED_STORAGE_KEY = 'trackingPaused';
const FALLBACK_ICON = '../../assets/icon.svg';

const state = {
  range: 'today',
  language: 'en',
  isTrackingPaused: false,
  usageByDate: {},
};

const appTitle = document.querySelector('#app-title');
const summaryLabel = document.querySelector('#summary-label');
const summaryValue = document.querySelector('#summary-value');
const siteList = document.querySelector('#site-list');
const emptyState = document.querySelector('#empty-state');
const rangeTabs = [...document.querySelectorAll('.range-tab')];
const rangeTabsNav = document.querySelector('#range-tabs');
const clearTodayButton = document.querySelector('#clear-today');
const clearStatus = document.querySelector('#clear-status');
const settingsToggle = document.querySelector('#settings-toggle');
const settingsPanel = document.querySelector('#settings-panel');
const pauseTrackingLabel = document.querySelector('#pause-tracking-label');
const pauseTrackingHint = document.querySelector('#pause-tracking-hint');
const pauseTrackingSwitch = document.querySelector('#pause-tracking-switch');
const languageSettingLabel = document.querySelector('#language-setting-label');
const languageOptions = [...document.querySelectorAll('.language-option')];
const leaderboard = document.querySelector('#leaderboard');

initPopup();

async function initPopup() {
  const [usageByDate, savedLanguage, isTrackingPaused] = await Promise.all([
    loadUsageByDate(),
    loadSavedLanguage(),
    loadTrackingPaused(),
  ]);
  state.usageByDate = usageByDate;
  state.isTrackingPaused = isTrackingPaused;
  state.language = getInitialLanguage({
    savedLanguage,
    navigatorLanguages: navigator.languages || [],
    navigatorLanguage: navigator.language || '',
  });
  bindRangeTabs();
  bindClearButton();
  bindSettings();
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

async function loadSavedLanguage() {
  const result = await chrome.storage.local.get(LANGUAGE_STORAGE_KEY);
  return result?.[LANGUAGE_STORAGE_KEY];
}

async function loadTrackingPaused() {
  const result = await chrome.storage.local.get(TRACKING_PAUSED_STORAGE_KEY);
  return result?.[TRACKING_PAUSED_STORAGE_KEY] === true;
}

function bindRangeTabs() {
  for (const tab of rangeTabs) {
    tab.addEventListener('click', () => {
      state.range = tab.dataset.range;
      setClearStatus('');
      render();
    });
  }
}

function bindClearButton() {
  clearTodayButton.addEventListener('click', async () => {
    const confirmed = window.confirm(t(`clear.confirm.${state.range}`));
    if (!confirmed) {
      return;
    }

    setClearPending(true);
    setClearStatus('');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'clearUsage',
        range: state.range,
      });
      if (!response?.ok) {
        throw new Error(response?.error || t('clear.error'));
      }

      state.usageByDate = await loadUsageByDate();
      render();
      setClearStatus(t(`clear.success.${state.range}`));
    } catch {
      setClearStatus(t('clear.error'), true);
    } finally {
      setClearPending(false);
    }
  });
}

function bindSettings() {
  settingsToggle.addEventListener('click', () => {
    setSettingsOpen(settingsPanel.hidden);
  });

  for (const option of languageOptions) {
    option.addEventListener('click', async () => {
      const language = option.dataset.language;
      if (!isSupportedLanguage(language)) {
        return;
      }
      if (language === state.language) {
        renderLanguageOptions();
        return;
      }

      state.language = language;
      await chrome.storage.local.set({ [LANGUAGE_STORAGE_KEY]: state.language });
      setClearStatus('');
      render();
    });
  }

  pauseTrackingSwitch.addEventListener('click', async () => {
    const nextIsPaused = !state.isTrackingPaused;
    state.isTrackingPaused = nextIsPaused;
    setClearStatus('');
    renderPauseTrackingSwitch();
    pauseTrackingSwitch.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'setTrackingPaused',
        isPaused: nextIsPaused,
      });
      if (!response?.ok) {
        throw new Error(response?.error || 'Failed to update tracking pause setting');
      }
    } catch {
      state.isTrackingPaused = !nextIsPaused;
      renderPauseTrackingSwitch();
      setClearStatus(t('settings.pauseTrackingError'), true);
    } finally {
      pauseTrackingSwitch.disabled = false;
    }
  });

  document.addEventListener('click', (event) => {
    if (settingsPanel.hidden || event.target.closest('.settings-control')) {
      return;
    }
    setSettingsOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setSettingsOpen(false);
      settingsToggle.focus();
    }
  });
}

function render() {
  const { rows, totalSeconds } = aggregateUsage(state.usageByDate, state.range);
  applyStaticCopy();
  summaryLabel.textContent = t(`summary.${state.range}`);
  summaryValue.textContent = formatDuration(totalSeconds, state.language);
  renderClearButton();
  renderTabs();
  renderRows(rows);
}

function applyStaticCopy() {
  document.documentElement.lang = state.language === 'zh' ? 'zh-CN' : 'en';
  document.title = t('appTitle');
  appTitle.textContent = t('appTitle');
  settingsToggle.setAttribute('aria-label', t('settingsButtonLabel'));
  settingsToggle.dataset.tooltip = t('settingsButtonTitle');
  pauseTrackingLabel.textContent = t('settings.pauseTrackingLabel');
  pauseTrackingHint.textContent = t('settings.pauseTrackingHint');
  languageSettingLabel.textContent = t('settings.languageLabel');
  rangeTabsNav.setAttribute('aria-label', t('rangeNavLabel'));
  leaderboard.setAttribute('aria-label', t('leaderboardLabel'));
  emptyState.textContent = t('emptyState');
  renderPauseTrackingSwitch();
  renderLanguageOptions();
}

function renderPauseTrackingSwitch() {
  pauseTrackingSwitch.setAttribute('aria-checked', String(state.isTrackingPaused));
  pauseTrackingSwitch.title = t('settings.pauseTrackingLabel');
}

function renderClearButton() {
  const clearLabel = t(`clear.ariaLabel.${state.range}`);
  clearTodayButton.textContent = t('clearButton');
  clearTodayButton.setAttribute('aria-label', clearLabel);
  clearTodayButton.title = clearLabel;
}

function renderTabs() {
  for (const tab of rangeTabs) {
    const isActive = tab.dataset.range === state.range;
    tab.textContent = t(`ranges.${tab.dataset.range}`);
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-pressed', String(isActive));
  }
}

function renderLanguageOptions() {
  for (const option of languageOptions) {
    const isActive = option.dataset.language === state.language;
    option.textContent = t(`settings.languages.${option.dataset.language}`);
    option.classList.toggle('is-active', isActive);
    option.setAttribute('aria-checked', String(isActive));
  }
}

function setSettingsOpen(isOpen) {
  settingsPanel.hidden = !isOpen;
  settingsToggle.setAttribute('aria-expanded', String(isOpen));
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
    duration.textContent = formatDuration(row.seconds, state.language);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'site-delete-button';
    deleteButton.type = 'button';
    deleteButton.textContent = t('deleteButton');
    deleteButton.title = t('delete.ariaLabel', { origin: row.origin });
    deleteButton.setAttribute('aria-label', t('delete.ariaLabel', { origin: row.origin }));
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteSiteUsage(row, deleteButton);
    });

    meta.append(rank, origin);
    item.append(icon, meta, duration, deleteButton);
    siteList.append(item);
  });
}

async function deleteSiteUsage(row, deleteButton) {
  const confirmed = window.confirm(t('delete.confirm', { origin: row.origin }));
  if (!confirmed) {
    return;
  }

  deleteButton.disabled = true;
  deleteButton.setAttribute('aria-busy', 'true');
  setClearStatus('');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'deleteUsageForOrigin',
      origin: row.origin,
      range: state.range,
    });
    if (!response?.ok) {
      throw new Error(response?.error || t('delete.error'));
    }

    state.usageByDate = await loadUsageByDate();
    render();
    setClearStatus(t('delete.success', { origin: row.origin }));
  } catch {
    deleteButton.disabled = false;
    deleteButton.setAttribute('aria-busy', 'false');
    setClearStatus(t('delete.error'), true);
  }
}

function setClearPending(isPending) {
  clearTodayButton.disabled = isPending;
  clearTodayButton.textContent = t('clearButton');
  clearTodayButton.setAttribute('aria-busy', String(isPending));
}

function setClearStatus(message, isError = false) {
  clearStatus.textContent = message;
  clearStatus.classList.toggle('is-error', isError);
}

function t(key, replacements) {
  return getTranslation(state.language, key, replacements);
}
