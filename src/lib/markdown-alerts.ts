// GitHub-style alerts: a top-level blockquote whose first line is only
// `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` (in any
// case) becomes a titled callout. Without content after the marker it stays
// a blockquote, as on GitHub.

import type { MarkdownIt, StateCore } from 'markdown-it';
import { Info, Lightbulb, MessageSquareWarning, OctagonAlert, TriangleAlert, type IconNode } from 'lucide';
import { iconSvg } from './icon-markup';

const alertTypes: Record<string, { title: string; icon: IconNode }> = {
  note: { title: 'Note', icon: Info },
  tip: { title: 'Tip', icon: Lightbulb },
  important: { title: 'Important', icon: MessageSquareWarning },
  warning: { title: 'Warning', icon: TriangleAlert },
  caution: { title: 'Caution', icon: OctagonAlert },
};

const alertMarker = new RegExp(`^\\[!(${Object.keys(alertTypes).join('|')})\\][ \\t]*(?:\\n|$)`, 'i');

function alerts(state: StateCore): void {
  const { tokens } = state;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open.type !== 'blockquote_open' || open.level !== 0) continue;
    const inline = tokens[i + 2];
    if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
    const marker = alertMarker.exec(inline.content);
    if (!marker) continue;

    const content = inline.content.slice(marker[0].length);
    // tokens[i + 3] closes the paragraph.
    const moreBlocks = tokens[i + 4]?.type !== 'blockquote_close';
    if (!content && !moreBlocks) continue;

    const type = marker[1].toLowerCase();
    if (content) inline.content = content;
    else tokens.splice(i + 1, 3);

    const close = tokens.findIndex((token, index) => index > i && token.type === 'blockquote_close' && token.level === 0);
    open.tag = tokens[close].tag = 'div';
    open.attrJoin('class', `markdown-alert markdown-alert-${type}`);
    const title = new state.Token('alert_title', 'p', 0);
    title.meta = { type };
    tokens.splice(i + 1, 0, title);
  }
}

export function githubAlerts(md: MarkdownIt): void {
  md.core.ruler.after('block', 'github_alerts', alerts);
  md.renderer.rules.alert_title = (tokens, idx) => {
    const { title, icon } = alertTypes[tokens[idx].meta!.type as string];
    return `<p class="markdown-alert-title">${iconSvg(icon, 'markdown-alert-icon')}${title}</p>\n`;
  };
}
