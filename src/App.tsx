import 'katex/dist/katex.min.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/editor.css';
import './styles/markdown.css';

import { onSettled, Show } from 'solid-js';
import Resizer from './components/Resizer';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import Toolbar from './components/Toolbar';
import Workspace from './components/Workspace';
import { registerServiceWorker } from './pwa';
import { useShortcuts } from './shortcuts';
import { useDocumentsBackup, useWindowTitle } from './state/documents';
import { useScrollSync } from './state/pane-link';
import { setSidebarWidth, settings, useSettingsPersistence } from './state/settings';
import { useTheme } from './state/theme';

export default function App() {
  useTheme();
  useSettingsPersistence();
  useDocumentsBackup();
  useWindowTitle();
  useShortcuts();
  useScrollSync();
  onSettled(registerServiceWorker);

  return (
    <div class="app" style={{ '--sidebar-width': `${settings.sidebarWidth}px` }}>
      <Toolbar />
      <div class="app-body">
        <Show when={settings.sidebarOpen}>
          <Sidebar />
          {/* The sidebar starts at the window's left edge, so the pointer's x is its width. */}
          <Resizer label="Resize sidebar" onResize={setSidebarWidth} />
        </Show>
        <Workspace />
      </div>
      <StatusBar />
    </div>
  );
}
