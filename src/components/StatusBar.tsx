import { createMemo } from 'solid-js';
import { cursor } from '../editor/controller';
import { textStats } from '../lib/text-stats';
import { activeDocument } from '../state/documents';

export default function StatusBar() {
  const stats = createMemo(() => textStats(activeDocument()?.content ?? ''));

  return (
    <footer class="status-bar">
      <span>
        Ln {cursor().line}, Col {cursor().column}
      </span>
      <span class="spacer" />
      <span>{stats().words} words</span>
      <span>{stats().characters} characters</span>
      <span>{stats().lines} lines</span>
    </footer>
  );
}
