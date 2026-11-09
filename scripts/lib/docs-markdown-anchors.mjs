import fs from 'node:fs';
import { decodeHTML, decodeHTMLAttribute } from 'entities';

function blank(value) {
  return value.replace(/[^\n]/gu, ' ');
}

function containerPrefixLength(value) {
  let cursor = 0;
  let changed = true;
  while (changed && cursor < value.length) {
    changed = false;
    const remainder = value.slice(cursor);
    const quote = /^ {0,3}>[ \t]?/u.exec(remainder);
    if (quote) { cursor += quote[0].length; changed = true; continue; }
    const list = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?: {1,4}|\t)/u.exec(remainder);
    if (list) { cursor += list[0].length; changed = true; }
  }
  return cursor;
}

function containerDetails(value) {
  let cursor = 0;
  let listIndent = 0;
  let changed = true;
  while (changed && cursor < value.length) {
    changed = false;
    const remainder = value.slice(cursor);
    const quote = /^ {0,3}>[ \t]?/u.exec(remainder);
    if (quote) { cursor += quote[0].length; changed = true; continue; }
    const list = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?: {1,4}|\t)/u.exec(remainder);
    if (list) {
      cursor += list[0].length;
      listIndent = cursor;
      changed = true;
    }
  }
  return { cursor, listIndent };
}

function continuationPrefixLength(value, requiredIndent) {
  let cursor = 0;
  while (cursor < value.length) {
    const quote = /^ {0,3}>[ \t]?/u.exec(value.slice(cursor));
    if (!quote) break;
    cursor += quote[0].length;
  }
  const spaces = /^ */u.exec(value.slice(cursor))[0].length;
  return cursor + spaces >= requiredIndent ? requiredIndent : 0;
}

function stripBlockCodeAndComments(value) {
  const lines = value.match(/[^\n]*(?:\n|$)/gu) ?? [];
  let fence = null;
  const stripped = lines.map((line) => {
    const content = line.endsWith('\n') ? line.slice(0, -1) : line;
    const semanticContent = content.slice(containerPrefixLength(content));
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`, 'u');
      if (close.test(semanticContent)) fence = null;
      return blank(line);
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(semanticContent);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      fence = { marker: opening[1][0], length: opening[1].length };
      return blank(line);
    }
    return line;
  }).join('');
  return stripped.replace(/<!--[\s\S]*?(?:-->|$)/gu, blank);
}

function stripIndentedCode(value) {
  return (value.match(/[^\n]*(?:\n|$)/gu) ?? [])
    .map((line) => /^(?: {4}|\t)/u.test(line) ? blank(line) : line).join('');
}

function stripRawAnchorBlocks(value) {
  return value.replace(/<(script|style|pre|textarea|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/giu,
    (whole, tag) => {
      if (tag.toLocaleLowerCase('en-US') !== 'template') return blank(whole);
      let openingEnd = 0;
      let quote = null;
      for (; openingEnd < whole.length; openingEnd += 1) {
        const character = whole[openingEnd];
        if (quote) { if (character === quote) quote = null; continue; }
        if (character === '"' || character === "'") { quote = character; continue; }
        if (character === '>') { openingEnd += 1; break; }
      }
      return `${whole.slice(0, openingEnd)}${blank(whole.slice(openingEnd))}`;
    });
}

function stripRawHtmlBlocksForHeadings(value) {
  const blockTags = '(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)';
  const blockTagStart = new RegExp(`^\\0* {0,3}<\\/?${blockTags}(?:\\s|/?>|$)`, 'iu');
  const genericTagStart = /^\0* {0,3}<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>\s*$/u;
  const lines = value.match(/[^\n]*(?:\n|$)/gu) ?? [];
  let rawBlock = false;
  return lines.map((line) => {
    const content = line.endsWith('\n') ? line.slice(0, -1) : line;
    if (rawBlock) {
      if (/^[\0\s]*$/u.test(content)) rawBlock = false;
      return blank(line);
    }
    if (blockTagStart.test(content) || genericTagStart.test(content)) {
      rawBlock = true;
      return blank(line);
    }
    return line;
  }).join('');
}

function stripContainerPrefixes(value) {
  let continuationIndent = 0;
  return (value.match(/[^\n]*(?:\n|$)/gu) ?? []).map((line) => {
    const contentLength = line.endsWith('\n') ? line.length - 1 : line.length;
    const content = line.slice(0, contentLength);
    let cursor = containerPrefixLength(content);
    const details = containerDetails(content);
    if (details.listIndent) continuationIndent = details.listIndent;
    else if (continuationIndent > 0 && continuationPrefixLength(content, continuationIndent)) {
      cursor = continuationPrefixLength(content, continuationIndent);
    } else if (content.slice(details.cursor).trim()) continuationIndent = 0;
    return `${'\0'.repeat(cursor)}${line.slice(cursor)}`;
  }).join('');
}

function stripContainerIndentedCode(value) {
  let continuationIndent = 0;
  return (value.match(/[^\n]*(?:\n|$)/gu) ?? []).map((line) => {
    const content = line.endsWith('\n') ? line.slice(0, -1) : line;
    const details = containerDetails(content);
    if (details.listIndent) continuationIndent = details.listIndent;
    else if (content.slice(details.cursor).trim() && !(continuationIndent > 0
      && continuationPrefixLength(content, continuationIndent))) continuationIndent = 0;
    const cursor = containerPrefixLength(content);
    const continuation = continuationIndent > 0 ? continuationPrefixLength(content, continuationIndent) : 0;
    if (continuation) return /^(?: {4}|\t)/u.test(content.slice(continuation)) ? blank(line) : line;
    return /^(?: {4}|\t)/u.test(content.slice(cursor)) ? blank(line) : line;
  }).join('');
}

function stripInlineCode(value) {
  let result = '';
  let cursor = 0;
  while (cursor < value.length) {
    if (value[cursor] !== '`') {
      result += value[cursor];
      cursor += 1;
      continue;
    }
    let openerEnd = cursor;
    while (value[openerEnd] === '`') openerEnd += 1;
    const length = openerEnd - cursor;
    let search = openerEnd;
    let closerEnd = -1;
    while (search < value.length) {
      const candidate = value.indexOf('`', search);
      if (candidate < 0) break;
      let end = candidate;
      while (value[end] === '`') end += 1;
      if (end - candidate === length) { closerEnd = end; break; }
      search = end;
    }
    if (closerEnd < 0) {
      result += value.slice(cursor, openerEnd);
      cursor = openerEnd;
    } else {
      result += blank(value.slice(cursor, closerEnd));
      cursor = closerEnd;
    }
  }
  return result;
}

