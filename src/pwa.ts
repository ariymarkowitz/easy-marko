import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the service worker that precaches the app for offline use.
 * Registered from code because the prerendered shell doesn't pass through
 * vite-plugin-pwa's HTML injection.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.PROD) registerSW({ immediate: true });
}
