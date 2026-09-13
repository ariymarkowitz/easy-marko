// Sanitises rendered markdown before it reaches the preview's innerHTML or an
// exported file. Markdown can contain raw HTML and opened files are untrusted,
// so scripts, event handlers and javascript: URLs have to go.

import DOMPurify, { type Config } from 'dompurify';

const config: Config = {
  // KaTeX's MathML puts the formula in <semantics>, with its TeX source in an
  // <annotation> for screen readers and copy-paste.
  ADD_TAGS: ['semantics', 'annotation'],
  ADD_ATTR: ['target'],
  // <style> would restyle the whole app, and a submitted form would navigate
  // away from it.
  FORBID_TAGS: ['style', 'form'],
};

// A separate instance, so the hook below doesn't apply to other DOMPurify users.
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

// Heading ids are link targets. DOMPurify drops any id that names a document
// property (a heading "Title" or "Links"), in case it clobbers it. Only
// forms, images, embeds, iframes and objects show up on `document` by name,
// so headings can keep theirs.
purifier.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'id' && /^h[1-6]$/.test(node.localName)) data.forceKeepAttr = true;
});

export function sanitizeHtml(html: string): string {
  return purifier.sanitize(html, config);
}
