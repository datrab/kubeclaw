import path from 'node:path';

function unsupported(): never { throw new Error('Dockerfile path semantics cannot be determined statically.'); }
function instructions(source: string): string[] {
  let escape = '\\'; let pending = ''; const result: string[] = [];
  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      const directive = /^#\s*escape\s*=\s*([\\`])\s*$/iu.exec(trimmed);
      if (directive && !result.length && !pending) escape = directive[1]!;
      continue;
    }
    if (!trimmed && !pending) continue;
    let trailing = 0;
    for (let index = line.length - 1; index >= 0 && line[index] === escape; index--) trailing++;
    if (trailing % 2) { pending += line.slice(0, -1); continue; }
    const instruction = (pending + line).trim(); pending = '';
    // Heredocs can contain apparent instructions; never interpret their body as COPY.
    if (instruction.includes('<<')) unsupported();
    if (instruction) result.push(instruction);
  }
  if (pending) unsupported();
  return result;
}
function words(source: string): string[] {
  const result: string[] = []; let token = ''; let started = false; let quote = '';
  for (let index = 0; index < source.length; index++) {
    const character = source[index]!;
    if (character === '\\') {
      if (index + 1 >= source.length) unsupported();
      token += source[++index]; started = true;
    } else if (quote) {
      if (character === quote) quote = ''; else token += character;
    } else if (character === '"' || character === "'") { quote = character; started = true; }
    else if (/\s/u.test(character)) {
      if (started) { result.push(token); token = ''; started = false; }
    } else { token += character; started = true; }
  }
  if (quote) unsupported();
  if (started) result.push(token);
  return result;
}
function copyArguments(source: string): string[] {
  let remaining = source.trim();
  while (remaining.startsWith('--')) {
    const flag = /^--[a-z][a-z-]*(?:=[^\s]+)?\s+/iu.exec(remaining);
    if (!flag) unsupported();
    remaining = remaining.slice(flag[0].length);
  }
  let result: unknown;
  if (remaining.startsWith('[')) {
    try { result = JSON.parse(remaining); } catch { unsupported(); }
  } else result = words(remaining);
  if (!Array.isArray(result) || result.length < 2
    || result.some((item) => typeof item !== 'string' || !item.length)) unsupported();
  return result as string[];
}
function containerPath(base: string, value: string): string {
  if (/[\u0000\r\n$]/u.test(value)) unsupported();
  return path.posix.resolve(base, value);
}
interface Stage { workdir: string; destinations: string[] }

function fromStage(source: string, stages: Map<string, Stage>): Stage {
  const from = words(source).filter((word) => !word.startsWith('--'));
  if (from.length !== 1 && !(from.length === 3 && from[1]!.toUpperCase() === 'AS')) unsupported();
  const inherited = stages.get(from[0]!.toLowerCase());
  const stage = { workdir: inherited?.workdir ?? '/', destinations: [...(inherited?.destinations ?? [])] };
  if (from[2]) stages.set(from[2].toLowerCase(), stage);
  return stage;
}

/** Compares lexical destinations in the final stage; this is not an image build. */
export function matchesStaticPath(source: string, staticPath: string): boolean {
  const stages = new Map<string, Stage>(); let stage: Stage | undefined; let index = 0;
  for (const instruction of instructions(source)) {
    const match = /^([A-Z]+)\s+([\s\S]+)$/iu.exec(instruction);
    if (!match) unsupported();
    const command = match[1]!.toUpperCase(); const arguments_ = match[2]!;
    if (command === 'FROM') {
      stage = fromStage(arguments_, stages);
      stages.set(String(index++), stage);
    } else if (command === 'WORKDIR') {
      if (!stage) unsupported();
      const directory = words(arguments_); if (directory.length !== 1) unsupported();
      stage.workdir = containerPath(stage.workdir, directory[0]!);
    } else if (command === 'COPY') {
      if (!stage) unsupported();
      const argumentsList = copyArguments(arguments_);
      stage.destinations.push(containerPath(stage.workdir, argumentsList.at(-1)!));
    }
  }
  if (!stage) unsupported();
  return stage.destinations.includes(containerPath(stage.workdir, staticPath));
}
