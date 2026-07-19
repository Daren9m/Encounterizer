'use client';

import { storageLoad, storageSave } from './storage';

export type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'theme';
const THEME_EVENT = 'encounterizer-theme-change';

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

export function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return storageLoad<Theme | null>(
    THEME_STORAGE_KEY,
    null,
    (value): value is Theme | null => value === null || isTheme(value),
  ) ?? systemTheme();
}

export function setTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  storageSave(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function subscribeTheme(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const handleStorage = (event: StorageEvent) => {
    if (!event.key?.endsWith(`:${THEME_STORAGE_KEY}`)) return;
    const theme = getTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    onChange();
  };
  const handleSystemTheme = () => {
    const stored = storageLoad<Theme | null>(
      THEME_STORAGE_KEY,
      null,
      (value): value is Theme | null => value === null || isTheme(value),
    );
    if (stored !== null) return;
    const theme = systemTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    onChange();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', handleStorage);
  media.addEventListener('change', handleSystemTheme);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', handleStorage);
    media.removeEventListener('change', handleSystemTheme);
  };
}
