/** A vertical drag handle. Reports the pointer's clientX while dragging. */
export default function Resizer(props: { label: string; onResize: (clientX: number) => void }) {
  function startDrag(event: PointerEvent & { currentTarget: HTMLDivElement }) {
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => props.onResize(moveEvent.clientX);
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('lostpointercapture', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('lostpointercapture', stop);
  }

  return (
    <div
      class="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      onPointerDown={startDrag}
    />
  );
}
