export interface TextStats {
  words: number;
  /** Unicode code points, so an emoji counts as one character. */
  characters: number;
  lines: number;
}

const wordPattern = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const lowSurrogatePattern = /[\uDC00-\uDFFF]/g;

export function textStats(text: string): TextStats {
  let lines = 1;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) lines++;

  return {
    words: text.match(wordPattern)?.length ?? 0,
    characters: text.length - (text.match(lowSurrogatePattern)?.length ?? 0),
    lines,
  };
}
