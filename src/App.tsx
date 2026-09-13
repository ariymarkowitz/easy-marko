import 'katex/dist/katex.min.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/editor.css';
import './styles/markdown.css';

import { onSettled, Show } from 'solid-js';
import DropIndicator from './components/DropIndicator';
import Notices from './components/Notices';
import PanelEdge, { edgeActions } from './components/PanelEdge';
import Resizer from './components/Resizer';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import Toolbar from './components/Toolbar';
import Workspace from './components/Workspace';
import { registerServiceWorker } from './pwa';
import { useShortcuts } from './shortcuts';
import { useDocumentsBackup, useWindowTitle } from './state/documents';
import { useFileChanges } from './state/file-changes';
import { useFileDrop } from './state/file-drop';
import { useLaunchQueue } from './state/launch-queue';
import { narrowScreen, sidebarOpen, startSidebarDrag, useLayout, viewMode } from './state/layout';
import { useScrollSync } from './state/pane-link';
import { useRecentFiles } from './state/recent-files';
import { setSidebarWidth, settings, SIDEBAR_WIDTH, useSettingsPersistence } from './state/settings';
import { useTheme } from './state/theme';

const sourceHidden = () => viewMode() === 'preview';

export default function App() {
  useTheme();
  useSettingsPersistence();
  useLayout();
  useDocumentsBackup();
  useWindowTitle();
  useFileChanges();
  useRecentFiles();
  useLaunchQueue();
  useFileDrop();
  useShortcuts();
  useScrollSync();
  onSettled(registerServiceWorker);

  return (
    <div
      class={['app', { narrow: narrowScreen() }]}
      style={{ '--sidebar-width': `${settings.sidebarWidth}px` }}
    >
      <Toolbar />
      <div class="app-body">
        <Show
          when={sidebarOpen()}
          fallback={
            <PanelEdge
              position="start"
              after={[edgeActions.showSidebar, ...(sourceHidden() ? [edgeActions.showSource] : [])]}
            />
          }
        >
          <Sidebar />
          <PanelEdge
            before={[edgeActions.hideSidebar]}
            after={sourceHidden() ? [edgeActions.showSource] : []}
          >
            <Resizer
              label="Resize sidebar"
              controls="sidebar"
              value={settings.sidebarWidth}
              range={SIDEBAR_WIDTH}
              onDragStart={startSidebarDrag}
              onChange={setSidebarWidth}
            />
          </PanelEdge>
        </Show>
        <Workspace />
      </div>
      <StatusBar />
      <Notices />
      <DropIndicator />
    </div>
  );
}
