// Cuts a stylesheet down to what one document needs, for HTML exports, which
// inline every stylesheet the preview uses. Comments go, rules whose selectors
// match nothing are dropped, and custom properties and @font-face rules that
// nothing left refers to follow them. The result is still indented: exports
// are meant to be readable, so this trims what's unused rather than the
// whitespace.

interface Declaration {
  property: string;
  value: string;
}

interface Rule {
  /** A selector list, or an at-rule's name and prelude. */
  prelude: string;
  /** A statement with no block, like `@import url(…)`. */
  statement?: boolean;
  declarations?: Declaration[];
  /** The rules inside a conditional group, like @media. */
  children?: Rule[];
  /** A body this doesn't take apart, like @keyframes or a rule with nested rules. */
  raw?: string;
}

/** At-rules whose bodies hold rules, and those whose bodies hold declarations. */
const groupAtRules = new Set(['media', 'supports', 'container', 'layer', 'scope']);
const declarationAtRules = new Set(['font-face', 'property', 'page']);

/**
 * The index just past the comment, string or (…) group at `i`, or `i + 1` for
 * anything else. Values are scanned through this, so a `;` or `/*` inside a
 * string or a data URL is left alone.
 */
function skip(css: string, i: number): number {
  const char = css[i];
  if (char === '/' && css[i + 1] === '*') {
    const end = css.indexOf('*/', i + 2);
    return end < 0 ? css.length : end + 2;
  }
  if (char === '"' || char === "'") {
    for (let j = i + 1; j < css.length; j++) {
      if (css[j] === '\\') j++;
      else if (css[j] === char) return j + 1;
    }
    return css.length;
  }
  if (char === '(') {
    for (let j = i + 1; j < css.length; j = skip(css, j)) {
      if (css[j] === ')') return j + 1;
    }
    return css.length;
  }
  return i + 1;
}

/** The index of the next of `characters` outside any comment, string or group, or -1. */
function findTop(css: string, from: number, characters: string): number {
  for (let i = from; i < css.length; i = skip(css, i)) {
    if (characters.includes(css[i])) return i;
  }
  return -1;
}

/** `css` split on the top-level `separator`. */
function splitTop(css: string, separator: string): string[] {
  const parts: string[] = [];
  for (let start = 0; start <= css.length; ) {
    const end = findTop(css, start, separator);
    parts.push(css.slice(start, end < 0 ? css.length : end));
    start = end < 0 ? css.length + 1 : end + 1;
  }
  return parts;
}

/** The index of the brace closing the block that opens at `open`. */
function blockEnd(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; ) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return i;
    i = css[i] === '{' || css[i] === '}' ? i + 1 : skip(css, i);
  }
  return css.length;
}

/** `text` without comments, with runs of whitespace collapsed to a single space. */
function clean(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; ) {
    if (text[i] === '/' && text[i + 1] === '*') {
      i = skip(text, i);
    } else if (/\s/.test(text[i])) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (out && i < text.length && !out.endsWith(' ')) out += ' ';
    } else {
      const end = skip(text, i);
      out += text.slice(i, end);
      i = end;
    }
  }
  return out;
}

function parseDeclarations(body: string): Declaration[] {
  return splitTop(body, ';').flatMap((part) => {
    const text = clean(part);
    // A property name has no colon, so the first one ends it.
    const colon = text.indexOf(':');
    return colon > 0 ? [{ property: text.slice(0, colon).trim(), value: text.slice(colon + 1).trim() }] : [];
  });
}

function parseRule(prelude: string, body: string): Rule {
  const name = /^@([\w-]+)/.exec(prelude)?.[1];
  if (name && groupAtRules.has(name)) return { prelude, children: parseRules(body) };
  // Style rules with nested rules, and at-rules this doesn't know, stay as written.
  if ((!name || declarationAtRules.has(name)) && findTop(body, 0, '{') < 0) {
    return { prelude, declarations: parseDeclarations(body) };
  }
  return { prelude, raw: clean(body) };
}

function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  for (let i = 0; i < css.length; ) {
    const stop = findTop(css, i, '{};');
    if (stop < 0) break;
    const prelude = clean(css.slice(i, stop));
    if (css[stop] === '{') {
      const end = blockEnd(css, stop);
      rules.push(parseRule(prelude, css.slice(stop + 1, end)));
      i = end + 1;
    } else {
      if (css[stop] === ';' && prelude) rules.push({ prelude, statement: true });
      i = stop + 1;
    }
  }
  return rules;
}

/**
 * Pseudo-elements, and the pseudo-classes that depend on what the reader does,
 * which are dropped before a selector is matched against the document.
 */
const dynamicPseudo =
  /::[\w-]+(\([^()]*\))?|:(hover|focus|focus-visible|focus-within|active|visited|link|any-link|target|target-within|before|after|first-line|first-letter|selection|marker|placeholder|backdrop|autofill|user-valid|user-invalid|open|popover-open|modal|fullscreen)\b/gi;

