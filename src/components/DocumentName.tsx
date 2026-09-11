import { createSignal, flush, Show } from 'solid-js';
import { type MarkdownDocument, renameDocument, selectDocument } from '../state/documents';

/**
 * A document's name in the sidebar. Clicking it selects the document;
 * double-clicking it or pressing F2 renames it in place. Enter or leaving the
 * input renames the document, and Escape cancels.
 */
export default function DocumentName(props: { doc: MarkdownDocument; active: boolean }) {
  const [editing, setEditing] = createSignal(false);
  const [invalid, setInvalid] = createSignal(false);
  let button: HTMLButtonElement | undefined;
  let input: HTMLInputElement | undefined;
  /** Whether the current rename has finished, so leaving the input afterwards is ignored. */
  let finished = true;

  function startEditing() {
    finished = false;
    setInvalid(false);
    setEditing(true);
    flush();
    if (!input) return;
    const name = props.doc.name;
    input.value = name;
    input.focus();
    // Select the name without its extension, which people rarely change.
    const extension = name.lastIndexOf('.');
    input.setSelectionRange(0, extension > 0 ? extension : name.length);
  }

  /** Ends the rename, saving the name if `save`. Returns focus to the name if `refocus`. */
  function finish(save: boolean, refocus: boolean) {
    if (finished || !input) return;
    if (save && !renameDocument(props.doc.id, input.value)) {
      // Empty names aren't allowed: keep editing, or give up when focus has moved on.
      if (refocus) {
        setInvalid(true);
        return;
      }
    }
    finished = true;
    setEditing(false);
    flush();
    if (refocus) button?.focus();
  }

  return (
    <Show
      when={editing()}
      fallback={
        <button
          ref={(element) => (button = element)}
          type="button"
          class="document-name"
          aria-current={props.active ? 'true' : undefined}
          aria-keyshortcuts="F2"
          onClick={() => selectDocument(props.doc.id)}
          onDblClick={startEditing}
          onKeyDown={(event) => {
            if (event.key !== 'F2') return;
            event.preventDefault();
            startEditing();
          }}
        >
          {props.doc.name}
        </button>
      }
    >
      <input
        ref={(element) => (input = element)}
        class="document-name document-rename"
        aria-label={`Rename ${props.doc.name}`}
        aria-invalid={invalid() ? 'true' : undefined}
        spellcheck="false"
        onInput={() => setInvalid(false)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          event.preventDefault();
          finish(event.key === 'Enter', true);
        }}
        onBlur={() => finish(true, false)}
      />
    </Show>
  );
}
