import crypto from 'node:crypto';

const MAXIMUM_XML_DEPTH = 256;
const MAXIMUM_TAG_BYTES = 64 * 1024;
const MAXIMUM_CAPTURE = 8 * 1024;
const MAXIMUM_TEXT = 4096;
const MAXIMUM_CASE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/u;
const XML_HEADER = /^xml\s+version\s*=\s*(["'])1\.0\1(?:\s+encoding\s*=\s*(["'])[Uu][Tt][Ff]-8\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\3)?\s*$/u;

function assertXmlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== 0x9 && codePoint !== 0xa && codePoint !== 0xd
      && !(codePoint >= 0x20 && codePoint <= 0xd7ff)
      && !(codePoint >= 0xe000 && codePoint <= 0xfffd)
      && !(codePoint >= 0x10000 && codePoint <= 0x10ffff)) {
      throw new Error('JUNIT_XML_CHARACTER_INVALID');
    }
  }
}

function bounded(value, fallback) {
  const normalized = String(value ?? '').replace(/\s+/gu, ' ').trim();
  return (normalized || fallback).slice(0, MAXIMUM_TEXT);
}

function decodeEntities(value) {
  let result = '';
  let offset = 0;
  const entities = /&([^;\s<]+);/gu;
  for (const match of value.matchAll(entities)) {
    const plain = value.slice(offset, match.index);
    if (plain.includes('&')) throw new Error('JUNIT_XML_ENTITY_INVALID');
    result += plain;
    const name = match[1];
    const normalized = name.toLowerCase();
    if (normalized === 'amp') result += '&';
    else if (normalized === 'lt') result += '<';
    else if (normalized === 'gt') result += '>';
    else if (normalized === 'quot') result += '"';
    else if (normalized === 'apos') result += "'";
    else if (/^#x[0-9a-f]+$/iu.test(name) || /^#[0-9]+$/u.test(name)) {
      const radix = normalized.startsWith('#x') ? 16 : 10;
      const digits = normalized.slice(radix === 16 ? 2 : 1);
      const codePoint = Number.parseInt(digits, radix);
      if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10ffff
        || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        throw new Error('JUNIT_XML_ENTITY_INVALID');
      }
      result += String.fromCodePoint(codePoint);
    } else {
      throw new Error('JUNIT_XML_ENTITY_UNKNOWN');
    }
    offset = match.index + match[0].length;
  }
  const tail = value.slice(offset);
  if (tail.includes('&')) throw new Error('JUNIT_XML_ENTITY_INVALID');
  const decoded = result + tail;
  assertXmlCharacters(decoded);
  return decoded;
}

function parseAttributes(source) {
  const attributes = Object.create(null);
  let offset = 0;
  while (offset < source.length) {
    const separatorStart = offset;
    while (/[ \t\r\n]/u.test(source[offset] ?? '')) offset += 1;
    if (offset >= source.length) break;
    if (offset === separatorStart) throw new Error('JUNIT_XML_ATTRIBUTE_INVALID');
    const match = XML_NAME.exec(source.slice(offset));
    if (!match) throw new Error('JUNIT_XML_ATTRIBUTE_INVALID');
    const name = match[0];
    offset += name.length;
    while (/[ \t\r\n]/u.test(source[offset] ?? '')) offset += 1;
    if (source[offset] !== '=') throw new Error('JUNIT_XML_ATTRIBUTE_INVALID');
    offset += 1;
    while (/[ \t\r\n]/u.test(source[offset] ?? '')) offset += 1;
    const quote = source[offset];
    if (quote !== '"' && quote !== "'") throw new Error('JUNIT_XML_ATTRIBUTE_INVALID');
    offset += 1;
    const end = source.indexOf(quote, offset);
    if (end < 0) throw new Error('JUNIT_XML_ATTRIBUTE_INVALID');
    if (Object.hasOwn(attributes, name)) throw new Error('JUNIT_XML_ATTRIBUTE_DUPLICATE');
    const rawValue = source.slice(offset, end);
    if (rawValue.includes('<')) throw new Error('JUNIT_XML_ATTRIBUTE_INVALID');
    attributes[name] = decodeEntities(rawValue);
    offset = end + 1;
  }
  return attributes;
}

