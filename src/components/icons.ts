// Lucide icons adjusted to sit well beside the others, for components that share them.

import { PenLine, type IconNode } from 'lucide';

/** `icon` scaled about the centre of its 24px box, keeping its stroke width. */
function scaleIcon(icon: IconNode, scale: number): IconNode {
  const transform = `translate(12 12) scale(${scale}) translate(-12 -12)`;
  return icon.map(([tag, attrs]) => [tag, { ...attrs, transform, 'stroke-width': 2 / scale }]);
}

/** The source view's icon. PenLine fills more of its box than the other view icons, so it's drawn smaller. */
export const SourceIcon = scaleIcon(PenLine, 0.85);
