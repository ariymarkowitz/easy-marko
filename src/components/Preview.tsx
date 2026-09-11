import { createMemo, For, onSettled } from 'solid-js';
import { createMarkdownRenderer } from '../lib/markdown';
import { activeDocument } from '../state/documents';
import { attachPreview, jumpToSource } from '../state/pane-link';

export default function Preview() {
  const render = createMarkdownRenderer();
  const blocks = createMemo(() => render(activeDocument()?.content ?? ''));
  let pane!: HTMLElement;

  onSettled(() => attachPreview(pane));

  // Keyed by source text, so unchanged blocks keep their DOM nodes between edits.
  return (
    <section
      ref={(element) => (pane = element)}
      class="pane preview-pane"
      aria-label="Preview"
      onClick={jumpToSource}
    >
      <article class="markdown">
        <For each={blocks()} keyed={(block) => block.key}>
          {(block) => (
            <div
              class="md-block"
              data-line={block().line}
              data-end-line={block().endLine}
              // eslint-disable-next-line solid/no-innerhtml -- the renderer sanitises every block
              innerHTML={block().html}
            />
          )}
        </For>
      </article>
    </section>
  );
}
