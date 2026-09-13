import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
import { APP_COLORS, APP_DESCRIPTION, APP_NAME } from './app-info';
import { STORAGE_KEYS } from './lib/storage';

// Applies a saved theme override before first paint, so there's no flash of
// the wrong theme. state/theme.ts keeps it in sync after the app starts.
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEYS.theme)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

// The document shell (the equivalent of index.html). It is prerendered into
// dist/client/index.html at build time and ships no client-side JS; the
// plugin renders src/App.tsx into <body>.
export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={APP_DESCRIPTION} />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content={APP_COLORS.surface.light} />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content={APP_COLORS.surface.dark} />
        <link rel="icon" href={`${import.meta.env.BASE_URL}icon.svg`} type="image/svg+xml" />
        <link rel="apple-touch-icon" href={`${import.meta.env.BASE_URL}apple-touch-icon.png`} />
        <link rel="manifest" href={`${import.meta.env.BASE_URL}manifest.webmanifest`} />
        <title>{APP_NAME}</title>
        {/* eslint-disable-next-line solid/no-innerhtml -- constant script defined above */}
        <script innerHTML={themeScript} />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
