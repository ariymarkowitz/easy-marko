import { registerSW } from 'virtual:pwa-register';
import { showNotice } from './state/notices';

/** How often an open app checks for a new version, besides whenever the page is shown again. */
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;

/**
 * Registers the service worker that precaches the app for offline use.
 * Registered from code because the prerendered shell doesn't pass through
 * vite-plugin-pwa's HTML injection.
 *
 * A new version's service worker waits until someone clicks Reload on the
 * notice; then it takes over and every open tab of the app reloads. Unsaved
 * edits survive the reload because the documents backup syncs on pagehide.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;

  let dismissUpdateNotice: (() => void) | undefined;
  const updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      dismissUpdateNotice?.();
      dismissUpdateNotice = showNotice('A new version of Easy Marko is available.', {
        timeout: 0,
        actions: [{ label: 'Reload', run: () => void updateServiceWorker(true) }],
      });
    },
    // Only on the first install, so it shows once per browser.
    onOfflineReady() {
      showNotice('Easy Marko is ready to work offline.');
    },
    onRegisteredSW(_url, registration) {
      if (registration) checkForUpdates(registration);
    },
  });
}

/** Checks for a new version every hour, and whenever the page becomes visible. */
function checkForUpdates(registration: ServiceWorkerRegistration): void {
  const check = () => {
    // Offline, the check can only fail; an update already installing will prompt when it's done.
    if (!navigator.onLine || registration.installing) return;
    registration.update().catch(() => {});
  };
  setInterval(check, UPDATE_CHECK_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}
