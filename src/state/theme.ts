import { createEffect, createSignal } from 'solid-js';
import { readText, removeKey, STORAGE_KEYS, writeText } from '../lib/storage';
import { delay } from '../lib/timers';
import { createMediaQuery } from '../reactive';

export type Theme = 'light' | 'dark';

const prefersDark = createMediaQuery('(prefers-color-scheme: dark)');
const systemTheme = (): Theme => (prefersDark() ? 'dark' : 'light');

function readOverride(): Theme | undefined {
  const saved = readText(STORAGE_KEYS.theme);
  return saved === 'light' || saved === 'dark' ? saved : undefined;
}

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
 * Mirrors the override onto `<html data-theme>`, colours the browser UI (the
 * theme-color meta tag) to match the theme, and eases colours over when the
 * theme changes. Call once from the app root. The inline script in
 * Document.tsx does the first two before first paint.
 */
export function useTheme(): void {
  createEffect(override, (value) => {
    if (value) document.documentElement.dataset.theme = value;
    else delete document.documentElement.dataset.theme;
  });

  // The meta tag's media attribute could only follow the system, so set its colour directly.
  createEffect(theme, (value) => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const color = meta?.dataset[value];
    if (meta && color) meta.content = color;
  });

  // Covers switches from the toggle and from the system; see .theme-transition in base.css.
  // Longer than the slowest colour transition (0.25s) so none is cut short.
  createEffect(
    theme,
    () => {
      const root = document.documentElement;
      root.classList.add('theme-transition');
      const cancel = delay(() => root.classList.remove('theme-transition'), 300);
      return () => {
        cancel();
        root.classList.remove('theme-transition');
      };
    },
    { defer: true },
  );
}
