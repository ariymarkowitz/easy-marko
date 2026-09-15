import { describe, expect, test } from 'vitest';
import tokensCss from '../styles/tokens.css?raw';
import { lightDarkToken } from './css-tokens';

describe('lightDarkToken', () => {
  test('reads the light and dark values', () => {
    const css = ':root {\n  --color-a: light-dark( #fafafa ,#101010 );\n  --color-b: light-dark(#fff, #000);\n}';
    expect(lightDarkToken(css, '--color-a')).toEqual({ light: '#fafafa', dark: '#101010' });
    expect(lightDarkToken(css, '--color-b')).toEqual({ light: '#fff', dark: '#000' });
  });

  test.each([
    ['missing', '--color-other: light-dark(#fff, #000);'],
    ['not hex', '--color-a: light-dark(white, black);'],
    ['not light-dark()', '--color-a: #fff;'],
  ])('throws when %s', (_, css) => {
    expect(() => lightDarkToken(css, '--color-a')).toThrow('--color-a');
  });

  test('reads --color-bg from tokens.css', () => {
    expect(() => lightDarkToken(tokensCss, '--color-bg')).not.toThrow();
  });
});
