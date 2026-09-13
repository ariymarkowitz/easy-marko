// The app's name, description and colours for the HTML shell (Document.tsx)
// and the web app manifest (vite.config.ts).

export const APP_NAME = 'Easy Marko';
export const APP_DESCRIPTION = 'A minimal markdown editor that works offline.';

/** Copies of colours in tokens.css, for the browser and OS around the app. Keep them in sync. */
export const APP_COLORS = {
  /** --color-surface: the toolbar, which the browser's own UI blends into. */
  surface: { light: '#f6f6f6', dark: '#1e1e1e' },
  /** --color-bg: the page, shown on the installed app's splash screen. */
  background: { light: '#fafafa', dark: '#161616' },
};
