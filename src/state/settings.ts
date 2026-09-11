import { createEffect, createStore, deep, snapshot } from 'solid-js';
import { readJSON, STORAGE_KEYS, writeText } from '../lib/storage';

export type ViewMode = 'source' | 'split' | 'preview';

export interface Settings {
  viewMode: ViewMode;
  sidebarOpen: boolean;
  sidebarWidth: number;
  /** Fraction of the workspace given to the source pane in split view. */
  splitRatio: number;
}

const defaults: Settings = {
  viewMode: 'split',
  sidebarOpen: true,
  sidebarWidth: 220,
  splitRatio: 0.5,
};

export const [settings, setSettings] = createStore<Settings>({
  ...defaults,
  ...readJSON<Partial<Settings>>(STORAGE_KEYS.settings, {}),
});

/** Persists settings whenever they change. Call once from the app root. */
export function useSettingsPersistence(): void {
  createEffect(
    () => JSON.stringify(snapshot(deep(settings))),
    (json) => writeText(STORAGE_KEYS.settings, json),
  );
}
