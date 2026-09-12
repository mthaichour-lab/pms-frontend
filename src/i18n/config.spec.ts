import {describe, expect, it} from 'vitest';
import {directionFor, localeCookie, resolveLocale} from './config';
import {getMessages} from './messages';

describe('i18n configuration', () => {
  it('accepts supported locales and safely falls back for untrusted cookie values', () => {
    expect(resolveLocale('ar')).toBe('ar');
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('../admin')).toBe('fr');
    expect(resolveLocale(undefined)).toBe('fr');
  });
  it('enables RTL only for Arabic', () => {
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('fr')).toBe('ltr');
  });
  it('creates a non-sensitive, same-site persistent cookie', () => {
    expect(localeCookie('en')).toBe('pms_locale=en; Path=/; Max-Age=31536000; SameSite=Lax');
    expect(localeCookie('ar; Secure=false')).toBe('pms_locale=fr; Path=/; Max-Age=31536000; SameSite=Lax');
  });
  it('provides a complete catalog for every locale', () => {
    expect(Object.keys(getMessages('ar'))).toEqual(Object.keys(getMessages('fr')));
    expect(getMessages('en').dashboard).toBe('Dashboard');
  });
});
