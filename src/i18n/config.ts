export const supportedLocales = ['fr', 'ar', 'en'] as const;
export type Locale = (typeof supportedLocales)[number];

export const localeCookieName = 'pms_locale';
export const defaultLocale: Locale = 'fr';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && supportedLocales.includes(value as Locale);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export function directionFor(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function localeCookie(locale: unknown): string {
  return `${localeCookieName}=${resolveLocale(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
