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
