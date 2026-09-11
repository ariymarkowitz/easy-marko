import { For } from 'solid-js';
import {
  Code,
  Columns2,
  Eye,
  FilePlus,
  FolderOpen,
  Link2,
  Moon,
  PanelLeft,
  Redo2,
  Save,
  Search,
  Sun,
  Undo2,
  type IconNode,
} from 'lucide';
import { canRedo, canUndo, editorCommands } from '../editor/controller';
import { newDocument, openDocument, saveActiveDocument } from '../state/documents';
import {
  selectViewMode,
  settings,
  toggleSidebar,
  toggleSyncScroll,
  type ViewMode,
} from '../state/settings';
import { theme, toggleTheme } from '../state/theme';
import IconButton from './IconButton';

const viewModes: { mode: ViewMode; label: string; icon: IconNode }[] = [
  { mode: 'source', label: 'Source', icon: Code },
  { mode: 'split', label: 'Side by side', icon: Columns2 },
  { mode: 'preview', label: 'Preview', icon: Eye },
];

export default function Toolbar() {
  return (
    <header class="toolbar">
      <IconButton
        icon={PanelLeft}
        label="Toggle sidebar"
        pressed={settings.sidebarOpen}
        onClick={toggleSidebar}
      />
      <div class="toolbar-divider" />
      <IconButton icon={FilePlus} label="New document" onClick={newDocument} />
      <IconButton icon={FolderOpen} label="Open (Mod-O)" onClick={openDocument} />
      <IconButton icon={Save} label="Save (Mod-S)" onClick={saveActiveDocument} />
      <div class="toolbar-divider" />
      <IconButton icon={Undo2} label="Undo" disabled={!canUndo()} onClick={editorCommands.undo} />
      <IconButton icon={Redo2} label="Redo" disabled={!canRedo()} onClick={editorCommands.redo} />
      <IconButton icon={Search} label="Find and replace" onClick={editorCommands.find} />

      <span class="spacer" />

      <IconButton
        icon={Link2}
        label="Sync scrolling in side-by-side view"
        pressed={settings.syncScroll}
        disabled={settings.viewMode !== 'split'}
        onClick={toggleSyncScroll}
      />
      <div class="toolbar-divider" />
      <For each={viewModes}>
        {(item) => (
          <IconButton
            icon={item.icon}
            label={item.label}
            pressed={settings.viewMode === item.mode}
            onClick={() => selectViewMode(item.mode)}
          />
        )}
      </For>
      <div class="toolbar-divider" />
      <IconButton
        icon={theme() === 'dark' ? Sun : Moon}
        label={theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggleTheme}
      />
    </header>
  );
}
