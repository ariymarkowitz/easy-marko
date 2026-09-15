/// <reference types="node" />
import { globSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import solid from '@solidjs/vite-plugin';
import { VitePWA, type VitePluginPWAAPI } from 'vite-plugin-pwa';
import { APP_COLORS, APP_DESCRIPTION, APP_NAME } from './src/app-info.ts';
import { fileTypes } from './src/lib/files.ts';

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

/**
 * Serves `virtual:app-colors.css`, the tokens.css colours that app-info.ts
 * also gives the browser and OS, so they're written once. Also serves
 * `virtual:app-colors.css?raw` for the HTML export, which Vite's own `?raw`
 * handling can't load because there is no file.
 */
function appColors(): Plugin {
  const id = 'virtual:app-colors.css';
  const resolvedId = `\0${id}`;
  const css = `:root {
  --color-bg: light-dark(${APP_COLORS.background.light}, ${APP_COLORS.background.dark});
  --color-surface: light-dark(${APP_COLORS.surface.light}, ${APP_COLORS.surface.dark});
}
`;
  return {
    name: 'easy-marko:app-colors',
    enforce: 'pre',
    resolveId(source) {
      if (source === id) return resolvedId;
      if (source === `${id}?raw`) return `${resolvedId}?raw`;
    },
    load(loadId) {
      if (loadId === resolvedId) return css;
      if (loadId === `${resolvedId}?raw`) return `export default ${JSON.stringify(css)};`;
    },
  };
}

/**
 * Test files that call vi.mock. Tests otherwise share one module graph
 * (`isolate: false`), where a mock can't replace a module that an earlier test
 * file already loaded, so these files run isolated.
 */
const mockingTests = globSync('src/**/*.test.{ts,tsx}').filter((file) =>
  readFileSync(file, 'utf8').includes('vi.mock('),
);

/**
 * Font files outside the Latin and Latin Extended subsets, which the service
 * worker caches when first used instead of precaching. Fontsource names
 * files `<font>-<subset>-<axes>-<style>.woff2`, and Vite keeps the name.
 */
const uncommonFontFiles = ['instrument-sans', 'figtree', 'google-sans-code'].flatMap((font) => {
  const { subsets } = JSON.parse(
    readFileSync(`node_modules/@fontsource-variable/${font}/metadata.json`, 'utf8'),
  ) as { subsets: string[] };
  return subsets
    .filter((subset) => subset !== 'latin' && subset !== 'latin-ext')
    .map((subset) => `**/${font}-${subset}-*.woff2`);
});

/** GitHub Pages serves the site from the repository's path; see `npm run deploy`. */
const githubPagesBase = '/easy-marko/';

export default defineConfig(({ mode }) => {
  // Code that links to files in public/ must prefix them with `import.meta.env.BASE_URL`.
  const base = mode === 'github-pages' ? githubPagesBase : '/';
  return {
    base,
    plugins: [
      appColors(),
      // Turnkey client mode: no index.html and no mount file. The plugin
      // generates the entries around src/App.tsx, wrapped in src/Document.tsx,
      // and `vite build` prerenders the shell into a static dist/client.
      solid({ start: true, diagnostics: true }),
      VitePWA({
        // A new version waits until the user chooses to reload (see src/pwa.ts).
        registerType: 'prompt',
        // Registered from src/pwa.ts: the prerendered shell doesn't go through
        // the plugin's HTML injection, so Document.tsx links the manifest too.
        injectRegister: false,
        // The static site is the client environment's output; the default
        // (the top-level build.outDir, `dist`) would precache `client/…` URLs.
        outDir: 'dist/client',
        manifest: {
          name: APP_NAME,
          short_name: APP_NAME,
          description: APP_DESCRIPTION,
          display: 'standalone',
          background_color: APP_COLORS.background.light,
          theme_color: APP_COLORS.surface.light,
          // Paths are relative to the manifest (start_url and scope default to
          // the base). The PNGs are generated from icon.svg by scripts/icons.mjs.
          icons: [
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // Open Markdown files from the OS once installed; see state/launch-queue.ts.
          file_handlers: [{ action: '.', accept: fileTypes }],
          // Every window shows every document, so open launched files in an existing window.
          launch_handler: { client_mode: 'focus-existing' },
        },
        workbox: {
          // The WebAssembly subsets fonts for HTML exports, which work offline too.
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,webmanifest}'],
          // Only link previews use this, so it doesn't need to work offline.
          globIgnores: ['og-image.png', ...uncommonFontFiles],
          navigateFallback: `${base}index.html`,
          runtimeCaching: [
            {
              // Font files are versioned by hash, so a cached one never changes.
              // Matched by URL, as HTML exports fetch them too.
              urlPattern: ({ url }) => url.pathname.endsWith('.woff2'),
              handler: 'CacheFirst',
              options: { cacheName: 'fonts', expiration: { maxEntries: 100 } },
            },
          ],
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
      // Agent worktrees live in .claude/worktrees; their tests would share this run's globals.
      exclude: [...configDefaults.exclude, '.claude/**'],
      // Vitest empties CSS imports by default; the HTML export inlines ?raw ones.
      css: { include: [/\.css\?raw$/] },
      projects: [
        { extends: true, test: { name: 'shared', isolate: false, exclude: mockingTests } },
        { extends: true, test: { name: 'isolated', include: mockingTests } },
      ],
    },
    build: {
      target: 'esnext',
      // Keep images as asset files instead of inlining them into the JS bundle.
      assetsInlineLimit: 0,
    },
  };
});
