import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInitialLanguage,
  getTranslation,
  isSupportedLanguage,
} from '../src/popup/i18n.js';

test('getInitialLanguage uses a saved supported language before browser languages', () => {
  assert.equal(getInitialLanguage({ savedLanguage: 'en', navigatorLanguages: ['zh-CN'] }), 'en');
});

test('getInitialLanguage defaults to Chinese for Chinese browser languages', () => {
  assert.equal(getInitialLanguage({ navigatorLanguages: ['zh-CN', 'en-US'] }), 'zh');
  assert.equal(getInitialLanguage({ navigatorLanguage: 'zh-Hant-TW' }), 'zh');
});

test('getInitialLanguage defaults to English when the browser is not Chinese', () => {
  assert.equal(getInitialLanguage({ navigatorLanguages: ['fr-FR', 'en-US'] }), 'en');
  assert.equal(getInitialLanguage({ navigatorLanguage: 'ja-JP' }), 'en');
});

test('getTranslation resolves mapped popup copy by language', () => {
  assert.equal(getTranslation('zh', 'appTitle'), '网站时长榜');
  assert.equal(getTranslation('en', 'appTitle'), 'Website Time Board');
  assert.equal(getTranslation('en', 'clear.success.today'), 'Today cleared');
  assert.equal(getTranslation('zh', 'settingsButtonTitle'), '设置');
  assert.equal(getTranslation('en', 'settingsButtonTitle'), 'Settings');
  assert.equal(getTranslation('zh', 'settings.languageLabel'), '语言');
  assert.equal(getTranslation('en', 'settings.languageLabel'), 'Language');
  assert.equal(getTranslation('zh', 'settings.pauseTrackingLabel'), '暂停统计');
  assert.equal(getTranslation('en', 'settings.pauseTrackingLabel'), 'Pause tracking');
  assert.equal(getTranslation('zh', 'settings.pauseTrackingHint'), '开启后暂停记录网站使用时长');
  assert.equal(getTranslation('en', 'settings.pauseTrackingHint'), 'Stops recording website usage while on');
  assert.equal(getTranslation('zh', 'settings.pauseTrackingError'), '暂停设置失败，请重试');
  assert.equal(getTranslation('en', 'settings.pauseTrackingError'), 'Pause setting failed. Please try again.');
  assert.equal(getTranslation('zh', 'settings.languages.zh'), '中文');
  assert.equal(getTranslation('en', 'settings.languages.en'), 'English');
});

test('getTranslation resolves exclusion list copy in both languages', () => {
  const copy = [
    ['settings.excludedSitesLabel'],
    ['settings.excludedSitesHint'],
    ['settings.excludedSitesEmpty'],
    ['settings.exitExclusionButton'],
    ['exclude.button'],
    ['exclude.ariaLabel'],
    ['exclude.confirm'],
    ['exclude.success'],
    ['exclude.error'],
    ['exitExclusion.ariaLabel'],
    ['exitExclusion.confirm'],
    ['exitExclusion.success'],
    ['exitExclusion.error'],
    ['open.button'],
    ['open.ariaLabel'],
    ['open.error'],
  ];

  for (const [key] of copy) {
    assert.notEqual(getTranslation('zh', key), key);
    assert.notEqual(getTranslation('en', key), key);
  }
});

test('isSupportedLanguage only accepts the two popup languages', () => {
  assert.equal(isSupportedLanguage('zh'), true);
  assert.equal(isSupportedLanguage('en'), true);
  assert.equal(isSupportedLanguage('zh-CN'), false);
});
