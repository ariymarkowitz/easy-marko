import { createSignal } from 'solid-js';

/**
 * In-app notices, shown as a stack in the corner of the window by
 * components/Notices.tsx.
 *
 *   const dismiss = showNotice("Couldn't open the file.", { tone: 'error' });
 *   showNotice('A new version is available.', {
 *     timeout: 0,
 *     actions: [{ label: 'Reload', run: reload }],
 *   });
 *
 * Info notices close on their own after `timeout` ms (paused while hovered or
 * focused); errors, and notices with `timeout: 0`, stay until dismissed.
 * Every notice has a dismiss button, and clicking an action also dismisses it.
 */

export type NoticeTone = 'info' | 'error';

export interface NoticeAction {
  label: string;
  run: () => void;
}

export interface NoticeOptions {
  /** 'info' (the default) is announced politely; 'error' is announced straight away. */
  tone?: NoticeTone;
  actions?: NoticeAction[];
  /** Milliseconds before the notice closes on its own; 0 keeps it open. Errors default to 0. */
  timeout?: number;
}

export interface Notice {
  id: number;
  message: string;
  tone: NoticeTone;
  actions: NoticeAction[];
  timeout: number;
}

export const INFO_NOTICE_TIMEOUT = 6000;

const [notices, setNotices] = createSignal<readonly Notice[]>([]);

export { notices };

let nextId = 1;

/** Shows a notice below any already shown. Returns a function that dismisses it. */
export function showNotice(message: string, options: NoticeOptions = {}): () => void {
  const tone = options.tone ?? 'info';
  const notice: Notice = {
    id: nextId++,
    message,
    tone,
    actions: options.actions ?? [],
    timeout: options.timeout ?? (tone === 'error' ? 0 : INFO_NOTICE_TIMEOUT),
  };
  setNotices((list) => [...list, notice]);
  return () => dismissNotice(notice.id);
}

export function dismissNotice(id: number): void {
  setNotices((list) => list.filter((notice) => notice.id !== id));
}

/** A caught error's message, for showing in a notice. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
