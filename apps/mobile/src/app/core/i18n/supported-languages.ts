import { LanguageCode } from '@lingua-card/shared/domain';

export interface SupportedLanguage {
  code: LanguageCode;
  label: string;
  nativeName: string;
  flag: string;
  dir: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  { code: 'en', label: 'English',   nativeName: 'English',    flag: '🇬🇧', dir: 'ltr' },
  { code: 'es', label: 'Spanish',   nativeName: 'Español',    flag: '🇪🇸', dir: 'ltr' },
  { code: 'tr', label: 'Turkish',   nativeName: 'Türkçe',     flag: '🇹🇷', dir: 'ltr' },
  { code: 'uk', label: 'Ukrainian', nativeName: 'Українська', flag: '🇺🇦', dir: 'ltr' },
  { code: 'ru', label: 'Russian',   nativeName: 'Русский',    flag: '🇷🇺', dir: 'ltr' },
  { code: 'ar', label: 'Arabic',    nativeName: 'العربية',    flag: '🇸🇦', dir: 'rtl' },
] as const;

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function findSupportedLanguage(code: string): SupportedLanguage | undefined {
  const normalized = code.split('-')[0].toLowerCase();
  return SUPPORTED_LANGUAGES.find(lang => lang.code === normalized);
}

export function getLanguageDir(code: LanguageCode): 'ltr' | 'rtl' {
  return SUPPORTED_LANGUAGES.find(lang => lang.code === code)?.dir ?? 'ltr';
}
