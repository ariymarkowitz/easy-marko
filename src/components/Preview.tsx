import { createMemo, createSignal, For } from 'solid-js';
import { createMarkdownRenderer } from '../lib/markdown';
import { activeDocument } from '../state/documents';
import { jumpToSource, previewPaneRef } from '../state/pane-link';

/** The element a fragment (`#id`, already decoded) points to: an element with that id, or an anchor with that name. */
function fragmentTarget(root: HTMLElement, fragment: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>('[id], a[name]')].find(
    (element) => element.id === fragment || element.getAttribute('name') === fragment,
  );
}

/**
 * Follows a link to a heading or footnote by scrolling the preview, instead of
 * changing the app's URL. Like a browser, `#` and `#top` go to the top when
 * nothing has that id.
 */
function followFragmentLink(event: MouseEvent & { currentTarget: HTMLElement }): void {
  const link = (event.target as Element).closest('a[href^="#"]');
  if (event.defaultPrevented || !link) return;
  event.preventDefault();
  const pane = event.currentTarget;
  let fragment = link.getAttribute('href')!.slice(1);
  try {
    fragment = decodeURIComponent(fragment);
  } catch {
    // Keep a malformed fragment as written.
  }
  const target = fragmentTarget(pane, fragment);
  if (target) {
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    pane.scrollTop += target.getBoundingClientRect().top - pane.getBoundingClientRect().top - margin;
  } else if (fragment === '' || fragment.toLowerCase() === 'top') {
    pane.scrollTop = 0;
  }
}

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
      id="preview-pane"
      class="pane preview-pane"
      aria-label="Preview"
      onClick={(event) => {
        jumpToSource(event);
        followFragmentLink(event);
      }}
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
