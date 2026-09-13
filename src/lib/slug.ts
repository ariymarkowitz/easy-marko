// Heading anchors as GitHub makes them, so links written for GitHub work here.

/** Lowercases `text`, drops punctuation and symbols (except `-` and `_`), and turns spaces into hyphens. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/** Returns a function that makes repeated slugs unique with `-1`, `-2` and so on. */
export function createSlugger(): (slug: string) => string {
  const used = new Set<string>();
  return (slug) => {
    let unique = slug;
    for (let count = 1; used.has(unique); count++) unique = `${slug}-${count}`;
    used.add(unique);
    return unique;
  };
}
