import { standaloneImportTokenAt } from './review-import-syntax.ts';

type ImportScanMode = 'code' | 'single' | 'double' | 'template' | 'regex' | 'line_comment' | 'block_comment';
interface ImportScanState {
  readonly content: string; readonly preserveImportStrings: boolean; readonly markLiterals: boolean; readonly output: string[]; cursor: number; mode: ImportScanMode;
  escaped: boolean; preserveQuote: boolean; regexClass: boolean; expressionDepth: number;
  templateReturns: number[]; regexAfterControl: boolean; controlParentheses: boolean[]; blockBraces: boolean[];
}
function maskScan(state: ImportScanState, offset = 0): void {
  const index = state.cursor + offset;
  const lineTerminators = state.markLiterals ? '\n\r\u2028\u2029' : '\n';
  if (!lineTerminators.includes(state.output[index] ?? ' ')) state.output[index] = ' ';
}
function markLiteral(state: ImportScanState): void {
  if (state.markLiterals) state.output[state.cursor] = '#';
}
function scanQuoted(state: ImportScanState, closing: string): void {
  const current = state.content[state.cursor] as string;
  if (!state.preserveQuote) maskScan(state);
  if (!state.escaped && current === closing) state.mode = 'code';
  state.escaped = !state.escaped && current === '\\';
}
function scanTemplate(state: ImportScanState): void {
  const current = state.content[state.cursor] as string, next = state.content[state.cursor + 1]; maskScan(state);
  if (!state.escaped && current === '$' && next === '{') {
    maskScan(state, 1); state.cursor += 1; state.expressionDepth = 1; state.mode = 'code';
  } else if (!state.escaped && current === '`') {
    state.expressionDepth = state.templateReturns.pop() ?? 0; state.mode = 'code';
  }
  state.escaped = !state.escaped && current === '\\';
}
function scanLineComment(state: ImportScanState): void {
  const newline = state.markLiterals ? /[\n\r\u2028\u2029]/u.test(state.content[state.cursor] ?? '') : state.content[state.cursor] === '\n';
  maskScan(state); if (newline) state.mode = 'code';
}
function scanBlockComment(state: ImportScanState): void {
  const closes = state.content[state.cursor] === '*' && state.content[state.cursor + 1] === '/'; maskScan(state);
  if (closes) { maskScan(state, 1); state.cursor += 1; state.mode = 'code'; }
}
function regexCanStart(state: ImportScanState): boolean {
  const prefix = state.output.slice(Math.max(0, state.cursor - 128), state.cursor).join('').trimEnd();
  if (state.regexAfterControl) return true;
  if (prefix.length === 0) return true;
  return /(?:[([{=,:;!?&|+*%^~<>\/-]|\b(?:return|throw|case|delete|void|typeof|instanceof|in|of|new|yield|await|else|do))$/u.test(prefix);
}
function scanRegex(state: ImportScanState): void {
  const current = state.content[state.cursor] as string; maskScan(state);
  if (!state.escaped && current === '[') state.regexClass = true;
  else if (!state.escaped && current === ']') state.regexClass = false;
  else if (!state.escaped && current === '/' && !state.regexClass) state.mode = 'code';
  state.escaped = !state.escaped && current === '\\';
}
function scanExpressionBoundary(state: ImportScanState, current: string | undefined): boolean {
  if (state.expressionDepth === 0 || (current !== '{' && current !== '}')) return false;
  state.expressionDepth += current === '{' ? 1 : -1;
  if (state.expressionDepth === 0) { maskScan(state); state.mode = 'template'; }
  return true;
}
function importSpecifierQuote(state: ImportScanState): boolean {
  const start = Math.max(0, state.cursor - 512), prefix = state.output.slice(start, state.cursor).join('');
  const call = /(?:require|import)\s*\(\s*$/u.exec(prefix);
  return /\b(?:from|import)\s*$/u.test(prefix) || (call !== null && standaloneImportTokenAt(prefix, call.index));
}
function scanQuoteOpening(state: ImportScanState, current: string | undefined): void {
  if (current !== "'" && current !== '"') return;
  state.mode = current === "'" ? 'single' : 'double'; state.preserveQuote = state.preserveImportStrings && importSpecifierQuote(state);
  if (!state.preserveQuote) { maskScan(state); markLiteral(state); }
}
function scanSlashOpening(state: ImportScanState, current: string | undefined, next: string | undefined): boolean {
  if (current !== '/') return false;
  if (next === '/' || next === '*') {
    maskScan(state); maskScan(state, 1); state.cursor += 1; state.mode = next === '/' ? 'line_comment' : 'block_comment';
    return true;
  }
  if (!regexCanStart(state)) return false;
  maskScan(state); markLiteral(state); state.mode = 'regex'; state.escaped = false; state.regexClass = false; state.regexAfterControl = false;
  return true;
}
function scanParenthesis(state: ImportScanState, current: string | undefined): boolean {
  if (current === '(') {
    const prefix = state.output.slice(Math.max(0, state.cursor - 64), state.cursor).join('').trimEnd();
    state.controlParentheses.push(/\b(?:if|while|for|with|switch|catch)$/u.test(prefix)); state.regexAfterControl = false;
    return true;
  }
  if (current !== ')') return false;
  state.regexAfterControl = state.controlParentheses.pop() ?? false;
  return true;
}
function blockBraceOpening(state: ImportScanState): boolean {
  if (state.regexAfterControl) return true;
  const prefix = state.output.slice(Math.max(0, state.cursor - 256), state.cursor).join('').trimEnd();
  return prefix.length === 0 || /(?:[;}]|=>|\b(?:else|do|try|finally))$/u.test(prefix)
    || /\b(?:function|class)\b[^;{}]*$/u.test(prefix);
}
function scanBrace(state: ImportScanState, current: string | undefined): boolean {
  if (current === '{') { state.blockBraces.push(blockBraceOpening(state)); state.regexAfterControl = false; return true; }
  if (current !== '}') return false;
  state.regexAfterControl = state.blockBraces.pop() ?? false; return true;
}
function scanCode(state: ImportScanState): void {
  const current = state.content[state.cursor], next = state.content[state.cursor + 1];
  if (scanExpressionBoundary(state, current)) return;
  if (scanSlashOpening(state, current, next)) return;
  if (/\s/u.test(current ?? '')) return;
  if (scanParenthesis(state, current) || scanBrace(state, current)) return;
  if (current === '`') {
    state.regexAfterControl = false; maskScan(state); markLiteral(state);
    state.templateReturns.push(state.expressionDepth); state.expressionDepth = 0; state.mode = 'template';
  } else { state.regexAfterControl = false; scanQuoteOpening(state, current); }
}
const IMPORT_SCAN_HANDLERS: Readonly<Record<ImportScanMode, (state: ImportScanState) => void>> = {
  code: scanCode, single: (state) => scanQuoted(state, "'"), double: (state) => scanQuoted(state, '"'),
  template: scanTemplate, regex: scanRegex, line_comment: scanLineComment, block_comment: scanBlockComment,
};
export function importScanSource(content: string, preserveImportStrings = true, markLiterals = false): string {
  const state: ImportScanState = {
    content, preserveImportStrings, markLiterals, output: content.split(''), cursor: 0, mode: 'code', escaped: false, preserveQuote: false,
    regexClass: false, expressionDepth: 0, templateReturns: [], regexAfterControl: false,
    controlParentheses: [], blockBraces: [],
  };
  while (state.cursor < state.output.length) { IMPORT_SCAN_HANDLERS[state.mode](state); state.cursor += 1; }
  return state.output.join('');
}
