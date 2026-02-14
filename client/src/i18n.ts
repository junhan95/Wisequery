import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ko from './locales/ko.json';

// Detect browser language
const detectBrowserLanguage = (): string => {
  const savedLanguage = localStorage.getItem('language');
  if (savedLanguage) {
    return savedLanguage;
  }
  
  // Check browser language
  const browserLang = navigator.language || (navigator as any).userLanguage;
  
  // Return 'ko' if browser language is Korean, otherwise 'en'
  if (browserLang.toLowerCase().startsWith('ko')) {
    return 'ko';
  }
  
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ko: { translation: ko },
    },
    lng: detectBrowserLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
