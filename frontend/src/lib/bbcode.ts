/** vndb's BBCode, for where markup cannot be drawn. components/ui/BBCode.tsx
 *  draws it. */

/** The same text with its markup taken off, for somewhere a link cannot go.
 *
 *  A one-line preview inside a card that is itself a link cannot contain
 *  links, and a truncated `[url=...]` reads as a bug. Stripping is the honest
 *  answer there: the full text is one click away with its markup intact. */
export function plain(text: string): string {
  return text
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, '$1')
    .replace(/\[\/?(?:b|i|u|s|spoiler|quote|code|raw)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
