import { flush } from 'solid-js';
import { cleanup, fireEvent, render, screen, within } from '@solidjs/testing-library';
import type { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import { editorView } from './editor/controller';
import { activeDocument, closeDocument, documentsState, newDocument } from './state/documents';

// Module state is shared with other test files, so every test starts from a
// single empty document. Closing the last document opens a new one.
beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  // Ids first: closing a document removes it from the array being iterated.
  for (const id of documentsState.documents.map((doc) => doc.id)) {
    closeDocument(id);
    flush();
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderApp(): EditorView {
  render(() => <App />);
  flush();
  const view = editorView();
  if (!view) throw new Error('The editor did not attach');
  return view;
}

/**
 * Types `text` at the cursor. jsdom can't drive contenteditable input, so
 * this dispatches the transaction CodeMirror's input handling would.
 */
function type(view: EditorView, text: string): void {
  view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.type' });
  flush();
}

function click(element: HTMLElement): void {
  fireEvent.click(element);
  flush();
}

/** Clicks a view button unless its view is already showing. */
function showView(name: 'Source' | 'Side by side' | 'Preview'): void {
  const button = screen.getByRole('button', { name });
  if (button.getAttribute('aria-pressed') !== 'true') click(button);
}

const preview = () => screen.queryByRole('region', { name: 'Preview' });
// Hidden elements have no accessible name, so find the source pane by its label.
const sourcePane = () => screen.getByLabelText('Source', { selector: 'section' });
const editorText = () => screen.getByRole('textbox', { hidden: true });
const documentButtons = () =>
  within(screen.getByRole('complementary', { name: 'Documents' })).getAllByRole('button', {
    name: 'Untitled.md',
  });

describe('editing', () => {
  test('updates the active document, the preview and the status bar', () => {
    const view = renderApp();
    showView('Side by side');

    type(view, '# Hello\n\nSome *text*');
    expect(activeDocument()?.content).toBe('# Hello\n\nSome *text*');
    expect(within(preview()!).getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
    expect(preview()).toHaveTextContent('Some text');
    const status = screen.getByRole('contentinfo');
    expect(status).toHaveTextContent('3 words');
    expect(status).toHaveTextContent('20 characters');
    expect(status).toHaveTextContent('3 lines');
    expect(status).toHaveTextContent('Ln 3, Col 12');

    type(view, ' and more');
    expect(preview()).toHaveTextContent('Some text and more');
    expect(status).toHaveTextContent('5 words');
    expect(status).toHaveTextContent('Ln 3, Col 21');
  });
});

describe('switching documents', () => {
  test('swaps the editor content and the preview', () => {
    newDocument();
    flush();
    const view = renderApp();
    showView('Side by side');
    const [first, second] = documentButtons();

    type(view, 'Second');
    click(first);
    expect(editorText()).toHaveTextContent(/^$/);
    expect(preview()).toHaveTextContent(/^$/);

    type(view, 'First');
    click(second);
    expect(editorText()).toHaveTextContent('Second');
    expect(preview()).toHaveTextContent('Second');
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Ln 1, Col 7');
    click(first);
    expect(editorText()).toHaveTextContent('First');
  });

  test('keeps a separate undo history for each document', () => {
    newDocument();
    flush();
    const view = renderApp();
    const [first, second] = documentButtons();
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });

    type(view, 'Second');
    click(first);
    expect(undo).toBeDisabled();
    type(view, 'First');

    click(second);
    click(undo);
    expect(view.state.doc.toString()).toBe('');
    expect(undo).toBeDisabled();
    expect(redo).toBeEnabled();

    click(first);
    expect(view.state.doc.toString()).toBe('First');
    expect(redo).toBeDisabled();
    click(undo);
    expect(view.state.doc.toString()).toBe('');
    expect(documentsState.documents.map((doc) => doc.content)).toEqual(['', '']);

    click(second);
    click(redo);
    expect(activeDocument()?.content).toBe('Second');
  });
});

describe('view modes', () => {
  test('mount the preview only when it is shown', () => {
    const view = renderApp();

    showView('Source');
    expect(preview()).toBeNull();
    expect(sourcePane()).toBeVisible();
    type(view, 'Written in source view');

    showView('Preview');
    expect(preview()).toHaveTextContent('Written in source view');
    expect(sourcePane()).not.toBeVisible();

    showView('Side by side');
    expect(preview()).toHaveTextContent('Written in source view');
    expect(sourcePane()).toBeVisible();
    expect(screen.getByRole('separator', { name: 'Resize panes' })).toBeInTheDocument();

    showView('Source');
    expect(preview()).toBeNull();
    expect(screen.queryByRole('separator', { name: 'Resize panes' })).toBeNull();
  });

  test('keep the editor and its history while the source is hidden', () => {
    const view = renderApp();
    showView('Source');
    type(view, 'Draft');

    showView('Preview');
    expect(editorView()).toBe(view);
    showView('Source');
    click(screen.getByRole('button', { name: 'Undo' }));
    expect(activeDocument()?.content).toBe('');
  });
});

describe('fragment links in the preview', () => {
  test('scroll the preview to their target without changing the URL', () => {
    const view = renderApp();
    showView('Preview');
    type(view, '[Go](#details) [Missing](#nowhere)\n\n# Details\n\nText[^1]\n\n[^1]: Note');
    const pane = preview()!;
    // jsdom does no layout or scrolling.
    let scrollTop = 0;
    Object.defineProperty(pane, 'scrollTop', { get: () => scrollTop, set: (value: number) => (scrollTop = value) });
    const heading = within(pane).getByRole('heading', { name: 'Details' });
    vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 300, 0, 0));

    const hash = location.hash;
    const link = within(pane).getByRole('link', { name: 'Go' });
    expect(fireEvent.click(link)).toBe(false);
    expect(scrollTop).toBe(300);
    expect(location.hash).toBe(hash);

    fireEvent.click(within(pane).getByRole('link', { name: 'Missing' }));
    expect(scrollTop).toBe(300);

    const note = pane.querySelector<HTMLElement>('#fn-1')!;
    vi.spyOn(note, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 0, 0));
    fireEvent.click(within(pane).getByRole('link', { name: '1' }));
    expect(scrollTop).toBe(400);
  });
});
