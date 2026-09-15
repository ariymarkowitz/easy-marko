import { For } from 'solid-js';
import {
  Columns2,
  Eye,
  FileDown,
  FilePlus,
  FolderOpen,
  Info,
  Link2,
  LoaderCircle,
  Moon,
  PanelLeft,
  Redo2,
  Save,
  Search,
  Sun,
  Undo2,
  type IconNode,
} from 'lucide';
import { canRedo, canUndo, editorCommands, findOpen } from '../editor/controller';
import {
  exportActiveDocument,
  exporting,
  newDocument,
  openDocument,
  openWelcomeDocument,
  saveActiveDocument,
} from '../state/documents';
import {
  narrowScreen,
  selectViewMode,
  sidebarOpen,
  toggleSidebar,
  viewMode,
} from '../state/layout';
import { settings, toggleSyncScroll, type ViewMode } from '../state/settings';
import { theme, toggleTheme } from '../state/theme';
import IconButton from './IconButton';
import { SourceIcon } from './icons';

const viewModes: { mode: ViewMode; label: string; icon: IconNode }[] = [
  { mode: 'source', label: 'Source', icon: SourceIcon },
  { mode: 'split', label: 'Side by side', icon: Columns2 },
  { mode: 'preview', label: 'Preview', icon: Eye },
];

export default function Toolbar() {
  // The find panel is in the editor, so its button does nothing while the source is hidden.
  const sourceHidden = () => viewMode() === 'preview';

  return (
    <header class="toolbar">
      <IconButton
        icon={PanelLeft}
        label="Toggle sidebar"
        pressed={sidebarOpen()}
        controls="sidebar"
        onClick={toggleSidebar}
      />
      <div class="toolbar-gap" />
      <IconButton icon={FilePlus} label="New document" onClick={newDocument} />
      <IconButton icon={FolderOpen} label="Open (Mod-O)" onClick={openDocument} />
      <IconButton icon={Save} label="Save (Mod-S)" onClick={saveActiveDocument} />
      <IconButton
        icon={exporting() ? LoaderCircle : FileDown}
        label={exporting() ? 'Exporting as HTML…' : 'Export as HTML'}
        busy={exporting()}
        onClick={exportActiveDocument}
      />
      <div class="toolbar-gap" />
      <IconButton icon={Undo2} label="Undo" disabled={!canUndo()} onClick={editorCommands.undo} />
      <IconButton icon={Redo2} label="Redo" disabled={!canRedo()} onClick={editorCommands.redo} />
      <IconButton
        icon={Search}
        label="Find and replace"
        pressed={findOpen() && !sourceHidden()}
        disabled={sourceHidden()}
        onClick={editorCommands.toggleFind}
      />
      <IconButton
        class="push-end"
        icon={Link2}
        label="Sync scrolling in side-by-side view"
        pressed={settings.syncScroll}
        disabled={viewMode() !== 'split'}
        onClick={toggleSyncScroll}
      />
      <div class="toolbar-gap" />
      <div class="toolbar-group" role="group" aria-label="View">
        <For each={viewModes}>
          {(item) => (
            <IconButton
              icon={item.icon}
              label={item.label}
              pressed={viewMode() === item.mode}
              disabled={item.mode === 'split' && narrowScreen()}
              onClick={() => selectViewMode(item.mode)}
            />
          )}
        </For>
      </div>
      <div class="toolbar-gap" />
      <IconButton
        icon={theme() === 'dark' ? Sun : Moon}
        label={theme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggleTheme}
      />
      <IconButton icon={Info} label="About Easy Marko" onClick={openWelcomeDocument} />
    </header>
  );
}
