import { createMemo, createSignal, For } from 'solid-js';
import { createMarkdownRenderer } from '../lib/markdown';
import { activeDocument } from '../state/documents';
import { jumpToSource, previewPaneRef } from '../state/pane-link';

export default function Preview() {
  // Counts loaded code languages, so blocks rendered before theirs loaded re-render highlighted.
  const [languagesLoaded, setLanguagesLoaded] = createSignal(0);
  const render = createMarkdownRenderer({
    onLanguageLoad: (loaded) => void loaded.then(() => setLanguagesLoaded((count) => count + 1)),
  });
  const blocks = createMemo(() => {
    languagesLoaded();
    return render(activeDocument()?.content ?? '');
  });
  // Keyed by source text, so unchanged blocks keep their DOM nodes between edits.
  return (
    <section
      ref={previewPaneRef()}
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
