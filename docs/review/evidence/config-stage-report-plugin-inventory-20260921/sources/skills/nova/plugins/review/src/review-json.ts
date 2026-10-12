export function strictJsonObject(content: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const value: unknown = JSON.parse(content);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Readonly<Record<string, unknown>> : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

type JsoncMode = 'code' | 'string' | 'line_comment' | 'block_comment';
type JsoncState = { mode: JsoncMode; escaped: boolean };

function maskStringCharacter(current: string, state: JsoncState): void {
  if (!state.escaped && current === '"') state.mode = 'code';
  state.escaped = !state.escaped && current === '\\';
}

function maskLineComment(current: string, output: string[], index: number, state: JsoncState): void {
  if (current === '\n') state.mode = 'code';
  else output[index] = ' ';
}

function maskBlockComment(
  current: string,
  next: string | undefined,
  output: string[],
  index: number,
  state: JsoncState,
): number {
  if (current === '*' && next === '/') {
    output[index] = output[index + 1] = ' ';
    state.mode = 'code';
    return index + 1;
  }
  if (current !== '\n') output[index] = ' ';
  return index;
}

function enterCodeToken(
  current: string,
  next: string | undefined,
  output: string[],
  index: number,
  state: JsoncState,
): number {
  if (current === '"') {
    state.mode = 'string';
    state.escaped = false;
    return index;
  }
  if (current !== '/' || (next !== '/' && next !== '*')) return index;
  output[index] = output[index + 1] = ' ';
  state.mode = next === '/' ? 'line_comment' : 'block_comment';
  return index + 1;
}

function maskComments(content: string): string | undefined {
  const output = content.split('');
  const state: JsoncState = { mode: 'code', escaped: false };
  for (let index = 0; index < content.length; index += 1) {
    const current = content[index] ?? '', next = content[index + 1];
    if (state.mode === 'string') maskStringCharacter(current, state);
    else if (state.mode === 'line_comment') maskLineComment(current, output, index, state);
    else if (state.mode === 'block_comment') index = maskBlockComment(current, next, output, index, state);
    else index = enterCodeToken(current, next, output, index, state);
  }
  return state.mode === 'block_comment' ? undefined : output.join('');
}

function updateQuotedState(current: string, state: { quoted: boolean; escaped: boolean }): void {
  if (state.quoted) {
    if (!state.escaped && current === '"') state.quoted = false;
    state.escaped = !state.escaped && current === '\\';
  } else if (current === '"') {
    state.quoted = true;
    state.escaped = false;
  }
}

function nextNonWhitespace(content: string, start: number): string | undefined {
  let cursor = start;
  while (/\s/u.test(content[cursor] ?? '')) cursor += 1;
  return content[cursor];
}

function maskTrailingCommas(content: string): string {
  const output = content.split('');
  const state = { quoted: false, escaped: false };
  for (let index = 0; index < content.length; index += 1) {
    const current = content[index] ?? '';
    updateQuotedState(current, state);
    if (state.quoted || current !== ',') continue;
    const next = nextNonWhitespace(content, index + 1);
    if (next === '}' || next === ']') output[index] = ' ';
  }
  return output.join('');
}
export function jsoncObject(content: string): Readonly<Record<string, unknown>> | undefined {
  const normalized = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const uncommented = maskComments(normalized);
  return uncommented === undefined ? undefined : strictJsonObject(maskTrailingCommas(uncommented));
}
