export interface ResizerRange {
  min: number;
  max: number;
  /** How far an arrow key moves the resizer. */
  step: number;
  /** How far Shift+arrow moves it. */
  largeStep: number;
}

/**
 * A vertical drag handle that sizes the element before it, following the
 * ARIA window splitter pattern. Dragging reports the pointer's clientX;
 * Left/Right (Shift for larger steps), Home and End report a new value, which
 * the receiver clamps to the range.
 */
export default function Resizer(props: {
  label: string;
  /** The id of the element it sizes. */
  controls: string;
  value: number;
  range: ResizerRange;
  /** Read out instead of the raw value, e.g. a percentage. */
  valueText?: string;
  onDrag: (clientX: number) => void;
  onChange: (value: number) => void;
}) {
  function keyValue(event: KeyboardEvent): number | undefined {
    const { min, max, step, largeStep } = props.range;
    const distance = event.shiftKey ? largeStep : step;
    switch (event.key) {
      case 'ArrowLeft':
        return props.value - distance;
      case 'ArrowRight':
        return props.value + distance;
      case 'Home':
        return min;
      case 'End':
        return max;
    }
    return undefined;
  }

  return (
    <div
      class="resizer"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-label={props.label}
      aria-controls={props.controls}
      aria-valuenow={props.value}
      aria-valuemin={props.range.min}
      aria-valuemax={props.range.max}
      aria-valuetext={props.valueText}
      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) props.onDrag(event.clientX);
      }}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const value = keyValue(event);
        if (value === undefined) return;
        event.preventDefault();
        props.onChange(value);
      }}
    />
  );
}
