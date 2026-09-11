export interface TextStats {
  words: number;
  /** Unicode code points, so an emoji counts as one character. */
  characters: number;
  lines: number;
}

const wordPattern = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const lowSurrogatePattern = /[\uDC00-\uDFFF]/g;

const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

export function textStats(text: string): TextStats {
  return {
    words: count(text, wordPattern),
    characters: text.length - count(text, lowSurrogatePattern),
    lines: count(text, /\n/g) + 1,
  };
}
