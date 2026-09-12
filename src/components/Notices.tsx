import { createEffect, createSignal, For } from 'solid-js';
import { CircleAlert, Info, X } from 'lucide';
import { dismissNotice, type Notice, notices } from '../state/notices';
import Icon from './Icon';
import IconButton from './IconButton';

/** The stack of notices from state/notices.ts. Render once from the app root. */
export default function Notices() {
  return (
    <div class="notices">
      <For each={notices()}>{(notice) => <NoticeItem notice={notice} />}</For>
    </div>
  );
}

function NoticeItem(props: { notice: Notice }) {
  const dismiss = () => dismissNotice(props.notice.id);

  // The auto-close timer is paused while the pointer is over the notice or
  // focus is inside it, so it doesn't close while someone is reading or
  // reaching for a button. It starts again from the full timeout.
  const [hovered, setHovered] = createSignal(false);
  const [focused, setFocused] = createSignal(false);
  createEffect(
    () => (hovered() || focused() ? 0 : props.notice.timeout),
    (timeout) => {
      if (timeout <= 0) return;
      const timer = setTimeout(dismiss, timeout);
      return () => clearTimeout(timer);
    },
    { name: 'noticeTimeout' },
  );

  return (
    <div
      class={['notice', `notice-${props.notice.tone}`]}
      role={props.notice.tone === 'error' ? 'alert' : 'status'}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusIn={() => setFocused(true)}
      onFocusOut={(event) => setFocused(event.currentTarget.contains(event.relatedTarget as Node | null))}
      onKeyDown={(event) => {
        if (event.key === 'Escape') dismiss();
      }}
    >
      <span class="notice-icon">
        <Icon icon={props.notice.tone === 'error' ? CircleAlert : Info} />
      </span>
      <p class="notice-message">{props.notice.message}</p>
      <For each={props.notice.actions}>
        {(action) => (
          <button
            type="button"
            class="notice-action"
            onClick={() => {
              dismiss();
              action.run();
            }}
          >
            {action.label}
          </button>
        )}
      </For>
      <IconButton icon={X} label="Dismiss" class="notice-dismiss" onClick={dismiss} />
    </div>
  );
}
