import type { IconNode } from 'lucide';
import Icon from './Icon';

export default function IconButton(props: {
  icon: IconNode;
  label: string;
  onClick: () => void;
  /** Set for toggle buttons; leave undefined for plain actions. */
  pressed?: boolean;
  disabled?: boolean;
  /** Set while the button's action is in progress; the icon spins. */
  busy?: boolean;
  /** The id of the element the button shows or hides. */
  controls?: string;
  /** Set for buttons that open a menu: whether it's open. */
  menuOpen?: boolean;
  class?: string;
}) {
  return (
    <button
      type="button"
      class={['icon-button', props.class]}
      title={props.label}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? 'true' : 'false'}
      aria-controls={props.controls}
      aria-haspopup={props.menuOpen === undefined ? undefined : 'menu'}
      aria-expanded={props.menuOpen === undefined ? undefined : props.menuOpen ? 'true' : 'false'}
      aria-busy={props.busy ? 'true' : undefined}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <Icon icon={props.icon} />
    </button>
  );
}
