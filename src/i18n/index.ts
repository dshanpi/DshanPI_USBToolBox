import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import enUS from './locales/en-US.json';
import jaJP from './locales/ja-JP.json';
import koKR from './locales/ko-KR.json';

export const resources = {
  'zh-CN': {
    translation: zhCN,
  },
  'zh-TW': {
    translation: zhTW,
  },
  'en-US': {
    translation: enUS,
  },
  'ja-JP': {
    translation: jaJP,
  },
  'ko-KR': {
    translation: koKR,
  },
} as const;

export const supportedLanguages = [
  { code: 'zh-CN', name: '简体中文', nativeName: '简体中文' },
  { code: 'zh-TW', name: '繁體中文', nativeName: '繁體中文' },
  { code: 'en-US', name: 'English', nativeName: 'English' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어' },
] as const;

export type SupportedLanguage = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'ko-KR';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR', 'zh', 'en', 'ja', 'ko'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    load: 'currentOnly',
  });

const systemLanguageMap: Record<string, SupportedLanguage> = {
  zh: 'zh-CN',
  'zh-CN': 'zh-CN',
  'zh-Hans': 'zh-CN',
  'zh-Hans-CN': 'zh-CN',
  'zh-SG': 'zh-CN',
  'zh-TW': 'zh-TW',
  'zh-Hant': 'zh-TW',
  'zh-Hant-TW': 'zh-TW',
  'zh-HK': 'zh-TW',
  'zh-Hant-HK': 'zh-TW',
  'zh-MO': 'zh-TW',
  en: 'en-US',
  'en-US': 'en-US',
  'en-GB': 'en-US',
  ja: 'ja-JP',
  'ja-JP': 'ja-JP',
  ko: 'ko-KR',
  'ko-KR': 'ko-KR',
};

export function getSystemLanguage(): SupportedLanguage {
  const browserLang = navigator.language || navigator.userLanguage;
  if (!browserLang) {
    return 'zh-CN';
  }

  const mappedLang = systemLanguageMap[browserLang];
  if (mappedLang) {
    return mappedLang;
  }

  const baseLang = browserLang.split('-')[0];
  const mappedBaseLang = systemLanguageMap[baseLang];
  if (mappedBaseLang) {
    return mappedBaseLang;
  }

  return 'zh-CN';
}

export function initializeLanguage(): void {
  const savedLang = localStorage.getItem('i18nextLng');
  if (!savedLang) {
    const systemLang = getSystemLanguage();
    i18n.changeLanguage(systemLang);
    localStorage.setItem('i18nextLng', systemLang);
  }
}

export default i18n;
