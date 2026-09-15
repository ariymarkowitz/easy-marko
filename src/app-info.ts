// The app's name, description and colours for the HTML shell (Document.tsx)
// and the web app manifest (vite.config.ts).

export const APP_NAME = 'Easy Marko';
export const APP_DESCRIPTION = 'A minimal Markdown editor that works offline.';
/** Where `npm run deploy` publishes the app. Link previews need absolute URLs. */
export const APP_URL = 'https://ariymarkowitz.github.io/easy-marko/';

/**
 * Colours shared by the app and the browser and OS around it. vite.config.ts
 * serves them to the CSS as `virtual:app-colors.css`, alongside tokens.css.
 */
export const APP_COLORS = {
  /** --color-surface: panels and floating surfaces, like the find panel and notices. */
  surface: { light: '#f7f7f7', dark: '#222222' },
  /** --color-bg: the page and toolbar, which the browser's own UI and the installed app's splash screen blend into. */
  background: { light: '#fafafa', dark: '#101010' },
};
