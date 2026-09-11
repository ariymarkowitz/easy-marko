import { For, onSettled } from 'solid-js';
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovered = false;
  let focused = false;
  const updateTimer = () => {
    clearTimeout(timer);
    timer = undefined;
    if (props.notice.timeout > 0 && !hovered && !focused) {
      timer = setTimeout(dismiss, props.notice.timeout);
    }
  };
  onSettled(() => {
    updateTimer();
    return () => clearTimeout(timer);
  });

  return (
    <div
      class={['notice', `notice-${props.notice.tone}`]}
      role={props.notice.tone === 'error' ? 'alert' : 'status'}
      onPointerEnter={() => {
        hovered = true;
        updateTimer();
      }}
      onPointerLeave={() => {
        hovered = false;
        updateTimer();
      }}
      onFocusIn={() => {
        focused = true;
        updateTimer();
      }}
      onFocusOut={(event) => {
        focused = event.currentTarget.contains(event.relatedTarget as Node | null);
        updateTimer();
      }}
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
