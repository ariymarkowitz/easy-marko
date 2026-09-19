import { describe, expect, test } from 'vitest';
import {
  embedLocalImages,
  isRelativePath,
  localImageReader,
  locateFile,
  resolvePath,
  showLocalImages,
} from './local-images';
import { fakeFileHandle, fakeFolder } from './file-system.fakes';

test('isRelativePath accepts document-relative paths only', () => {
  for (const src of ['image.png', './a/b.png', '../b.png', 'a%20b.png']) expect(isRelativePath(src)).toBe(true);
  for (const src of ['', '/abs.png', '//host/a.png', 'https://x/a.png', 'data:image/png;base64,', 'blob:x', '#a', 'C:\\a.png']) {
    expect(isRelativePath(src)).toBe(false);
  }
});

describe('resolvePath', () => {
  const file = ['notes', 'today.md'];
  test('resolves from the file’s folder, decoding names and dropping queries', () => {
    expect(resolvePath(file, 'img/a%20b.png?v=1#x')).toEqual(['notes', 'img', 'a b.png']);
    expect(resolvePath(file, './a.png')).toEqual(['notes', 'a.png']);
    expect(resolvePath(file, '../a.png')).toEqual(['a.png']);
  });

  test('gives undefined for paths that leave the folder or are malformed', () => {
    expect(resolvePath(file, '../../a.png')).toBeUndefined();
    expect(resolvePath(file, '%E0%A4%A.png')).toBeUndefined();
    expect(resolvePath(file, '..')).toBeUndefined();
  });
});

test('locateFile picks the highest folder containing the file', async () => {
  const files = { 'a/b/c.md': '' };
  const low = fakeFolder('b', files, ['a', 'b']);
  const high = fakeFolder('a', files, ['a']);
  const other = fakeFolder('x', files, ['x']);
  const found = await locateFile([low, high, other], fakeFileHandle('a/b/c.md'));
  expect(found?.folder).toBe(high);
  expect(found?.path).toEqual(['b', 'c.md']);
});

describe('showLocalImages', () => {
  const html = '<p><img src="a.png" alt="A"><img src="b.png"><img src="c.png"><img src="d.png" alt="D"><img src="https://x/e.png"></p>';

  test('shows each relative image by its state and leaves other images alone', async () => {
    const shown = await showLocalImages(html, (src) =>
      ({
        'a.png': { status: 'loaded', url: 'blob:a' },
        'b.png': Promise.resolve({ status: 'loaded', url: 'blob:b' }),
        'c.png': { status: 'missing' },
        'd.png': { status: 'no-access' },
      })[src] as never,
    );
    const root = document.createElement('div');
    root.innerHTML = shown;
    const imgs = root.querySelectorAll('img');
    expect([...imgs].map((img) => img.getAttribute('src'))).toEqual(['blob:a', 'blob:b', 'https://x/e.png']);
    const placeholders = root.querySelectorAll('.local-image');
    expect(placeholders[0].textContent).toBe('c.png (not found)');
    expect(placeholders[0].querySelector('button')).toBeNull();
    expect(placeholders[1].querySelector('.local-image-label')?.textContent).toBe('D');
    expect(placeholders[1].querySelector('.local-image-allow')?.textContent).toBe('Allow access');
  });

  test('is synchronous while no image is a promise', () => {
    expect(showLocalImages('<img src="a.png">', () => ({ status: 'loaded', url: 'blob:a' }))).toBe(
      '<img src="blob:a">',
    );
  });

  test('puts alt text in the placeholder as text', () => {
    const shown = showLocalImages('<img src="a.png" alt="<b>x</b>">', () => ({ status: 'no-access' }));
    expect(shown).not.toContain('<b>');
  });

  test('returns HTML without relative images unchanged', () => {
    const plain = '<p><img src="https://x/a.png"></p>';
    expect(showLocalImages(plain, () => ({ status: 'missing' }))).toBe(plain);
  });
});

test('embedLocalImages and localImageReader embed readable images as data URLs', async () => {
  const folder = fakeFolder('root', { 'docs/n.md': '', 'docs/img/a.png': 'png' });
  const read = localImageReader(Promise.resolve([folder]), fakeFileHandle('docs/n.md'));
  const html = await embedLocalImages('<img src="img/a.png"><img src="missing.png"><img src="../../x.png">', read);
  const root = document.createElement('div');
  root.innerHTML = html;
  const srcs = [...root.querySelectorAll('img')].map((img) => img.getAttribute('src'));
  expect(srcs[0]).toMatch(/^data:image\/png;base64,/);
  expect(srcs.slice(1)).toEqual(['missing.png', '../../x.png']);
});
