import { getInitialLanguage } from '../popup/i18n.js';
import { formatDuration } from '../shared/site-utils.js';
import { normalizeWeeklyReportSettings } from '../shared/weekly-report-schedule.js';
import { reportHeadline } from '../shared/weekly-report-copy.js';

const copy = {
  zh: {
    'brand-name': '网站时长榜', 'language-label': '语言', 'intro-kicker': '每周，留一点时间回望',
    'page-title': '叙事周报', 'page-description': '用一份简短的回顾，看看时间都去了哪里。',
    'reminder-title': '给回顾定个时间', 'local-badge': '仅保存在本机',
    'reminder-enabled-label': '每周提醒我', 'weekday-label': '提醒日', 'time-label': '本地时间',
    'save-reminder': '保存设置', 'range-explanation': '每份周报涵盖提醒日前 7 个完整日，不含提醒当天。浏览器关闭时会延后处理。',
    'history-title': '时间的足迹', 'empty-title': '第一份周报，值得期待',
    'empty-description': '开启每周提醒后，有使用记录的周期会自动生成周报，之后可以随时在这里回看。',
    'enable-reminder': '设置每周提醒', 'retry-load': '重新加载',
    'snapshot-note': '周报是生成时的快照。清空使用记录不会改变已保存的周报。',
    'notification-warning': '浏览器通知可能未展示。请检查扩展和系统通知权限；周报仍会保存到这里。',
    'schedule-warning': '提醒排程暂未成功，后台会自动重试。也可以重新保存设置。',
    weekdays: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    off: '每周提醒已关闭，历史周报仍可随时查看。', next: '下次提醒：', count: '份已保存的周报',
    saved: '提醒设置已保存', invalid: '请选择有效的星期和时间。', saveError: '保存失败，请重试。',
    loadError: '周报加载失败，请重新加载。', total: '总使用时长', largest: '变化最大的网站', least: '使用最少的一天',
    unavailable: '暂无可比数据', detail: '查看完整报告', top: '这周最常使用的网站', first: '没有上一周期的使用记录，暂不比较增减。',
    previous: '上一周期总使用：', leastExplanation: '这一日的记录时长最少（包含没有记录的日期），并不代表专注程度。',
    created: '生成于 ', week: '周', same: '与上期持平', more: '增加', less: '减少',
  },
  en: {
    'brand-name': 'Website Usage Tracker', 'language-label': 'Language', 'intro-kicker': 'A little time to look back',
    'page-title': 'Your week, in words', 'page-description': 'A short reflection on where your browsing time went.',
    'reminder-title': 'Make room for a weekly reflection', 'local-badge': 'Stored on this device',
    'reminder-enabled-label': 'Remind me weekly', 'weekday-label': 'Day', 'time-label': 'Local time',
    'save-reminder': 'Save settings', 'range-explanation': 'Each report covers the 7 complete days before the reminder date. Closed browsers process reminders later.',
    'history-title': 'Your weekly history', 'empty-title': 'Your first report is ahead',
    'empty-description': 'Enable weekly reminders to automatically save a report for each period with usage. Come back here to read it anytime.',
    'enable-reminder': 'Set a weekly reminder', 'retry-load': 'Reload',
    'snapshot-note': 'Reports are saved snapshots. Clearing usage records does not change past reports.',
    'notification-warning': 'Browser notifications may not appear. Check extension and system notification permissions; reports will still be saved here.',
    'schedule-warning': 'The reminder could not be scheduled. The background will retry, or you can save settings again.',
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    off: 'Weekly reminders are off. Your saved reports are always available.', next: 'Next reminder: ', count: 'saved reports',
    saved: 'Reminder settings saved', invalid: 'Choose a valid day and time.', saveError: 'Could not save. Please try again.',
    loadError: 'Could not load reports. Please reload.', total: 'Total time', largest: 'Largest website change', least: 'Least-used day',
    unavailable: 'No comparison yet', detail: 'View full report', top: 'Your most-used websites', first: 'There are no usage records for the previous period, so a comparison is unavailable.',
    previous: 'Previous period total: ', leastExplanation: 'This day had the least recorded usage, including days with no records. This does not measure focus.',
    created: 'Created ', week: 'Week', same: 'Unchanged', more: 'more', less: 'less',
  },
};

