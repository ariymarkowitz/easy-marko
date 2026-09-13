import { Show } from 'solid-js';
import { startSplitDrag, viewMode } from '../state/layout';
import { setSplitRatio, settings, SPLIT_RATIO } from '../state/settings';
import Editor from './Editor';
import PanelEdge, { edgeActions } from './PanelEdge';
import Preview from './Preview';
import Resizer from './Resizer';

export default function Workspace() {
  // The editor stays mounted in preview mode so its undo history survives;
  // the preview unmounts in source mode so it doesn't render while hidden.
  return (
    <main
      id="workspace"
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
        <PanelEdge before={[edgeActions.hideSource]} after={[edgeActions.hidePreview]}>
          <Resizer
            label="Resize panes"
            controls="source-pane"
            value={settings.splitRatio}
            range={SPLIT_RATIO}
            valueText={`${Math.round(settings.splitRatio * 100)}%`}
            onDragStart={startSplitDrag}
            onChange={setSplitRatio}
          />
        </PanelEdge>
      </Show>
      <Show
        when={viewMode() !== 'source'}
        fallback={<PanelEdge position="end" before={[edgeActions.showPreview]} />}
      >
        <Preview />
      </Show>
    </main>
  );
}
