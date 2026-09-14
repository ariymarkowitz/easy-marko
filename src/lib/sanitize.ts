// Sanitises rendered Markdown before it reaches the preview's innerHTML or an
// exported file. Markdown can contain raw HTML and opened files are untrusted,
// so scripts, event handlers and javascript: URLs have to go.

import DOMPurify, { type Config } from 'dompurify';
import appCss from '../styles/base.css?raw';

/** The classes and ids that `css` has selectors for. Reads rule and at-rule preludes, nested ones included. */
function selectorNames(css: string): { classes: Set<string>; ids: Set<string> } {
  const preludes = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/[^;{}]*(?=\{)/g)].join(' ');
  const names = (pattern: RegExp) => new Set(Array.from(preludes.matchAll(pattern), (match) => match[1]));
  return { classes: names(/\.(-?[_a-zA-Z][\w-]*)/g), ids: names(/#(-?[_a-zA-Z][\w-]*)/g) };
}

// Markdown is styled only by markdown.css. The app's stylesheet shouldn't
// reach it, so classes and ids that base.css uses are removed.
const app = selectorNames(appCss);

const config: Config = {
  // KaTeX's MathML puts the formula in <semantics>, with its TeX source in an
  // <annotation> for screen readers and copy-paste.
  ADD_TAGS: ['semantics', 'annotation'],
  ADD_ATTR: ['target'],
  // <style> would restyle the whole app, and a submitted form would navigate
  // away from it.
  FORBID_TAGS: ['style', 'form'],
};

// A separate instance, so the hooks below don't apply to other DOMPurify users.
const purifier = DOMPurify(window);

// Links open in a new tab so they never navigate away from the editor.
// Fragment links stay in place. This covers raw HTML and SVG links too.
purifier.addHook('afterSanitizeAttributes', (node) => {
  if (node.localName !== 'a' && node.localName !== 'area') return;
  const href = node.getAttribute('href') ?? node.getAttribute('xlink:href');
  if (href === null || href.startsWith('#')) return;
  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener noreferrer');
});

// Code blocks can scroll sideways, so keyboard users need to focus them to
// scroll. Chrome and Firefox make scrolling elements focusable; Safari doesn't.
purifier.addHook('afterSanitizeAttributes', (node) => {
  if (node.localName === 'pre') node.setAttribute('tabindex', '0');
});

purifier.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'class') {
    data.attrValue = data.attrValue
      .split(/\s+/)
      .filter((name) => name && !app.classes.has(name))
      .join(' ');
    if (!data.attrValue) data.keepAttr = false;
  } else if (data.attrName === 'id') {
    if (app.ids.has(data.attrValue)) data.keepAttr = false;
    // Heading ids are link targets. DOMPurify drops any id that names a
    // document property (a heading "Title" or "Links"), in case it clobbers
    // it. Only forms, images, embeds, iframes and objects show up on
    // `document` by name, so headings can keep theirs.
    else if (/^h[1-6]$/.test(node.localName)) data.forceKeepAttr = true;
  }
});

export function sanitizeHtml(html: string): string {
  return purifier.sanitize(html, config);
}