const el = id => document.querySelector(`#${id}`);
let language = 'en';
let state = null;
let dirty = false;
let locatedReport = false;
const t = key => copy[language][key];
const duration = seconds => formatDuration(seconds, language);
const dateTime = timestamp => new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
  year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
}).format(new Date(timestamp));

initialize();

async function initialize() {
  try {
    const saved = await chrome.storage.local.get('popupLanguage');
    language = getInitialLanguage({ savedLanguage: saved.popupLanguage, navigatorLanguages: navigator.languages, navigatorLanguage: navigator.language });
  } catch { language = getInitialLanguage({ navigatorLanguage: navigator.language }); }
  renderCopy();
  el('report-language').addEventListener('change', async () => {
    const next = el('report-language').value;
    if (next !== 'zh' && next !== 'en') return;
    language = next;
    renderCopy();
    if (state) render();
    try { await chrome.storage.local.set({ popupLanguage: language }); }
    catch { el('page-status').textContent = t('saveError'); }
  });
  el('reminder-form').addEventListener('submit', saveSettings);
  el('reminder-form').addEventListener('input', () => { dirty = true; el('form-status').textContent = ''; });
  el('enable-reminder').addEventListener('click', () => {
    el('reminder-enabled').checked = true;
    dirty = true;
    el('save-reminder').focus();
    el('reminder-form').scrollIntoView({ block: 'center' });
  });
  el('retry-load').addEventListener('click', load);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.popupLanguage?.newValue === 'zh' || changes.popupLanguage?.newValue === 'en') {
      language = changes.popupLanguage.newValue;
      renderCopy();
    }
    if (['weeklyReports', 'weeklyReportSettings', 'weeklyReportStatus', 'popupLanguage'].some(key => key in changes)) load();
  });
  await load();
}

function renderCopy() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = t('page-title');
  for (const [id, text] of Object.entries(copy[language])) {
    if (id.includes('-') && id !== 'weekdays') el(id).textContent = text;
  }
  el('report-language').value = language;
  const selected = el('reminder-weekday').value || '7';
  el('reminder-weekday').replaceChildren(...t('weekdays').map((day, index) => {
    const option = document.createElement('option');
    option.value = String(index + 1);
    option.textContent = day;
    return option;
  }));
  el('reminder-weekday').value = selected;
}

async function load() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getWeeklyReports' });
    if (!response?.ok) throw new Error('Unavailable');
    state = response;
    el('page-status').textContent = '';
    el('retry-load').hidden = true;
    el('reminder-fields').disabled = false;
    if (!dirty) populateSettings();
    render();
  } catch {
    el('page-status').textContent = t('loadError');
    el('retry-load').hidden = false;
  }
}

function populateSettings() {
  el('reminder-enabled').checked = state.settings.enabled;
  el('reminder-weekday').value = String(state.settings.weekday);
  el('reminder-time').value = state.settings.time;
}

async function saveSettings(event) {
  event.preventDefault();
  let settings;
  try {
    settings = normalizeWeeklyReportSettings({ enabled: el('reminder-enabled').checked, weekday: Number(el('reminder-weekday').value), time: el('reminder-time').value });
  } catch { el('form-status').textContent = t('invalid'); return; }
  el('reminder-fields').disabled = true;
  el('form-status').textContent = '';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'setWeeklyReportSettings', settings });
    if (!response?.ok) throw new Error('Unavailable');
    state = response;
    dirty = false;
    populateSettings();
    render();
    el('form-status').textContent = t('saved');
  } catch { el('form-status').textContent = t('saveError'); }
  finally { el('reminder-fields').disabled = false; }
}

