import { formatDuration } from './site-utils.js';

export function reportHeadline(report, language = 'en') {
  const zh = language === 'zh';
  if (report.previousTotalSeconds === null) return zh ? '你的首份周报，记录这一周的足迹' : 'Your first report: a look back at your week';
  const delta = report.totalSeconds - report.previousTotalSeconds;
  if (delta === 0) return zh ? '这周的使用时长与上期持平' : 'Your usage stayed the same this week';
  const duration = formatDuration(Math.abs(delta), language);
  return zh ? `这周，你${delta < 0 ? '少' : '多'}花了 ${duration}` : `You spent ${duration} ${delta < 0 ? 'less' : 'more'} this week`;
}

export function reportSummary(report, language = 'en') {
  const duration = formatDuration(report.totalSeconds, language);
  return language === 'zh' ? `${report.rangeStart} 至 ${report.rangeEnd} · 总使用 ${duration}` : `${report.rangeStart} – ${report.rangeEnd} · Total ${duration}`;
}
