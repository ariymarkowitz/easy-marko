/** A colour token's light and dark values. */
export interface ThemeColor {
  light: string;
  dark: string;
}

/**
 * Reads a `light-dark(#hex, #hex)` custom property from a stylesheet, for the
 * places outside CSS that need the colour itself (the manifest and the
 * theme-color meta tags). Throws if the property is missing or written
 * another way, so a build fails rather than shipping the wrong colour.
 */
export function lightDarkToken(css: string, name: string): ThemeColor {
  const hex = '(#[0-9a-f]{3,8})';
  const match = new RegExp(`${name}\\s*:\\s*light-dark\\(\\s*${hex}\\s*,\\s*${hex}\\s*\\)`, 'i').exec(css);
  if (!match) throw new Error(`${name} must be set to light-dark(#hex, #hex)`);
  return { light: match[1], dark: match[2] };
}
