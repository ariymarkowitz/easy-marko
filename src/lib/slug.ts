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
  // The last suffix tried for each slug, so a slug repeated n times doesn't retry n suffixes.
  const suffixes = new Map<string, number>();
  return (slug) => {
    let unique = slug;
    let count = suffixes.get(slug) ?? 0;
    while (used.has(unique)) unique = `${slug}-${++count}`;
    suffixes.set(slug, count);
    used.add(unique);
    return unique;
  };
}
