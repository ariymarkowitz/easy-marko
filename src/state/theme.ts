import { createEffect, createSignal, onSettled } from 'solid-js';
import { readText, removeKey, STORAGE_KEYS, writeText } from '../lib/storage';

export type Theme = 'light' | 'dark';

const darkQuery = '(prefers-color-scheme: dark)';

function readOverride(): Theme | undefined {
  const saved = readText(STORAGE_KEYS.theme);
  return saved === 'light' || saved === 'dark' ? saved : undefined;
}

const [systemTheme, setSystemTheme] = createSignal<Theme>(
  window.matchMedia(darkQuery).matches ? 'dark' : 'light',
);
const [override, setOverride] = createSignal<Theme | undefined>(readOverride());

export const theme = (): Theme => override() ?? systemTheme();

/**
 * The override to store after toggling away from `current`. Returns undefined
 * when the new theme matches the system, so the app follows the system again.
 */
export function nextOverride(current: Theme, system: Theme): Theme | undefined {
  const next = current === 'dark' ? 'light' : 'dark';
  return next === system ? undefined : next;
}

export function toggleTheme(): void {
  const next = nextOverride(theme(), systemTheme());
  setOverride(next);
  if (next) writeText(STORAGE_KEYS.theme, next);
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
    const media = window.matchMedia(darkQuery);
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
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
