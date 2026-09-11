// Renders Lucide icon data. The official lucide-solid package only supports
// Solid 1.x, so this uses the framework-agnostic `lucide` package instead.

export type IconNode = [tag: string, attrs: Record<string, string | number | undefined>][];

function toMarkup(node: IconNode): string {
  return node
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .filter(([, value]) => value !== undefined)
        .map(([name, value]) => `${name}="${value}"`)
        .join(' ');
      return `<${tag} ${attributes}/>`;
    })
    .join('');
}

export default function Icon(props: { icon: IconNode; size?: number }) {
  return (
    <svg
      class="icon"
      xmlns="http://www.w3.org/2000/svg"
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      // eslint-disable-next-line solid/no-innerhtml -- markup is built from Lucide's bundled icon data
      innerHTML={toMarkup(props.icon)}
    />
  );
}
