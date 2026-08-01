export interface ParsedTestOutput {
  framework: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface FailureDetail {
  test: string;
  message: string;
}

function optionalCount(value: string | undefined): number {
  return value === undefined ? 0 : Number.parseInt(value, 10);
}

function requiredCount(value: string | undefined, field: string): number {
  if (value === undefined) throw new Error(`${field} count missing from test output`);
  return Number.parseInt(value, 10);
}

function parseJest(output: string): ParsedTestOutput | null {
  const match = output.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(?:(\d+)\s+passed,\s*)?(\d+)\s+total/);
  if (!match) return null;
  return { framework: 'jest', failed: optionalCount(match[1]), skipped: optionalCount(match[2]), passed: optionalCount(match[3]), total: requiredCount(match[4], 'jest total') };
}

function parseVitest(output: string): ParsedTestOutput | null {
  const match = output.match(/Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(?:(\d+)\s+skipped\s*\|\s*)?(\d+)\s+passed\s+\((\d+)\)/);
  if (!match) return null;
  return { framework: 'vitest', failed: optionalCount(match[1]), skipped: optionalCount(match[2]), passed: requiredCount(match[3], 'vitest passed'), total: requiredCount(match[4], 'vitest total') };
}

function parseMocha(output: string): ParsedTestOutput | null {
  const passing = output.match(/(\d+)\s+passing/);
  const failing = output.match(/(\d+)\s+failing/);
  const pending = output.match(/(\d+)\s+pending/);
  if (!passing && !failing) return null;
  const passed = optionalCount(passing?.[1]);
  const failed = optionalCount(failing?.[1]);
  const skipped = optionalCount(pending?.[1]);
  return { framework: 'mocha', passed, failed, skipped, total: passed + failed + skipped };
}

function parseTap(output: string): ParsedTestOutput | null {
  const tests = output.match(/#\s*tests\s+(\d+)/);
  if (!tests) return null;
  return {
    framework: 'tap', total: requiredCount(tests[1], 'tap total'),
    passed: optionalCount(output.match(/#\s*pass\s+(\d+)/)?.[1]),
    failed: optionalCount(output.match(/#\s*fail\s+(\d+)/)?.[1]), skipped: 0,
  };
}

function parsePytest(output: string): ParsedTestOutput | null {
  const match = output.match(/=+\s+(.*?)\s+in\s+[\d.]+s\s*=+/);
  if (!match?.[1] || !/\b(passed|failed|error|skipped|warning)\b/.test(match[1])) return null;
  const passed = optionalCount(match[1].match(/(\d+)\s+passed/)?.[1]);
  const failed = optionalCount(match[1].match(/(\d+)\s+failed/)?.[1]);
  const skipped = optionalCount(match[1].match(/(\d+)\s+skipped/)?.[1]);
  const errors = optionalCount(match[1].match(/(\d+)\s+error/)?.[1]);
  return { framework: 'pytest', passed, failed: failed + errors, skipped, total: passed + failed + errors + skipped };
}

function parseFixtureJson(output: string): ParsedTestOutput | null {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line?.startsWith('{')) continue;
    try {
      const data = JSON.parse(line);
      if (data?.ok !== true || !Array.isArray(data.checked)) continue;
      return { framework: 'fixture_json', total: data.checked.length, passed: data.checked.length, failed: 0, skipped: 0 };
    } catch (_error) {
      continue;
    }
  }
  return null;
}

export function parseOutput(output: string, exitCode: number): ParsedTestOutput {
  const parsers = [parseFixtureJson, parseJest, parseVitest, parseMocha, parseTap, parsePytest];
  for (const parser of parsers) {
    const result = parser(output);
    if (result) return result;
  }
  return exitCode === 0
    ? { framework: 'unparsed_test_output', total: 1, passed: 1, failed: 0, skipped: 0 }
    : { framework: 'unparsed_test_output', total: 1, passed: 0, failed: 1, skipped: 0 };
}

function blockFailures(output: string, separator: RegExp): FailureDetail[] {
  const failures: FailureDetail[] = [];
  const blocks = output.split(separator);
  for (let index = 1; index < blocks.length && failures.length < 10; index += 1) {
    const block = blocks[index];
    if (block === undefined) continue;
    const lines = block.split('\n');
    const test = lines[0]?.trim() || 'test_name_missing';
    const detail = lines.slice(1).find((line) => line.trim() && !line.trim().startsWith('at '));
    failures.push({ test, message: detail?.trim().slice(0, 300) ?? 'unit_test_failed_without_message' });
  }
  return failures;
}

function pytestFailures(output: string): FailureDetail[] {
  const failures: FailureDetail[] = [];
  for (const line of output.match(/^FAILED\s+(.+)/gm) ?? []) {
    if (failures.length >= 10) break;
    const match = line.match(/^FAILED\s+(\S+?)(?:\s+-\s+(.+))?$/);
    if (match?.[1]) failures.push({ test: match[1], message: (match[2] ?? 'unit_test_failed_without_message').slice(0, 300) });
  }
  return failures;
}

export function extractFailures(output: string): FailureDetail[] {
  const jest = blockFailures(output, /\n\s*●\s+/);
  if (jest.length > 0) return jest;
  const mocha = blockFailures(output, /\n\s*\d+\)\s+/);
  if (mocha.length > 0) return mocha;
  return pytestFailures(output);
}

export function firstOutputLine(output: string): string | null {
  const line = output.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
  return line ? line.slice(0, 300) : null;
}