function render() {
  const reports = [...state.reports].sort((a, b) => b.createdAt - a.createdAt || b.rangeEnd.localeCompare(a.rangeEnd));
  el('next-reminder').textContent = !state.settings.enabled ? t('off') : state.status.nextScheduledTime
    ? `${t('next')}${dateTime(state.status.nextScheduledTime)}` : t('schedule-warning');
  const permission = state.status.notificationPermission ?? state.notificationPermission;
  el('notification-warning').hidden = permission === 'granted' && !state.status.notificationError;
  el('schedule-warning').hidden = !state.status.scheduleError;
  el('report-count').textContent = `${reports.length} ${t('count')}`;
  el('empty-state').hidden = reports.length > 0;
  const requestedId = new URLSearchParams(location.search).get('report');
  const expanded = new Set([...el('report-list').children].filter(card => card.open).map(card => card.id));
  const cards = reports.map(report => {
    const card = reportCard(report);
    card.open = expanded.has(card.id);
    return card;
  });
  el('report-list').replaceChildren(...cards);
  if (!locatedReport) {
    const index = reports.findIndex(report => report.id === requestedId);
    if (index >= 0) {
      cards[index].open = true;
      cards[index].focus();
      cards[index].scrollIntoView({ block: 'start' });
      locatedReport = true;
    }
  }
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function reportCard(report) {
  const card = node('details', undefined, 'report-card');
  card.id = `report-${report.id}`;
  card.setAttribute('tabindex', '-1');
  const summary = node('summary');
  const meta = node('div', undefined, 'report-meta');
  meta.append(node('span', `${report.rangeStart} — ${report.rangeEnd}`), node('span', weekLabel(report.rangeEnd)));
  const metrics = node('dl', undefined, 'report-metrics');
  const largest = report.largestChange ? siteName(report.largestChange.origin) : t('unavailable');
  for (const [label, value] of [[t('total'), duration(report.totalSeconds)], [t('largest'), largest], [t('least'), report.leastUsedDay.dateKey]]) {
    const metric = node('div');
    metric.append(node('dt', label), node('dd', value));
    metrics.append(metric);
  }
  summary.append(meta, node('h3', reportHeadline(report, language)), metrics, node('span', t('detail'), 'detail-toggle'));
  const detail = node('div', undefined, 'report-detail');
  detail.append(node('p', report.previousTotalSeconds === null ? t('first') : `${t('previous')}${duration(report.previousTotalSeconds)}. ${reportHeadline(report, language)}.`));
  if (report.largestChange) {
    const { origin, secondsDelta } = report.largestChange;
    const change = secondsDelta === 0 ? t('same') : `${t(secondsDelta > 0 ? 'more' : 'less')} ${duration(Math.abs(secondsDelta))}`;
    detail.append(node('p', `${t('largest')} · ${siteName(origin)} · ${change}`));
  }
  detail.append(node('p', `${t('least')} · ${report.leastUsedDay.dateKey} · ${duration(report.leastUsedDay.seconds)}. ${t('leastExplanation')}`), node('h4', t('top')));
  const sites = node('ol', undefined, 'top-sites');
  for (const site of report.topSites) {
    const row = node('li');
    const content = node('div');
    const link = node('a', siteName(site.origin));
    link.href = site.origin;
    link.target = '_blank';
    link.rel = 'noreferrer';
    content.append(link, node('span', duration(site.seconds)));
    row.append(content);
    sites.append(row);
  }
  detail.append(sites, node('p', `${t('created')}${dateTime(report.createdAt)}`, 'created-at'));
  card.append(summary, detail);
  return card;
}

function siteName(origin) { return new URL(origin).hostname; }

function weekLabel(dateKey) {
  const day = new Date(`${dateKey}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const year = day.getUTCFullYear();
  const week = Math.ceil((((day - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1) / 7);
  return language === 'zh' ? `${year} · 第 ${week} 周` : `${year} · Week ${week}`;
}
