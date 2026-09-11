import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import solid from '@solidjs/vite-plugin';
import { VitePWA, type VitePluginPWAAPI } from 'vite-plugin-pwa';

/**
 * Regenerates the service worker after the Solid plugin prerenders
 * dist/client/index.html. vite-plugin-pwa generates it when the client build
 * closes, before the shell exists, which would leave the app shell out of the
 * precache and break offline loads. Must come after solid() in `plugins`:
 * post-order buildApp hooks run in plugin order.
 */
function precachePrerenderedShell(): Plugin {
  let pwa: VitePluginPWAAPI | undefined;
  return {
    name: 'easy-marko:precache-prerendered-shell',
    apply: 'build',
    configResolved(config) {
      pwa = config.plugins.find((plugin) => plugin.name === 'vite-plugin-pwa')?.api;
    },
    buildApp: {
      order: 'post',
      async handler() {
        await pwa?.generateSW();
      },
    },
  };
}

export default defineConfig({
  plugins: [
    // Turnkey client mode: no index.html and no mount file. The plugin
    // generates the entries around src/App.tsx, wrapped in src/Document.tsx,
    // and `vite build` prerenders the shell into a static dist/client.
    solid({ start: true, diagnostics: true }),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/pwa.ts: the prerendered shell doesn't go through
      // the plugin's HTML injection, so Document.tsx links the manifest too.
      injectRegister: false,
      // The static site is the client environment's output; the default
      // (the top-level build.outDir, `dist`) would precache `client/…` URLs.
      outDir: 'dist/client',
      manifest: {
        name: 'Easy Marko',
        short_name: 'Easy Marko',
        description: 'A minimal markdown editor that works offline.',
        start_url: '/',
        display: 'standalone',
        background_color: '#fafafa',
        theme_color: '#f6f6f6',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
        navigateFallback: '/index.html',
      },
    }),
    precachePrerenderedShell(),
  ],
  server: {
    port: 3000,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest-setup.ts'],
    isolate: false,
    // Vitest empties CSS imports by default; the HTML export inlines ?raw ones.
    css: { include: [/\.css\?raw$/] },
  },
  build: {
    target: 'esnext',
    // Keep images as asset files instead of inlining them into the JS bundle.
    assetsInlineLimit: 0,
  },
});