function stripInlineHtmlTags(value) {
  let result = '';
  let cursor = 0;
  while (cursor < value.length) {
    if (value[cursor] !== '<' || !/^<\/?[A-Za-z]/u.test(value.slice(cursor))) {
      result += value[cursor++];
      continue;
    }
    let end = cursor + 1;
    let quote = null;
    for (; end < value.length; end += 1) {
      const character = value[end];
      if (quote) { if (character === quote) quote = null; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '>') { end += 1; break; }
    }
    if (end > value.length || value[end - 1] !== '>') { result += value[cursor++]; continue; }
    result += blank(value.slice(cursor, end));
    cursor = end;
  }
  return result;
}

function normalizeLinkLabel(value) {
  return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/gu, '$1')
    .trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function closingBracket(value, opening) {
  let depth = 1;
  for (let cursor = opening + 1; cursor < value.length; cursor += 1) {
    if (value[cursor] === '\\') { cursor += 1; continue; }
    if (value[cursor] === '[') depth += 1;
    else if (value[cursor] === ']' && --depth === 0) return cursor;
  }
  return -1;
}

export function markdownReferenceLinks(value) {
  const safe = stripMarkdownCodeAndRawHtml(value);
  const htmlMasked = stripInlineHtmlTags(safe);
  const definitions = new Map();
  let scanSource = safe;
  for (const match of safe.matchAll(/^\0* {0,3}\[([^\]\n]+)\]:[ \t]*(?:\n\0* {0,3})?(?:<([^>\n]*)>|((?:\\.|[^\s\\]|\\.)+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/gmu)) {
    const label = normalizeLinkLabel(match[1]);
    if (label && !definitions.has(label)) definitions.set(label, match[2] ?? match[3]);
    scanSource = `${scanSource.slice(0, match.index)}${blank(match[0])}${scanSource.slice(match.index + match[0].length)}`;
  }
  const links = [];
  for (let cursor = 0; cursor < scanSource.length; cursor += 1) {
    if (htmlMasked[cursor] !== safe[cursor]) continue;
    let image = false;
    let opening = cursor;
    if (scanSource[cursor] === '!' && scanSource[cursor + 1] === '[') {
      image = true;
      opening += 1;
    } else if (scanSource[cursor] !== '[' || (cursor > 0 && scanSource[cursor - 1] === '\\')) continue;
    const close = closingBracket(scanSource, opening);
    if (close < 0) continue;
    const text = scanSource.slice(opening + 1, close);
    let after = close + 1;
    while (after < scanSource.length && /[ \t\n]/u.test(scanSource[after])) after += 1;
    let label = null;
    let end = close + 1;
    if (scanSource[after] === '[') {
      const labelClose = closingBracket(scanSource, after);
      if (labelClose >= 0) {
        label = normalizeLinkLabel(scanSource.slice(after + 1, labelClose) || text);
        end = labelClose + 1;
      }
    } else if (scanSource[after] !== '(') {
      label = normalizeLinkLabel(text);
    }
    const destination = label ? definitions.get(label) : null;
    if (!destination) continue;
    links.push({ destination, label, image, raw: value.slice(cursor, end), start: cursor, end });
    cursor = end - 1;
  }
  return links;
}

export function markdownInlineLinks(value) {
  const safe = stripMarkdownCodeAndRawHtml(value);
  const htmlMasked = stripInlineHtmlTags(safe);
  const links = [];
  for (let cursor = 0; cursor < safe.length; cursor += 1) {
    if (htmlMasked[cursor] !== safe[cursor]) continue;
    let image = false;
    let opening = cursor;
    if (safe[cursor] === '!' && safe[cursor + 1] === '[') {
      image = true;
      opening += 1;
    } else if (safe[cursor] !== '[' || (cursor > 0 && safe[cursor - 1] === '\\')) continue;
    const labelClose = closingBracket(safe, opening);
    if (labelClose < 0) continue;
    let destinationOpen = labelClose + 1;
    while (/[ \t\n]/u.test(safe[destinationOpen] ?? '')) destinationOpen += 1;
    if (safe[destinationOpen] !== '(') continue;
    let depth = 1;
    let end = destinationOpen + 1;
    let angle = false;
    let quote = null;
    for (; end < safe.length && depth > 0; end += 1) {
      const character = safe[end];
      if (character === '\\') { end += 1; continue; }
      if (quote) { if (character === quote) quote = null; continue; }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '<' && depth === 1) { angle = true; continue; }
      if (character === '>' && angle) { angle = false; continue; }
      if (angle) continue;
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
    }
    if (depth !== 0) continue;
    const close = end - 1;
    links.push({ destination: safe.slice(destinationOpen + 1, close), image,
      raw: value.slice(cursor, end), start: cursor, end });
    cursor = end - 1;
  }
  return links;
}

