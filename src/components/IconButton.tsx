import Icon, { type IconNode } from './Icon';

export default function IconButton(props: {
  icon: IconNode;
  label: string;
  onClick: () => void;
  /** Set for toggle buttons; leave undefined for plain actions. */
  pressed?: boolean;
  disabled?: boolean;
  class?: string;
}) {
  return (
    <button
      type="button"
      class={['icon-button', props.class]}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.pressed === undefined ? undefined : props.pressed ? 'true' : 'false'}
      disabled={props.disabled}
      onClick={() => props.onClick()}
    >
      <Icon icon={props.icon} />
    </button>
  );
}
