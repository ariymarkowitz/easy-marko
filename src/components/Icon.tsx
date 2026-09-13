// Renders Lucide icon data. The official lucide-solid package only supports
// Solid 1.x, so this uses the framework-agnostic `lucide` package instead.

import type { IconNode } from 'lucide';
import { iconMarkup } from '../lib/icon-markup';

export default function Icon(props: { icon: IconNode }) {
  return (
    <svg
      class="icon"
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      // eslint-disable-next-line solid/no-innerhtml -- markup is built from Lucide's bundled icon data
      innerHTML={iconMarkup(props.icon)}
    />
  );
}
