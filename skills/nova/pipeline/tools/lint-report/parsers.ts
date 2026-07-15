import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
/**
 * Safe JSON parse returning structured diagnostics.
 */
function tryParseJson(str) {
  try {
    return { ok: true, data: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function isIdentifierStart(ch) {
  return selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (ch === '_'), () => (ch === '$'))), () => ((ch >= 'A' && ch <= 'Z')))), () => ((ch >= 'a' && ch <= 'z')));
}

function isIdentifierPart(ch) {
  return selectTruthyValue(() => (isIdentifierStart(ch)), () => ((ch >= '0' && ch <= '9')));
}

function readString(sourceText, start, quote) {
  let i = start + 1;
  while (i < sourceText.length) {
    const ch = sourceText[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i++;
  }
  return i;
}

function tokenizeSource(sourceText) {
  const tokens = [];
  let line = 1;
  let i = 0;

  while (i < sourceText.length) {
    const ch = sourceText[i];
    const next = sourceText[i + 1];

    if (ch === '\n') {
      line++;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < sourceText.length && sourceText[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sourceText.length) {
        if (sourceText[i] === '\n') line++;
        if (sourceText[i] === '*' && sourceText[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }
    if (selectTruthyValue(() => (ch === '"'), () => (ch === "'"))) {
      i = readString(sourceText, i, ch);
      continue;
    }
    if (ch === '`') {
      i = readString(sourceText, i, ch);
      continue;
    }
    if (isIdentifierStart(ch)) {
      const start = i;
      i++;
      while (i < sourceText.length && isIdentifierPart(sourceText[i])) i++;
      tokens.push({ value: sourceText.slice(start, i), line, index: start });
      continue;
    }
    if ('{}(),;=.'.includes(ch)) {
      tokens.push({ value: ch, line, index: i });
    }
    i++;
  }
  return tokens;
}

function pushExport(exports, seen, name, line, index) {
  if (!name) return;
  const key = `${name}:${index}`;
  if (seen.has(key)) return;
  seen.add(key);
  exports.push({ name, line });
}

function collectNamedExportBlock(tokens, start) {
  const names = [];
  let i = start;
  while (i < tokens.length && tokens[i].value !== '}') {
    const current = tokens[i];
    if (isIdentifierStart(current.value[0])) {
      const next = tokens[i + 1];
      const following = tokens[i + 2];
      if (next?.value === 'as' && following && isIdentifierStart(following.value[0])) {
        names.push({ name: following.value, line: current.line, index: current.index });
        i += 3;
        continue;
      }
      if (current.value !== 'type') {
        names.push({ name: current.value, line: current.line, index: current.index });
      }
    }
    i++;
  }
  return { names, nextIndex: i };
}

function collectVariableExports(tokens, start) {
  const names = [];
  let i = start;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.value === ';') break;
    if (token.value === '=') {
      while (i < tokens.length && ![',', ';'].includes(tokens[i].value)) i++;
      continue;
    }
    if (isIdentifierStart(token.value[0])) {
      names.push({ name: token.value, line: token.line, index: token.index });
    }
    i++;
  }
  return names;
}

function extractPublicExportNames(sourceText) {
  const tokens = tokenizeSource(sourceText);
  const exports = [];
  const seen = new Set();

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.value === 'exports' && tokens[i + 1]?.value === '.' && tokens[i + 2]) {
      pushExport(exports, seen, tokens[i + 2].value, token.line, token.index);
      continue;
    }
    if (token.value !== 'export') continue;

    let cursor = i + 1;
    if (tokens[cursor]?.value === 'default') cursor++;
    if (tokens[cursor]?.value === 'declare') cursor++;
    if (tokens[cursor]?.value === 'async') cursor++;
    if (tokens[cursor]?.value === 'abstract') cursor++;

    const kind = tokens[cursor]?.value;
    const nameToken = tokens[cursor + 1];
    if (['function', 'class', 'interface', 'type', 'enum'].includes(kind) && nameToken) {
      pushExport(exports, seen, nameToken.value, token.line, token.index);
      continue;
    }
    if (['const', 'let', 'var'].includes(kind)) {
      for (const entry of collectVariableExports(tokens, cursor + 1)) {
        pushExport(exports, seen, entry.name, entry.line, entry.index);
      }
      continue;
    }
    if (kind === '{') {
      const { names, nextIndex } = collectNamedExportBlock(tokens, cursor + 1);
      for (const entry of names) {
        pushExport(exports, seen, entry.name, entry.line, entry.index);
      }
      i = nextIndex;
    }
  }

  return exports;
}

export { extractPublicExportNames, tryParseJson };
