import { expect, test, vi } from 'vitest';
import { sanitizeHtml } from './sanitize';

vi.mock('../styles/base.css?raw', () => ({
  default: `
/* .commented-out { } #commented-out { } */
.toolbar, .sidebar > .item:hover { color: #abcdef; }
#workspace { display: flex; }
@media (min-width: 40.5rem) {
  .narrow .panel { padding: 0; }
}
.notice {
  color: red;
  &.notice-error { color: blue; }
}
`,
}));

test('removes the classes the app styles', () => {
  const html = sanitizeHtml(
    '<p class="toolbar kept item">a</p><p class="panel narrow notice-error"><span class="notice commented-out">b</span></p>',
  );
  expect(html).toBe('<p class="kept">a</p><p><span class="commented-out">b</span></p>');
});

test('removes the ids the app styles, from headings too', () => {
  expect(sanitizeHtml('<div id="workspace">a</div><h2 id="workspace">b</h2><div id="abcdef">c</div>')).toBe(
    '<div>a</div><h2>b</h2><div id="abcdef">c</div>',
  );
});

test('keeps heading ids that name document properties', () => {
  expect(sanitizeHtml('<h1 id="title">a</h1>')).toBe('<h1 id="title">a</h1>');
});
