// Lucide icon data as SVG markup, for components and rendered HTML alike.

import type { IconNode } from 'lucide';

/** The attributes of a Lucide icon's `<svg>`. Its size comes from the `.icon` class in base.css. */
export const iconAttributes = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
} as const;

const svgAttributes = Object.entries(iconAttributes)
  .map(([name, value]) => `${name}="${value}"`)
  .join(' ');

/** The markup of an icon's child elements, to go inside a 24×24 `<svg>`. */
export function iconMarkup(node: IconNode): string {
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

/** An icon as a complete `<svg>` element, for rendered HTML. */
export function iconSvg(node: IconNode, className: string): string {
  return `<svg class="${className}" ${svgAttributes}>${iconMarkup(node)}</svg>`;
}
