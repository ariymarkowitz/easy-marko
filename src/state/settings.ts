import { createEffect, createStore, deep, snapshot } from 'solid-js';
import { clamp } from '../lib/clamp';
import { readJSON, STORAGE_KEYS, writeText } from '../lib/storage';

export type ViewMode = 'source' | 'split' | 'preview';
export type PanelMode = Exclude<ViewMode, 'split'>;

/**
 * The user's layout choices, as they apply to a wide window. state/layout.ts
 * derives what's shown from them (narrow windows have no split view, for
 * example) and has the actions behind the layout buttons.
 */
export interface Settings {
  viewMode: ViewMode;
  /** The single-pane view that toggling split view off returns to, and that narrow windows show instead of split view. */
  lastPanel: PanelMode;
  sidebarOpen: boolean;
  sidebarWidth: number;
  /** Fraction of the workspace given to the source pane in split view. */
  splitRatio: number;
  /** Keep the source and preview panes scrolled to the same place in split view. */
  syncScroll: boolean;
}

/** The sidebar width's limits, in pixels, and its keyboard resize steps. */
export const SIDEBAR_WIDTH = { min: 160, max: 480, step: 10, largeStep: 50 } as const;

/** The split ratio's limits and its keyboard resize steps. */
export const SPLIT_RATIO = { min: 0.2, max: 0.8, step: 0.02, largeStep: 0.1 } as const;

const defaults: Settings = {
  viewMode: 'split',
  lastPanel: 'source',
  sidebarOpen: true,
  sidebarWidth: 220,
  splitRatio: 0.5,
  syncScroll: true,
};

const [settings, setSettings] = createStore<Settings>({
  ...defaults,
  ...readJSON<Partial<Settings>>(STORAGE_KEYS.settings, {}),
});

export { settings };

export function setViewMode(mode: ViewMode): void {
  setSettings((draft) => {
    draft.viewMode = mode;
  });
}

export function setLastPanel(mode: PanelMode): void {
  setSettings((draft) => {
    draft.lastPanel = mode;
  });
}

export function toggleSyncScroll(): void {
  setSettings((draft) => {
    draft.syncScroll = !draft.syncScroll;
  });
}

export function setSidebarOpen(open: boolean): void {
  setSettings((draft) => {
    draft.sidebarOpen = open;
  });
}

export function setSidebarWidth(width: number): void {
  setSettings((draft) => {
    draft.sidebarWidth = Math.round(clamp(width, SIDEBAR_WIDTH.min, SIDEBAR_WIDTH.max));
  });
}

export function setSplitRatio(ratio: number): void {
  setSettings((draft) => {
    // Rounded so keyboard steps don't pile up floating-point error (0.43999…).
    draft.splitRatio = Math.round(clamp(ratio, SPLIT_RATIO.min, SPLIT_RATIO.max) * 10000) / 10000;
  });
}

/** Persists settings whenever they change. Call once from the app root. */
export function useSettingsPersistence(): void {
  createEffect(
    () => JSON.stringify(snapshot(deep(settings))),
    (json) => {
      writeText(STORAGE_KEYS.settings, json);
    },
  );
}
