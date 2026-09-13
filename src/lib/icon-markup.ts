// Lucide icon data as SVG markup, for components and rendered HTML alike.

import type { IconNode } from 'lucide';

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

/** An icon as a complete `<svg>` element with Lucide's stroke attributes, for rendered HTML. */
export function iconSvg(node: IconNode, className: string): string {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup(node)}</svg>`;
}
