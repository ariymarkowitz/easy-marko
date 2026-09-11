import { describe, expect, test } from 'vitest';
import { createScrollMap, mapOffset } from './scroll-map';

describe('createScrollMap', () => {
  test('runs from both tops to the end', () => {
    expect(createScrollMap([[10, 20]], [100, 200])).toEqual({
      source: [0, 10, 100],
      preview: [0, 20, 200],
    });
  });

  test('drops pairs that go backwards or reach the end on either side', () => {
    const map = createScrollMap(
      [
        [10, 20],
        [5, 30],
        [15, 20],
        [120, 150],
        [50, 250],
      ],
      [100, 200],
    );
    expect(map).toEqual({ source: [0, 10, 100], preview: [0, 20, 200] });
  });

  test('ends at zero when a pane is too short to scroll', () => {
    expect(createScrollMap([[10, 20]], [-40, 200])).toEqual({ source: [0, 0], preview: [0, 200] });
  });
});

describe('mapOffset', () => {
  const map = createScrollMap(
    [
      [10, 40],
      [30, 50],
    ],
    [100, 200],
  );

  test('interpolates between entries in both directions', () => {
    expect(mapOffset(5, map.source, map.preview)).toBe(20);
    expect(mapOffset(20, map.source, map.preview)).toBe(45);
    expect(mapOffset(65, map.source, map.preview)).toBe(125);
    expect(mapOffset(45, map.preview, map.source)).toBe(20);
  });

  test('clamps offsets outside the map', () => {
    expect(mapOffset(-10, map.source, map.preview)).toBe(0);
    expect(mapOffset(500, map.source, map.preview)).toBe(200);
  });

  test('keeps the other pane at the top when a pane cannot scroll', () => {
    const flat = createScrollMap([], [0, 200]);
    expect(mapOffset(0, flat.source, flat.preview)).toBe(0);
    expect(mapOffset(80, flat.preview, flat.source)).toBe(0);
  });
});
