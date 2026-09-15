import { expect, test } from 'vitest';
import { parseUnicodeRange } from './export-fonts';

test('parseUnicodeRange reads single code points, ranges and wildcards', () => {
  expect(parseUnicodeRange('U+0000-00FF, U+0131,u+4??')).toEqual([
    [0x0, 0xff],
    [0x131, 0x131],
    [0x400, 0x4ff],
  ]);
});
