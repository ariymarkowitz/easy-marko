/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Served by the app-colors plugin in vite.config.ts.
declare module 'virtual:app-colors.css';
declare module 'virtual:app-colors.css?raw' {
  const css: string;
  export default css;
}
