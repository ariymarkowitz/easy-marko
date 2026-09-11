import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
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
        <meta name="description" content="A minimal markdown editor that works offline." />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f6f6" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1e1e1e" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <title>Marko-down</title>
        {/* eslint-disable-next-line solid/no-innerhtml -- constant script defined above */}
        <script innerHTML={themeScript} />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
