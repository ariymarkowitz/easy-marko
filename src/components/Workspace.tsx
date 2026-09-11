import { Show } from 'solid-js';
import { clamp } from '../lib/clamp';
import { setSettings, settings } from '../state/settings';
import Editor from './Editor';
import Preview from './Preview';
import Resizer from './Resizer';

export default function Workspace() {
  let workspace: HTMLElement | undefined;

  function resize(clientX: number) {
    if (!workspace) return;
    const bounds = workspace.getBoundingClientRect();
    const ratio = clamp((clientX - bounds.left) / bounds.width, 0.2, 0.8);
    setSettings((draft) => {
      draft.splitRatio = ratio;
    });
  }

  // The editor stays mounted in preview mode so its undo history survives;
  // the preview unmounts in source mode so it doesn't render while hidden.
  return (
    <main
      ref={(element) => (workspace = element)}
      class="workspace"
      data-view={settings.viewMode}
      style={{ '--split': `${settings.splitRatio * 100}%` }}
    >
      <section class="pane source-pane" aria-label="Source" hidden={settings.viewMode === 'preview'}>
        <Editor />
      </section>
      <Show when={settings.viewMode === 'split'}>
        <Resizer label="Resize panes" onResize={resize} />
      </Show>
      <Show when={settings.viewMode !== 'source'}>
        <Preview />
      </Show>
    </main>
  );
}
