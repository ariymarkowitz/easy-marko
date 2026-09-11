import { createEffect, createSignal, onSettled } from 'solid-js';
import { readText, removeKey, STORAGE_KEYS, writeText } from '../lib/storage';

export type Theme = 'light' | 'dark';

const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
const systemPreference = (): Theme => (darkMedia.matches ? 'dark' : 'light');

function readOverride(): Theme | undefined {
  const saved = readText(STORAGE_KEYS.theme);
  return saved === 'light' || saved === 'dark' ? saved : undefined;
}

const [systemTheme, setSystemTheme] = createSignal<Theme>(systemPreference());
const [override, setOverride] = createSignal<Theme | undefined>(readOverride());

export const theme = (): Theme => override() ?? systemTheme();

export function toggleTheme(): void {
  const next = theme() === 'dark' ? 'light' : 'dark';
  // Matching the system clears the override, so the app follows the system again.
  const value = next === systemTheme() ? undefined : next;
  setOverride(value);
  if (value) writeText(STORAGE_KEYS.theme, value);
  else removeKey(STORAGE_KEYS.theme);
}

/**
 * Tracks the system preference, mirrors the override onto
 * `<html data-theme>`, and eases colours over when the theme changes. Call
 * once from the app root. The inline script in Document.tsx applies the saved
 * override before first paint.
 */
export function useTheme(): void {
  onSettled(() => {
    const update = () => setSystemTheme(systemPreference());
    darkMedia.addEventListener('change', update);
    return () => darkMedia.removeEventListener('change', update);
  });

  createEffect(override, (value) => {
    if (value) document.documentElement.dataset.theme = value;
    else delete document.documentElement.dataset.theme;
  });

  // Covers switches from the toggle and from the system; see .theme-transition in base.css.
  // Longer than the slowest colour transition (0.25s) so none is cut short.
  createEffect(
    theme,
    () => {
      const root = document.documentElement;
      root.classList.add('theme-transition');
      const timer = setTimeout(() => root.classList.remove('theme-transition'), 300);
      return () => {
        clearTimeout(timer);
        root.classList.remove('theme-transition');
      };
    },
    { defer: true },
  );
}
