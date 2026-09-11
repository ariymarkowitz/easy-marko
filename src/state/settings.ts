import { createEffect, createStore, deep, snapshot } from 'solid-js';
import { readJSON, STORAGE_KEYS, writeText } from '../lib/storage';

export type ViewMode = 'source' | 'split' | 'preview';
export type PanelMode = Exclude<ViewMode, 'split'>;

export interface Settings {
  viewMode: ViewMode;
  /** The single-pane view that toggling split view off returns to. */
  lastPanel: PanelMode;
  sidebarOpen: boolean;
  sidebarWidth: number;
  /** Fraction of the workspace given to the source pane in split view. */
  splitRatio: number;
}

const defaults: Settings = {
  viewMode: 'split',
  lastPanel: 'source',
  sidebarOpen: true,
  sidebarWidth: 220,
  splitRatio: 0.5,
};

export const [settings, setSettings] = createStore<Settings>({
  ...defaults,
  ...readJSON<Partial<Settings>>(STORAGE_KEYS.settings, {}),
});

/**
 * Handles a click on a view button. Clicking the active single-pane view
 * opens split view; clicking split view while active returns to the last
 * single-pane view.
 */
export function selectViewMode(mode: ViewMode): void {
  setSettings((draft) => {
    if (mode === 'split') {
      draft.viewMode = draft.viewMode === 'split' ? draft.lastPanel : 'split';
    } else {
      draft.viewMode = draft.viewMode === mode ? 'split' : mode;
      draft.lastPanel = mode;
    }
  });
}

/** Persists settings whenever they change. Call once from the app root. */
export function useSettingsPersistence(): void {
  createEffect(
    () => JSON.stringify(snapshot(deep(settings))),
    (json) => writeText(STORAGE_KEYS.settings, json),
  );
}
