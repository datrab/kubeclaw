import { markdownInlineLinks } from '../lib/docs-markdown-anchors.mjs';

// Only the first page metadata block is publisher-owned. Evidence prose and
// runnable examples later in the document must remain byte-for-byte content.
export function publicationMetadata(text, revision, evidenceUrl) {
  return text.replace(/^(# [^\n]+\n\n)(Status:[^\n]+\n(?:(?:[A-Z][A-Za-z -]*:[^\n]+\n)|\n)*?Last verified:[^\n]+\n(?:[A-Z][A-Za-z -]*:[^\n]+\n)*)\n/u,
    (_all, heading, metadata) => {
      const converted = metadata.replace(/^Evidence: (.+)$/mu, (_line, evidence) => {
        if (evidence.includes('**')) return `Evidence: ${evidence}`;
        const links = evidence.split(';').map(item => item.trim()).map(item => {
          if (markdownInlineLinks(item).length || item.includes(' every ') || item.startsWith('every ')) return item;
          return `[${item}](${/^https?:\/\//u.test(item) ? item : evidenceUrl(item)})`;
        });
        return `Evidence: ${links.join('; ')}`;
      }).replace(/^Last verified: generated during publication$/mu,
        `Last verified: publication source revision ${revision}. Publication does not prove runtime verification.`);
      return `${heading}${converted}\n`;
    });
}
