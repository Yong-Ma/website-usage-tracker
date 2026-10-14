export const SUPPORTED_LANGUAGES = ['zh', 'en'];

export const TRANSLATIONS = {
  zh: {
    appTitle: '网站时长榜',
    settingsButtonLabel: '打开设置',
    settingsButtonTitle: '设置',
    rangeNavLabel: '时间范围',
    leaderboardLabel: '网站使用时长榜单',
    emptyState: '当前范围还没有记录',
    clearButton: '清空',
    deleteButton: '删除',
    settings: {
      languageLabel: '语言',
      pauseTrackingLabel: '暂停统计',
      pauseTrackingHint: '开启后暂停记录网站使用时长',
      pauseTrackingError: '暂停设置失败，请重试',
      excludedSitesLabel: '排除网站',
      excludedSitesHint: '排除后不再记录该网站',
      excludedSitesEmpty: '暂无排除网站',
      exitExclusionButton: '取消排除',
      languages: {
        zh: '中文',
        en: 'English',
      },
    },
    ranges: {
      today: '今日',
      week: '7 天',
      total: '总计',
    },
    summary: {
      today: '今日总使用',
      week: '7 天总使用',
      total: '总使用',
    },
    clear: {
      ariaLabel: {
        today: '清空今日统计',
        week: '清空最近 7 天统计',
        total: '清空全部统计',
      },
      confirm: {
        today: '确定要清空今日统计吗？',
        week: '确定要清空最近 7 天统计吗？',
        total: '确定要清空全部统计吗？',
      },
      success: {
        today: '已清空今日统计',
        week: '已清空最近 7 天统计',
        total: '已清空全部统计',
      },
      error: '清空失败，请重试',
    },
    delete: {
      ariaLabel: '删除 {origin}',
      confirm: '确定要删除 {origin} 在当前范围内的记录吗？',
      success: '已删除 {origin}',
      error: '删除失败，请重试',
    },
    open: {
      button: '打开',
      ariaLabel: '打开 {origin}',
      error: '无法打开网站，请重试',
    },
    exclude: {
      button: '排除',
      ariaLabel: '排除 {origin}',
      confirm: '确定不再统计 {origin} 吗？',
      success: '已排除 {origin}',
      error: '排除失败，请重试',
    },
    exitExclusion: {
      ariaLabel: '取消排除 {origin}',
      confirm: '确定恢复统计 {origin} 吗？',
      success: '已恢复统计 {origin}',
      error: '恢复统计失败，请重试',
    },
    backup: {
      label: '数据备份',
      export: {
        button: '导出数据',
        success: '数据已导出',
        error: '导出失败，请重试',
      },
      import: {
        button: '导入恢复',
        confirm: '导入备份会替换当前全部数据，确定继续吗？',
        success: '数据已恢复',
        invalid: '备份文件无效，请选择正确的 JSON 文件',
        error: '导入失败，请重试',
      },
    },
  },
  en: {
    appTitle: 'Website Time Board',
    settingsButtonLabel: 'Open settings',
    settingsButtonTitle: 'Settings',
    rangeNavLabel: 'Time range',
    leaderboardLabel: 'Website usage leaderboard',
    emptyState: 'No records in this range yet',
    clearButton: 'Clear',
    deleteButton: 'Delete',
    settings: {
      languageLabel: 'Language',
      pauseTrackingLabel: 'Pause tracking',
      pauseTrackingHint: 'Stops recording website usage while on',
      pauseTrackingError: 'Pause setting failed. Please try again.',
      excludedSitesLabel: 'Excluded websites',
      excludedSitesHint: 'Excluded websites are not tracked',
      excludedSitesEmpty: 'No excluded websites',
      exitExclusionButton: 'Remove exclusion',
      languages: {
        zh: '中文',
        en: 'English',
      },
    },
    ranges: {
      today: 'Today',
      week: '7 days',
      total: 'Total',
    },
    summary: {
      today: 'Today total',
      week: '7-day total',
      total: 'All-time total',
    },
    clear: {
      ariaLabel: {
        today: 'Clear today usage',
        week: 'Clear last 7 days',
        total: 'Clear all usage',
      },
      confirm: {
        today: 'Clear today usage?',
        week: 'Clear usage from the last 7 days?',
        total: 'Clear all usage?',
      },
      success: {
        today: 'Today cleared',
        week: 'Last 7 days cleared',
        total: 'All usage cleared',
      },
      error: 'Clear failed. Please try again.',
    },
    delete: {
      ariaLabel: 'Delete {origin}',
      confirm: 'Delete {origin} from the current range?',
      success: 'Deleted {origin}',
      error: 'Delete failed. Please try again.',
    },
    open: {
      button: 'Open',
      ariaLabel: 'Open {origin}',
      error: 'Could not open the website. Please try again.',
    },
    exclude: {
      button: 'Exclude',
      ariaLabel: 'Exclude {origin}',
      confirm: 'Stop tracking {origin}?',
      success: '{origin} excluded',
      error: 'Exclude failed. Please try again.',
    },
    exitExclusion: {
      ariaLabel: 'Remove exclusion for {origin}',
      confirm: 'Resume tracking {origin}?',
      success: 'Tracking resumed for {origin}',
      error: 'Could not resume tracking. Please try again.',
    },
    backup: {
      label: 'Data backup',
      export: {
        button: 'Export data',
        success: 'Data exported',
        error: 'Export failed. Please try again.',
      },
      import: {
        button: 'Import and restore',
        confirm: 'Importing a backup will replace all current data. Continue?',
        success: 'Data restored',
        invalid: 'Invalid backup. Choose a JSON file exported by this extension.',
        error: 'Import failed. Please try again.',
      },
    },
  },
};

export function isSupportedLanguage(language) {
  return SUPPORTED_LANGUAGES.includes(language);
}

export function getInitialLanguage({
  savedLanguage,
  navigatorLanguages = [],
  navigatorLanguage = '',
} = {}) {
  if (isSupportedLanguage(savedLanguage)) {
    return savedLanguage;
  }

  const languages = [
    ...navigatorLanguages,
    navigatorLanguage,
  ].filter(Boolean);

  return languages.some((language) => String(language).toLowerCase().startsWith('zh'))
    ? 'zh'
    : 'en';
}

export function getTranslation(language, key, replacements = {}) {
  const dictionary = TRANSLATIONS[isSupportedLanguage(language) ? language : 'en'];
  const value = key.split('.').reduce((current, part) => current?.[part], dictionary);
  if (typeof value !== 'string') {
    return key;
  }

  return value.replace(/\{(\w+)\}/g, (_, replacementKey) => (
    replacements[replacementKey] ?? ''
  ));
}
