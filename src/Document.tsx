import type { ParentProps } from 'solid-js';
import { HydrationScript } from '@solidjs/web';
import bodyFontUrl from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wdth-normal.woff2?url';
import { APP_DESCRIPTION, APP_NAME, APP_URL } from './app-info';
import { lightDarkToken } from './lib/css-tokens';
import { STORAGE_KEYS } from './lib/storage';
import tokensCss from './styles/tokens.css?raw';

// The page colour, which the browser's UI blends into.
const background = lightDarkToken(tokensCss, '--color-bg');

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
        {/* Link previews. public/og-image.png is generated from banner.svg by scripts/logo/og-image.mjs. */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={APP_NAME} />
        <meta property="og:description" content={APP_DESCRIPTION} />
        <meta property="og:url" content={APP_URL} />
        <meta property="og:image" content={`${APP_URL}og-image.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={`${APP_NAME} Markdown editor`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content={background.light} />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content={background.dark} />
        <link rel="icon" href={`${import.meta.env.BASE_URL}icon.svg`} type="image/svg+xml" />
        <link rel="apple-touch-icon" href={`${import.meta.env.BASE_URL}apple-touch-icon.png`} />
        <link rel="manifest" href={`${import.meta.env.BASE_URL}manifest.webmanifest`} />
        {/* The body font's Latin face, which nearly every document needs. Other faces load when used. */}
        <link rel="preload" href={bodyFontUrl} as="font" type="font/woff2" crossorigin="" />
        <title>{APP_NAME}</title>
        {/* eslint-disable-next-line solid/no-innerhtml -- constant script defined above */}
        <script innerHTML={themeScript} />
        <HydrationScript />
      </head>
      <body>{props.children}</body>
    </html>
  );
}
