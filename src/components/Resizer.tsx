/** A vertical drag handle. Reports the pointer's clientX while dragging. */
export default function Resizer(props: { label: string; onResize: (clientX: number) => void }) {
  return (
    <div
      class="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) props.onResize(event.clientX);
      }}
    />
  );
}
