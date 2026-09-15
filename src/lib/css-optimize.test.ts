import { describe, expect, test } from 'vitest';
import { optimizeCss, styledClasses } from './css-optimize';

const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

/** The optimised stylesheet for `css` against `html`, as its lines. */
const optimize = (css: string, html = '<p class="note">Text</p>') => optimizeCss(css, parse(html)).split('\n');

describe('optimizeCss', () => {
  test('keeps the rules that apply and drops the rest', () => {
    const css = 'p { color: red; }\nblockquote { color: blue; }\n.note, .missing { font-weight: 600; }';
    expect(optimize(css)).toEqual(['p {', '  color: red;', '}', '.note {', '  font-weight: 600;', '}']);
  });

  test('matches selectors that depend on state or draw pseudo-elements', () => {
    const css = `p::before { content: ''; }
      a:hover { color: red; }
      ::selection { color: red; }
      blockquote::before { content: ''; }`;
    expect(optimize(css).filter((line) => !line.startsWith(' '))).toEqual(['p::before {', '}', '::selection {', '}']);
  });

  test('keeps a selector it can\'t parse, since it may still apply', () => {
    expect(optimize('p:nonsense(1) { color: red; }')).toEqual(['p:nonsense(1) {', '  color: red;', '}']);
  });

  test('matches against the whole document, not just its body', () => {
    const doc = new DOMParser().parseFromString('<html data-theme="dark"><body><p>Text</p></body></html>', 'text/html');
    const css = ":root { color-scheme: dark; }\n:root[data-theme='light'] { color-scheme: light; }";
    expect(optimizeCss(css, doc)).toBe(':root {\n  color-scheme: dark;\n}');
  });

  test('strips comments and collapses whitespace, leaving strings and urls alone', () => {
    const css = `/* A comment. */
      p {
        /* Another. */
        background: url("data:image/svg+xml,%3Csvg  x='1;2'%3E")
          no-repeat;
      }`;
    expect(optimize(css)).toEqual(['p {', `  background: url("data:image/svg+xml,%3Csvg  x='1;2'%3E") no-repeat;`, '}']);
  });

  test('drops the custom properties nothing uses, following the chains', () => {
    const css = `:root { --used: 1px; --through: var(--chained); --chained: red; --unused: 2px; }
      p { margin: var(--used); color: var(--through); }`;
    expect(optimize(css)).toEqual([
      ':root {',
      '  --used: 1px;',
      '  --through: var(--chained);',
      '  --chained: red;',
      '}',
      'p {',
      '  margin: var(--used);',
      '  color: var(--through);',
      '}',
    ]);
  });

  test('keeps custom properties the document uses inline, and drops rules left empty', () => {
    const css = ':root { --inline: red; --unused: blue; }\np { color: var(--inline); }';
    expect(optimize(css, '<p style="border-color: var(--inline)">Text</p>')).toContain('  --inline: red;');
    expect(optimize(':root { --unused: blue; }\np { color: red; }')).toEqual(['p {', '  color: red;', '}']);
  });

  test('drops the @font-face rules for families nothing asks for', () => {
    const css = `@font-face { font-family: 'Kept'; src: url(a.woff); }
      @font-face { font-family: Dropped; src: url(b.woff); }
      @font-face { font-family: 'Blockquote'; src: url(c.woff); }
      p { font-family: var(--family); }
      blockquote { font-family: 'Blockquote'; }
      :root { --family: 'Kept', sans-serif; }`;
    expect(optimize(css).filter((line) => line.startsWith('  font-family'))).toEqual([
      `  font-family: 'Kept';`,
      '  font-family: var(--family);',
    ]);
  });

  test('prunes inside conditional groups and drops the ones left empty', () => {
    const css = `@media print { p { color: red; } blockquote { color: blue; } }
      @media (width > 40em) { blockquote { color: blue; } }
      @supports (color: red) { p { color: red; } }`;
    expect(optimize(css)).toEqual([
      '@media print {',
      '  p {',
      '    color: red;',
      '  }',
      '}',
      '@supports (color: red) {',
      '  p {',
      '    color: red;',
      '  }',
      '}',
    ]);
  });

  test('keeps at-rules and nested rules it takes no view on', () => {
    const css = '@import url(other.css);\n@keyframes spin { to { rotate: 360deg; } }\np { & b { color: red; } }';
    expect(optimize(css)).toEqual([
      '@import url(other.css);',
      '@keyframes spin {',
      '  to { rotate: 360deg; }',
      '}',
      'p {',
      '  & b { color: red; }',
      '}',
    ]);
  });
});

test('styledClasses lists the classes the selectors mention', () => {
  expect(styledClasses('.a .b > .c-d, e.f { background: url(./g.png); }')).toEqual(new Set(['a', 'b', 'c-d', 'f']));
});
