// Renders Lucide icon data. The official lucide-solid package only supports
// Solid 1.x, so this uses the framework-agnostic `lucide` package instead.

import type { IconNode } from 'lucide';
import { iconAttributes, iconMarkup } from '../lib/icon-markup';

export default function Icon(props: { icon: IconNode; class?: string }) {
  return (
    <svg
      class={['icon', props.class]}
      {...iconAttributes}
      // eslint-disable-next-line solid/no-innerhtml -- markup is built from Lucide's bundled icon data
      innerHTML={iconMarkup(props.icon)}
    />
  );
}