export function stripMarkdownCodeAndRawHtml(value) {
  return stripInlineCode(stripRawHtmlBlocksForHeadings(
    stripContainerPrefixes(stripContainerIndentedCode(stripBlockCodeAndComments(value))),
  ));
}

export function stripFencedCodeAndComments(value) {
  return stripBlockCodeAndComments(value);
}

export function githubHeadingText(raw) {
  const visible = raw
    .replace(/\s+#+\s*$/u, '')
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/giu, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/gu, '$1')
    .replace(/<[^>]+>/gu, '');
  return decodeHTML(visible)
    .replace(/(`+)([\s\S]*?)\1/gu, '$2')
    .replace(/(\*\*|__|~~)([^\n]*?)\1/gu, '$2')
    .replace(/(^|[\s([])([*_])([^\n*_]+)\2(?=$|[\s).,!?:;])/gu, '$1$3')
    .trim();
}

export function githubSlug(value) {
  return value.toLocaleLowerCase('en-US')
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s_-]/gu, '')
    .replace(/\s/gu, '-');
}

export function markdownAnchorEntries(value) {
  const withoutBlocks = stripBlockCodeAndComments(value);
  const containerSource = stripContainerPrefixes(stripContainerIndentedCode(withoutBlocks));
  const anchorSource = stripRawAnchorBlocks(containerSource);
  const blockSource = stripRawHtmlBlocksForHeadings(anchorSource);
  const inlineSafeSource = stripInlineCode(anchorSource);
  const entries = [];
  const counts = new Map();
  const headings = [];
  for (const match of blockSource.matchAll(/^\0* {0,3}(#{1,6})(?:[ \t]+(.+?)|[ \t]*)$/gmu)) {
    if (!match[2]) continue;
    headings.push({ raw: match[2], level: match[1].length, index: match.index });
  }
  const lines = [...blockSource.matchAll(/[^\n]*(?:\n|$)/gu)];
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const content = lines[index][0].replace(/\n$/u, '');
    const underline = lines[index + 1][0].replace(/\n$/u, '');
    const marker = /^\0* {0,3}(=+|-+)[ \t]*$/u.exec(underline);
    const headingText = content.replace(/^\0*/u, '');
    if (!marker || !headingText.trim() || /^ {0,3}(?:#{1,6}(?:\s|$)|>|[-+*]\s|\d{1,9}[.)]\s)/u.test(headingText)) continue;
    headings.push({ raw: headingText.trim(), level: marker[1][0] === '=' ? 1 : 2, index: lines[index].index });
    index += 1;
  }
  headings.sort((left, right) => left.index - right.index);
  for (const heading of headings) {
    const base = githubSlug(githubHeadingText(heading.raw));
    if (!base) continue;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    entries.push({ anchor: count === 0 ? base : `${base}-${count}`, level: heading.level,
      start: Buffer.byteLength(value.slice(0, heading.index)) });
  }
  const parsedAttributes = (source) => {
    const result = [];
    let cursor = 0;
    while (cursor < source.length) {
      while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
      if (cursor >= source.length || source[cursor] === '/') break;
      const name = /^[^\s=/>]+/u.exec(source.slice(cursor));
      if (!name) { cursor += 1; continue; }
      cursor += name[0].length;
      while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
      let attributeValue = null;
      if (source[cursor] === '=') {
        cursor += 1;
        while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
        if (source[cursor] === '"' || source[cursor] === "'") {
          const quote = source[cursor++];
          const start = cursor;
          while (cursor < source.length && source[cursor] !== quote) cursor += 1;
          attributeValue = source.slice(start, cursor);
          if (source[cursor] === quote) cursor += 1;
        } else {
          const unquoted = /^[^\s"'=<>`]+/u.exec(source.slice(cursor));
          if (unquoted) { attributeValue = unquoted[0]; cursor += unquoted[0].length; }
        }
      }
      result.push({ name: name[0].toLocaleLowerCase('en-US'), value: attributeValue });
    }
    return result;
  };
  const htmlTags = (source) => {
    const result = [];
    for (let start = source.indexOf('<'); start >= 0; start = source.indexOf('<', start + 1)) {
      const name = /^<([A-Za-z][A-Za-z0-9:-]*)\b/u.exec(source.slice(start));
      if (!name) continue;
      let cursor = start + name[0].length;
      const attributesStart = cursor;
      let quote = null;
      for (; cursor < source.length; cursor += 1) {
        const character = source[cursor];
        if (quote) { if (character === quote) quote = null; continue; }
        if (character === '"' || character === "'") { quote = character; continue; }
        if (character === '>') break;
      }
      if (cursor >= source.length) continue;
      result.push({ tag: name[1].toLocaleLowerCase('en-US'),
        attributes: source.slice(attributesStart, cursor), index: start });
      start = cursor;
    }
    return result;
  };
  for (const match of htmlTags(inlineSafeSource)) {
    const tag = match.tag;
    for (const item of parsedAttributes(match.attributes)) {
      const name = item.name;
      const anchor = item.value === null ? null : decodeHTMLAttribute(item.value);
      if (!anchor || (name === 'name' && tag !== 'a')) continue;
      if (name !== 'id' && name !== 'name') continue;
      entries.push({ anchor, level: 7, start: Buffer.byteLength(value.slice(0, match.index)) });
    }
  }
  entries.sort((left, right) => left.start - right.start || left.level - right.level);
  return entries;
}

export function markdownAnchors(filePath, cache = new Map()) {
  if (!cache.has(filePath)) cache.set(filePath,
    new Set(markdownAnchorEntries(fs.readFileSync(filePath, 'utf8')).map((entry) => entry.anchor)));
  return cache.get(filePath);
}
