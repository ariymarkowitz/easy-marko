// Uint8Array's base64 method, which TypeScript's ESNext lib doesn't declare
// yet (TypeScript 5.9). Chromium 140, Firefox 133, Safari 18.2 and Node 25
// implement it.

interface Uint8Array {
  toBase64(options?: { alphabet?: 'base64' | 'base64url'; omitPadding?: boolean }): string;
}
