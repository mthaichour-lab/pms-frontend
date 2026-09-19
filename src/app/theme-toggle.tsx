'use client';

import {useEffect, useState} from 'react';

type Theme = 'dark' | 'light';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('pms-theme', next);
    } catch {
      // The selected theme still applies for the current tab when storage is unavailable.
    }
    setTheme(next);
  }

  const target = theme === 'dark' ? 'clair' : 'sombre';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Activer le mode ${target}`}
      aria-pressed={theme === 'light'}
      title={`Activer le mode ${target}`}
    >
      <span className="theme-toggle__indicator" aria-hidden />
      <span>Mode {target}</span>
    </button>
  );
}