function splitTag(source) {
  const match = XML_NAME.exec(source);
  if (!match) throw new Error('JUNIT_XML_TAG_INVALID');
  return { name: match[0], attributes: parseAttributes(source.slice(match[0].length)) };
}

function localName(name) {
  return name.slice(name.lastIndexOf(':') + 1).toLowerCase();
}

function findTagEnd(xml, start) {
  let quote = null;
  for (let index = start; index < xml.length && index - start <= MAXIMUM_TAG_BYTES; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index;
  }
  throw new Error('JUNIT_XML_TAG_LIMIT');
}

function duration(attributes) {
  const value = attributes.time;
  if (value === undefined || value.trim() === '') return 0;
  if (value.length > 32 || !/^\d+(?:\.\d+)?$/u.test(value)) throw new Error('JUNIT_DURATION_INVALID');
  const [whole, fraction = ''] = value.split('.');
  const maximumSeconds = BigInt(MAXIMUM_CASE_DURATION_MS / 1000);
  const wholeSeconds = BigInt(whole);
  if (wholeSeconds > maximumSeconds
    || (wholeSeconds === maximumSeconds && /[1-9]/u.test(fraction))) {
    throw new Error('JUNIT_DURATION_INVALID');
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('JUNIT_DURATION_INVALID');
  const milliseconds = seconds * 1000;
  if (!Number.isFinite(milliseconds) || milliseconds > MAXIMUM_CASE_DURATION_MS) {
    throw new Error('JUNIT_DURATION_INVALID');
  }
  return milliseconds;
}

function safeFile(value) {
  if (!value || value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/u.test(value)) return undefined;
  if (value.split(/[\\/]/u).includes('..')) return undefined;
  return value.slice(0, MAXIMUM_TEXT);
}

function stableId(value) {
  return `junit:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function finding(activeCase, kind, attributes, text, index) {
  const attributeMessage = bounded(attributes.message, '');
  const captured = bounded(text, '');
  const message = bounded(
    attributeMessage && captured && attributeMessage !== captured
      ? `${attributeMessage}: ${captured}`
      : attributeMessage || captured,
    kind === 'error' ? 'JUnit test error' : 'JUnit test failure',
  );
  const file = safeFile(activeCase.file);
  const line = Number.parseInt(activeCase.line ?? '', 10);
  return {
    id: stableId(`${activeCase.id}:${kind}:${index}`),
    severity: kind === 'error' ? 'high' : 'medium',
    message,
    rule: `junit.${kind}`,
    ...(file ? { file } : {}),
    ...(Number.isSafeInteger(line) && line > 0 ? { line } : {}),
  };
}

function parse(xml, limits) {
  const cases = [];
  const counts = { total: 0, passed: 0, failed: 0, errored: 0, skipped: 0 };
  const stack = [];
  const suites = [];
  let activeCase = null;
  let activeIssue = null;
  let rootSeen = false;
  let rootClosed = false;
  let xmlHeaderSeen = false;
  let suiteOrdinal = 0;
  let durationMs = 0;

  const appendText = (value) => {
    if (!activeIssue || activeIssue.text.length >= MAXIMUM_CAPTURE) return;
    activeIssue.text += decodeEntities(value).slice(0, MAXIMUM_CAPTURE - activeIssue.text.length);
  };

  const finishIssue = () => {
    if (!activeCase || !activeIssue) throw new Error('JUNIT_XML_STATE_INVALID');
    const index = activeCase.findingCount;
    activeCase.findingCount += 1;
    if (activeCase.keep && activeCase.findings.length < limits.maximumCaseFindings) {
      activeCase.findings.push(finding(activeCase, activeIssue.kind, activeIssue.attributes, activeIssue.text, index));
    }
    activeIssue = null;
  };

  const finishCase = () => {
    if (!activeCase) throw new Error('JUNIT_XML_STATE_INVALID');
    counts.total += 1;
    counts[activeCase.outcome] += 1;
    durationMs += activeCase.durationMs;
    if (!Number.isFinite(durationMs)) throw new Error('JUNIT_DURATION_INVALID');
    if (activeCase.keep) {
      const omittedFindingCount = activeCase.findingCount - activeCase.findings.length;
      cases.push({
        id: activeCase.id,
        name: activeCase.name,
        suitePath: activeCase.suitePath,
        className: activeCase.className,
        outcome: activeCase.outcome,
        durationMs: activeCase.durationMs,
        findings: activeCase.findings,
        findingsTruncated: omittedFindingCount > 0,
        omittedFindingCount,
      });
    }
    activeCase = null;
  };

  const start = (rawName, attributes) => {
    const name = localName(rawName);
    if (stack.length === 0) {
      if (rootSeen || rootClosed || !['testsuite', 'testsuites'].includes(name)) {
        throw new Error('JUNIT_XML_ROOT_INVALID');
      }
      rootSeen = true;
    }
    if (stack.length >= MAXIMUM_XML_DEPTH) throw new Error('JUNIT_XML_DEPTH_LIMIT');
    const frame = { rawName, name, suite: false,
      containerName: name === 'testsuites' ? bounded(attributes.name, 'testsuites') : null };
    stack.push(frame);
    if (name === 'testsuite') {
      if (activeCase) throw new Error('JUNIT_XML_SUITE_IN_CASE');
      if (suites.length >= 64) throw new Error('JUNIT_SUITE_DEPTH_LIMIT');
      suiteOrdinal += 1;
      suites.push(bounded(attributes.name, `suite-${suiteOrdinal}`));
      frame.suite = true;
    } else if (name === 'testcase') {
      const parent = stack.at(-2);
      const directContainer = suites.length === 0 && parent?.name === 'testsuites';
      if (activeCase || (suites.length === 0 && !directContainer)) throw new Error('JUNIT_XML_TESTCASE_INVALID');
      const ordinal = counts.total + 1;
      const className = attributes.classname === undefined ? null : bounded(attributes.classname, 'unnamed-class');
      const suitePath = directContainer ? [parent.containerName] : [...suites];
      activeCase = {
        id: stableId(`${suitePath.join('/')}:${className ?? ''}:${attributes.name ?? ''}:${ordinal}`),
        name: bounded(attributes.name, `testcase-${ordinal}`),
        suitePath,
        className,
        durationMs: duration(attributes),
        file: attributes.file,
        line: attributes.line,
        outcome: 'passed',
        findings: [],
        findingCount: 0,
        keep: cases.length < limits.maximumCases,
        depth: stack.length,
      };
    } else if (activeCase && (name === 'failure' || name === 'error')) {
      if (activeIssue) throw new Error('JUNIT_XML_ISSUE_NESTED');
      activeCase.outcome = name === 'error' ? 'errored' : activeCase.outcome === 'errored' ? 'errored' : 'failed';
      activeIssue = { kind: name, attributes, text: '', depth: stack.length };
    } else if (activeCase && name === 'skipped' && activeCase.outcome === 'passed') {
      activeCase.outcome = 'skipped';
    }
  };

  const end = (rawName) => {
    const frame = stack.at(-1);
    if (!frame || frame.rawName !== rawName) throw new Error('JUNIT_XML_TAG_MISMATCH');
    if (activeIssue && activeIssue.depth === stack.length && frame.name === activeIssue.kind) finishIssue();
    if (activeCase && activeCase.depth === stack.length && frame.name === 'testcase') finishCase();
    if (frame.suite) suites.pop();
    stack.pop();
    if (stack.length === 0) rootClosed = true;
  };

  const headerOffset = 0;
  let offset = 0;
  while (offset < xml.length) {
    const next = xml.indexOf('<', offset);
    const textEnd = next < 0 ? xml.length : next;
    const text = xml.slice(offset, textEnd);
    if (text.includes(']]>')) throw new Error('JUNIT_XML_TEXT_INVALID');
    if (activeIssue) appendText(text);
    else {
      decodeEntities(text);
      if (stack.length === 0 && text.trim()) throw new Error('JUNIT_XML_TEXT_OUTSIDE_ROOT');
    }
    if (next < 0) { offset = xml.length; break; }
    if (xml.startsWith('<!--', next)) {
      const endIndex = xml.indexOf('-->', next + 4);
      if (endIndex < 0) throw new Error('JUNIT_XML_COMMENT_INVALID');
      const comment = xml.slice(next + 4, endIndex);
      if (comment.includes('--') || comment.endsWith('-')) throw new Error('JUNIT_XML_COMMENT_INVALID');
      offset = endIndex + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', next)) {
      const endIndex = xml.indexOf(']]>', next + 9);
      if (endIndex < 0) throw new Error('JUNIT_XML_CDATA_INVALID');
      if (stack.length === 0) throw new Error('JUNIT_XML_TEXT_OUTSIDE_ROOT');
      if (activeIssue) activeIssue.text += xml.slice(next + 9, endIndex).slice(0, MAXIMUM_CAPTURE - activeIssue.text.length);
      offset = endIndex + 3;
      continue;
    }
    if (xml.startsWith('<?', next)) {
      const endIndex = xml.indexOf('?>', next + 2);
      const instruction = endIndex < 0 ? '' : xml.slice(next + 2, endIndex).trim();
      if (endIndex < 0 || next !== headerOffset || rootSeen || xmlHeaderSeen || !XML_HEADER.test(instruction)) {
        throw new Error('JUNIT_XML_PROCESSING_INSTRUCTION_INVALID');
      }
      xmlHeaderSeen = true;
      offset = endIndex + 2;
      continue;
    }
    if (xml.startsWith('<!', next)) throw new Error('JUNIT_XML_DECLARATION_FORBIDDEN');
    const tagEnd = findTagEnd(xml, next + 1);
    let body = xml.slice(next + 1, tagEnd).trim();
    if (body.startsWith('/')) {
      const closing = body.slice(1).trim();
      if (!XML_NAME.test(closing) || XML_NAME.exec(closing)?.[0] !== closing) throw new Error('JUNIT_XML_TAG_INVALID');
      end(closing);
    } else {
      const selfClosing = body.endsWith('/');
      if (selfClosing) body = body.slice(0, -1).trimEnd();
      const parsed = splitTag(body);
      start(parsed.name, parsed.attributes);
      if (selfClosing) end(parsed.name);
    }
    offset = tagEnd + 1;
  }
  if (!rootSeen || stack.length !== 0 || activeCase || activeIssue) throw new Error('JUNIT_XML_INCOMPLETE');
  const omittedCaseCount = counts.total - cases.length;
  return {
    counts,
    durationMs,
    cases,
    casesTruncated: omittedCaseCount > 0,
    omittedCaseCount,
    // JUnit failures belong to their test cases. The separate maximumFindings
    // limit applies only to report-level findings, which this adapter emits none of.
    findings: [],
    findingsTruncated: false,
    omittedFindingCount: 0,
  };
}

export function adapt(input) {
  if (!['application/junit+xml', 'application/xml', 'text/xml'].includes(input.mediaType)) {
    throw new Error(`JUNIT_MEDIA_TYPE_UNSUPPORTED:${input.mediaType}`);
  }
  const bytes = new Uint8Array(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength);
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (hasBom && bytes.length >= 6 && bytes[3] === 0xef && bytes[4] === 0xbb && bytes[5] === 0xbf) {
    throw new Error('JUNIT_BOM_INVALID');
  }
  let xml;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
  } catch {
    throw new Error('JUNIT_UTF8_INVALID');
  }
  if (xml.includes('\ufeff')) throw new Error('JUNIT_BOM_INVALID');
  assertXmlCharacters(xml);
  return parse(xml, input.limits);
}
