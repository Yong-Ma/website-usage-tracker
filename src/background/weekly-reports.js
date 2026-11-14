import { readAllData } from './storage.js';
import { nextWeeklyReportTime, normalizeWeeklyReportSettings } from '../shared/weekly-report-schedule.js';
import { buildWeeklyReport } from '../shared/weekly-report-aggregation.js';
import { reportHeadline, reportSummary } from '../shared/weekly-report-copy.js';

export const WEEKLY_REPORT_ALARM = 'weekly-report';

async function updateStatus(values) {
  const { weeklyReportStatus = {} } = await chrome.storage.local.get('weeklyReportStatus');
  await chrome.storage.local.set({ weeklyReportStatus: { ...weeklyReportStatus, ...values } });
}

export async function getWeeklyReportState() {
  const data = await readAllData();
  const { weeklyReportStatus = {} } = await chrome.storage.local.get('weeklyReportStatus');
  let notificationPermission = 'denied';
  try { notificationPermission = await chrome.notifications.getPermissionLevel(); } catch { /* Show the unavailable notification state. */ }
  return { settings: data.weeklyReportSettings, reports: data.weeklyReports, status: weeklyReportStatus, notificationPermission };
}

export async function saveWeeklyReportSettings(value) {
  const settings = normalizeWeeklyReportSettings(value);
  await chrome.storage.local.set({ weeklyReportSettings: settings });
  await scheduleWeeklyReport(true);
  return getWeeklyReportState();
}

export async function scheduleWeeklyReport(replace = false) {
  const { weeklyReportSettings: settings } = await readAllData();
  if (!settings.enabled) {
    await chrome.alarms.clear(WEEKLY_REPORT_ALARM);
    await updateStatus({ nextScheduledTime: null, scheduleError: false });
    return null;
  }
  try {
    const alarm = replace ? null : await chrome.alarms.get(WEEKLY_REPORT_ALARM);
    const { weeklyReportStatus = {} } = await chrome.storage.local.get('weeklyReportStatus');
    const savedTime = replace ? null : weeklyReportStatus.nextScheduledTime;
    const scheduledTime = Number.isFinite(savedTime) && savedTime > 0
      ? savedTime : alarm?.scheduledTime || nextWeeklyReportTime(settings);
    // Persist before creating the alarm so a worker/browser restart can recover it.
    await updateStatus({ nextScheduledTime: scheduledTime, scheduleError: false });
    if (alarm?.scheduledTime !== scheduledTime) await chrome.alarms.create(WEEKLY_REPORT_ALARM, { when: scheduledTime });
    return scheduledTime;
  } catch {
    await updateStatus({ scheduleError: true });
    return null;
  }
}

export async function initializeWeeklyReports(flush, resume) {
  const scheduledTime = await scheduleWeeklyReport();
  if (scheduledTime !== null && scheduledTime <= Date.now()) {
    await generateWeeklyReport(scheduledTime, flush, resume);
  }
}

export async function generateWeeklyReport(scheduledTime, flush, resume) {
  if (!Number.isFinite(scheduledTime)) return;
  const { weeklyReportSettings: settings } = await readAllData();
  if (!settings.enabled) return;
  let advanceSchedule = false;
  try {
    await flush();
    const data = await readAllData();
    const report = buildWeeklyReport(data.usageByDate, scheduledTime, data.excludedOrigins);
    if (report && !data.weeklyReports.some(existing => existing.id === report.id)) {
      await chrome.storage.local.set({ weeklyReports: [...data.weeklyReports, report] });
      try {
        const permission = await chrome.notifications.getPermissionLevel();
        if (permission !== 'granted') throw new Error('Notifications unavailable');
        await chrome.notifications.create(`weekly-report:${report.id}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icon-128.png'),
          title: reportHeadline(report, data.popupLanguage),
          message: reportSummary(report, data.popupLanguage),
        });
        await updateStatus({ notificationError: false, notificationPermission: permission });
      } catch {
        let notificationPermission = 'denied';
        try { notificationPermission = await chrome.notifications.getPermissionLevel(); } catch { /* Keep the unavailable notification state. */ }
        await updateStatus({ notificationError: true, notificationPermission });
      }
    }
    advanceSchedule = true;
    await updateStatus({ generationError: false });
  } catch (error) {
    await updateStatus({ generationError: true });
    throw error;
  } finally {
    try { await resume(); }
    finally {
      if (advanceSchedule) await scheduleWeeklyReport(true);
    }
  }
}

export async function openWeeklyReport(notificationId) {
  if (!notificationId.startsWith('weekly-report:')) return;
  const id = notificationId.slice('weekly-report:'.length);
  const { weeklyReports } = await readAllData();
  const query = weeklyReports.some(report => report.id === id) ? `?report=${encodeURIComponent(id)}` : '';
  await chrome.tabs.create({ url: chrome.runtime.getURL(`src/reports/reports.html${query}`) });
}
