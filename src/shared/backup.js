export const BACKUP_FORMAT = 'website-usage-tracker-backup';
export const BACKUP_VERSION = 1;

export function createBackup(data, exportedAt = new Date().toISOString()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    data: normalizeBackupData(data),
  };
}

export function serializeBackup(data, exportedAt = new Date().toISOString()) {
  return JSON.stringify(createBackup(data, exportedAt), null, 2);
}

export function parseBackup(text) {
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error('JSON 文件内容无效');
  }

  if (!isPlainObject(backup) || backup.format !== BACKUP_FORMAT) {
    throw new Error('备份文件格式不支持');
  }
  if (backup.version !== BACKUP_VERSION) {
    throw new Error('备份文件版本不支持');
  }

  return normalizeBackupData(backup.data);
}

export function normalizeBackupData(data) {
  if (!isPlainObject(data) || !isPlainObject(data.usageByDate)) {
    throw new Error('usageByDate 数据无效');
  }
  if (typeof data.trackingPaused !== 'boolean') {
    throw new Error('暂停统计设置无效');
  }
  if (!Array.isArray(data.excludedOrigins)
    || data.excludedOrigins.some((origin) => typeof origin !== 'string')) {
    throw new Error('排除网站数据无效');
  }
  if (data.popupLanguage !== 'zh' && data.popupLanguage !== 'en') {
    throw new Error('语言设置无效');
  }

  return {
    usageByDate: data.usageByDate,
    trackingPaused: data.trackingPaused,
    excludedOrigins: [...data.excludedOrigins],
    popupLanguage: data.popupLanguage,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
