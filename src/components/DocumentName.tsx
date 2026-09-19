import { createSignal, flush, Show } from 'solid-js';
import {
  documentsState,
  type MarkdownDocument,
  moveDocument,
  renameDocument,
  selectDocument,
} from '../state/documents';

/**
 * A document's name in the sidebar. Clicking it selects the document;
 * double-clicking it or pressing F2 renames it in place. Enter or leaving the
 * input renames the document, and Escape cancels. Alt+Up and Alt+Down move
 * the document up and down the list, as dragging it does (see Sidebar).
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

  /** Moves the document `step` places along the list, keeping focus on its name. */
  function move(step: number) {
    const index = documentsState.documents.findIndex((doc) => doc.id === props.doc.id);
    moveDocument(props.doc.id, index + step);
    flush();
    // Moving the name in the page takes focus from it.
    button?.focus();
  }

  /** Ends the rename, returning focus to the name if `refocus`. */
  function stopEditing(refocus: boolean) {
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
          aria-keyshortcuts="F2 Alt+ArrowUp Alt+ArrowDown"
          onClick={() => selectDocument(props.doc.id)}
          onDblClick={startEditing}
          onKeyDown={(event) => {
            if (event.key === 'F2') {
              event.preventDefault();
              startEditing();
            } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
              event.preventDefault();
              move(event.key === 'ArrowUp' ? -1 : 1);
            }
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
          if (event.key === 'Escape') {
            event.preventDefault();
            stopEditing(true);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            // Empty names aren't allowed: keep editing.
            if (renameDocument(props.doc.id, event.currentTarget.value)) stopEditing(true);
            else setInvalid(true);
          }
        }}
        onBlur={(event) => {
          if (finished) return;
          // Focus has moved on, so an empty name is given up on rather than kept for editing.
          renameDocument(props.doc.id, event.currentTarget.value);
          stopEditing(false);
        }}
      />
    </Show>
  );
}
