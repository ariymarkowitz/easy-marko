import { Show } from 'solid-js';
import { viewMode } from '../state/layout';
import { setSplitRatio, settings, SPLIT_RATIO } from '../state/settings';
import Editor from './Editor';
import Preview from './Preview';
import Resizer from './Resizer';

export default function Workspace() {
  let workspace!: HTMLElement;

  function resize(clientX: number) {
    const bounds = workspace.getBoundingClientRect();
    setSplitRatio((clientX - bounds.left) / bounds.width);
  }

  // The editor stays mounted in preview mode so its undo history survives;
  // the preview unmounts in source mode so it doesn't render while hidden.
  return (
    <main
      ref={(element) => (workspace = element)}
      class="workspace"
      data-view={viewMode()}
      style={{ '--split': `${settings.splitRatio * 100}%` }}
    >
      <section
        id="source-pane"
        class="pane source-pane"
        aria-label="Source"
        hidden={viewMode() === 'preview'}
      >
        <Editor />
      </section>
      <Show when={viewMode() === 'split'}>
        <Resizer
          label="Resize panes"
          controls="source-pane"
          value={settings.splitRatio}
          range={SPLIT_RATIO}
          valueText={`${Math.round(settings.splitRatio * 100)}%`}
          onDrag={resize}
          onChange={setSplitRatio}
        />
      </Show>
      <Show when={viewMode() !== 'source'}>
        <Preview />
      </Show>
    </main>
  );
}
