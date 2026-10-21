import path from 'node:path';
import { markdownInlineLinks } from './docs-markdown-anchors.mjs';

// Shared guidance uses its catalogue page as the local-link origin. Moving
// the prose to another reader page must preserve each link's destination.
export function rebaseMarkdownLinks(text, fromFile, toFile) {
  if (path.resolve(fromFile) === path.resolve(toFile)) return text;
  let result = text;
  for (const link of markdownInlineLinks(text).reverse()) {
    const match = /^\s*(?:<([^>]+)>|([^\s]+))/u.exec(link.destination);
    if (!match) continue;
    const href = match[1] ?? match[2];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/iu.test(href)) continue;
    const suffixAt = href.search(/[?#]/u);
    const pathname = suffixAt < 0 ? href : href.slice(0, suffixAt);
    const suffix = suffixAt < 0 ? '' : href.slice(suffixAt);
    const destination = pathname ? path.resolve(path.dirname(fromFile), pathname) : path.resolve(fromFile);
    const relative = path.relative(path.dirname(toFile), destination).split(path.sep).join('/');
    const withinDestination = match[0].indexOf(href);
    const start = link.end - 1 - link.destination.length + withinDestination;
    const end = start + href.length;
    result = result.slice(0, start) + relative + suffix + result.slice(end);
  }
  return result;
}
