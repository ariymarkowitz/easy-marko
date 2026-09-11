const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escapes `text` for HTML content or a double-quoted attribute value. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => escapes[char]);
}