/** Whether `selector` could match something in `doc`, ignoring state and pseudo-elements. */
function matches(selector: string, doc: Document): boolean {
  const stripped = selector.replace(dynamicPseudo, '').trim();
  // A selector that was only a pseudo-element, or one left dangling, is kept.
  if (!stripped || /[>+~]$/.test(stripped)) return true;
  try {
    return doc.querySelector(stripped) !== null;
  } catch {
    // A selector this browser can't parse is kept, since it may still apply.
    return true;
  }
}

/** `rules` without the style rules that match nothing in `doc`, and the groups left empty. */
function pruneRules(rules: Rule[], doc: Document): Rule[] {
  return rules.flatMap((rule) => {
    if (rule.children) {
      const children = pruneRules(rule.children, doc);
      return children.length ? [{ ...rule, children }] : [];
    }
    if (rule.prelude.startsWith('@')) return [rule];
    const selectors = splitTop(rule.prelude, ',')
      .map((selector) => selector.trim())
      .filter((selector) => selector && matches(selector, doc));
    return selectors.length ? [{ ...rule, prelude: selectors.join(', ') }] : [];
  });
}

const isFontFace = (rule: Rule) => rule.prelude.startsWith('@font-face');

/** Every rule in the tree, including those inside conditional groups. */
function* eachRule(rules: Rule[]): Generator<Rule> {
  for (const rule of rules) {
    yield rule;
    if (rule.children) yield* eachRule(rule.children);
  }
}

const customPropertyNames = (text: string) => [...text.matchAll(/var\(\s*(--[\w-]*)/g)].map(([, name]) => name);

/**
 * `rules` without the custom properties nothing refers to, following the
 * chains between them. `text` is anything outside the stylesheet that may use
 * them, like the document's inline styles.
 */
function pruneCustomProperties(rules: Rule[], text: string): Rule[] {
  const definitions = new Map<string, string[]>();
  const pending = customPropertyNames(text);
  for (const rule of eachRule(rules)) {
    if (rule.raw !== undefined) pending.push(...customPropertyNames(rule.raw));
    for (const { property, value } of rule.declarations ?? []) {
      if (!property.startsWith('--')) pending.push(...customPropertyNames(value));
      else definitions.set(property, [...(definitions.get(property) ?? []), value]);
    }
  }

  const used = new Set<string>();
  for (let name = pending.pop(); name; name = pending.pop()) {
    if (used.has(name)) continue;
    used.add(name);
    // A property's own value can reach others.
    for (const value of definitions.get(name) ?? []) pending.push(...customPropertyNames(value));
  }

  return rules.flatMap(function prune(rule): Rule[] {
    if (rule.children) return [{ ...rule, children: rule.children.flatMap(prune) }];
    if (!rule.declarations) return [rule];
    const declarations = rule.declarations.filter(({ property }) => !property.startsWith('--') || used.has(property));
    return declarations.length ? [{ ...rule, declarations }] : [];
  });
}

/** `rules` without the @font-face rules for families nothing left asks for. */
function pruneFontFaces(rules: Rule[], text: string): Rule[] {
  const wanted = [...eachRule(rules)]
    .filter((rule) => !isFontFace(rule))
    .flatMap((rule) => [rule.raw ?? '', ...(rule.declarations ?? []).map(({ value }) => value)])
    .join('\n');
  const family = (rule: Rule) =>
    rule.declarations?.find(({ property }) => property === 'font-family')?.value.replaceAll(/['"]/g, '');
  return rules.filter((rule) => {
    if (!isFontFace(rule)) return true;
    const name = family(rule);
    return !name || wanted.includes(name) || text.includes(name);
  });
}

function print(rules: Rule[], indent = ''): string {
  return rules
    .map((rule) => {
      if (rule.statement) return `${indent}${rule.prelude};`;
      const body = rule.children
        ? print(rule.children, `${indent}  `)
        : rule.raw !== undefined
          ? `${indent}  ${rule.raw}`
          : rule.declarations!.map(({ property, value }) => `${indent}  ${property}: ${value};`).join('\n');
      return `${indent}${rule.prelude} {\n${body}\n${indent}}`;
    })
    .join('\n');
}

/**
 * `css` cut down to the rules that apply to `doc`, without comments. `doc` is
 * the document the stylesheet will be shipped with, and its inline styles are
 * read too, so custom properties they use are kept.
 */
export function optimizeCss(css: string, doc: Document): string {
  const inline = [...doc.querySelectorAll('[style]')].map((element) => element.getAttribute('style')).join(';');
  const rules = pruneFontFaces(pruneCustomProperties(pruneRules(parseRules(css), doc), inline), inline);
  return print(rules);
}

/** The class names the selectors in `css` mention. */
export function styledClasses(css: string): Set<string> {
  // Only the selectors, so a file name in a url() isn't taken for a class.
  const selectors = parseRules(css).flatMap(function preludes(rule): string[] {
    // A body this doesn't take apart may hold selectors of its own.
    return [rule.prelude, rule.raw ?? '', ...(rule.children?.flatMap(preludes) ?? [])];
  });
  return new Set([...selectors.join('\n').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(([, name]) => name));
}
