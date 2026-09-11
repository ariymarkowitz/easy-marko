import { createMemo, For } from 'solid-js';
import { createMarkdownRenderer } from '../lib/markdown';
import { activeDocument } from '../state/documents';

export default function Preview() {
  const render = createMarkdownRenderer();
  const blocks = createMemo(() => render(activeDocument()?.content ?? ''));

  // Keyed by source text, so unchanged blocks keep their DOM nodes between edits.
  return (
    <section class="pane preview-pane" aria-label="Preview">
      <article class="markdown">
        <For each={blocks()} keyed={(block) => block.key}>
          {(block) => (
            <div
              class="md-block"
              data-line={block().line}
              // eslint-disable-next-line solid/no-innerhtml -- markdown-it runs with raw HTML disabled
              innerHTML={block().html}
            />
          )}
        </For>
      </article>
    </section>
  );
}
