import { canonicalizeUrl, getLocalDateKey } from './site-utils.js';

const seconds = value => Number.isSafeInteger(value) && value >= 0;
const origin = value => typeof value === 'string' && canonicalizeUrl(value) === value;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && getLocalDateKey(date) === value;
}

export function normalizeWeeklyReports(reports = []) {
  if (!Array.isArray(reports)) throw new Error('周报数据无效');
  const ids = new Set();
  return reports.map(report => {
    const end = new Date(`${report?.rangeStart}T12:00:00`);
    end.setDate(end.getDate() + 6);
    if (!report || !validDate(report.rangeStart) || !validDate(report.rangeEnd)
      || getLocalDateKey(end) !== report.rangeEnd
      || report.id !== `${report.rangeStart}_${report.rangeEnd}` || ids.has(report.id)
      || !seconds(report.createdAt) || !seconds(report.totalSeconds) || report.totalSeconds === 0
      || !(report.previousTotalSeconds === null || (seconds(report.previousTotalSeconds) && report.previousTotalSeconds > 0))
      || !Array.isArray(report.topSites) || report.topSites.length < 1 || report.topSites.length > 3
      || new Set(report.topSites.map(site => site?.origin)).size !== report.topSites.length
      || report.topSites.some(site => !origin(site?.origin) || !seconds(site.seconds) || site.seconds === 0 || typeof site.faviconUrl !== 'string')
      || report.topSites.reduce((sum, site) => sum + site.seconds, 0) > report.totalSeconds
      || (report.previousTotalSeconds === null ? report.largestChange !== null
        : (!origin(report.largestChange?.origin) || !Number.isSafeInteger(report.largestChange?.secondsDelta)))
      || !validDate(report.leastUsedDay?.dateKey) || !seconds(report.leastUsedDay?.seconds)
      || report.leastUsedDay.seconds > report.totalSeconds
      || report.leastUsedDay.dateKey < report.rangeStart || report.leastUsedDay.dateKey > report.rangeEnd) {
      throw new Error('周报数据无效');
    }
    ids.add(report.id);
    return {
      id: report.id, rangeStart: report.rangeStart, rangeEnd: report.rangeEnd,
      createdAt: report.createdAt, totalSeconds: report.totalSeconds,
      previousTotalSeconds: report.previousTotalSeconds,
      topSites: report.topSites.map(site => ({ origin: site.origin, seconds: site.seconds, faviconUrl: site.faviconUrl })),
      largestChange: report.largestChange === null ? null : { origin: report.largestChange.origin, secondsDelta: report.largestChange.secondsDelta },
      leastUsedDay: { dateKey: report.leastUsedDay.dateKey, seconds: report.leastUsedDay.seconds },
    };
  });
}
