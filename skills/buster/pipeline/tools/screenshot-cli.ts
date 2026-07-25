import path from 'path';
import process from 'process';
import { parseCliArgs } from '../cli-args.ts';

type ScreenshotFn = (target: string, output: string, options: Record<string, unknown>) => Promise<{ ok: boolean }>;
type BaselineFn = (html: string, output: string, options: Record<string, unknown>) => Promise<{ ok: boolean }>;

interface ScreenshotCliDependencies {
  takeScreenshot: ScreenshotFn;
  generateBaselines: BaselineFn;
  defaults: {
    viewport: { width: number; height: number };
    waitUntil: string;
    timeout: number;
    settleMs: number;
  };
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

function fatal(error: unknown, stderr: (message: string) => void): never {
  const message = error instanceof Error ? error.message : String(error);
  stderr(`Fatal: ${message}`);
  process.exit(2);
}

export function runScreenshotCli(dependencies: ScreenshotCliDependencies): void {
  const { values: flags, positionals } = parseCliArgs(process.argv.slice(2), {
    allowPositionals: true,
    maxPositionals: 2,
    flags: {
      'generate-baselines': { type: 'boolean', default: false },
      width: { type: 'string', default: String(dependencies.defaults.viewport.width) },
      height: { type: 'string', default: String(dependencies.defaults.viewport.height) },
      'no-fullpage': { type: 'boolean', default: false },
    },
  });
  const [first, second] = positionals;
  if (!first || !second) {
    dependencies.stderr(flags['generate-baselines']
      ? 'Usage: node screenshot.ts --generate-baselines <preview.html> <output-dir/>'
      : 'Usage: node screenshot.ts <target> <output.png> [--width N] [--height N] [--no-fullpage]');
    process.exit(2);
  }
  const options = {
    viewport: { width: Number.parseInt(String(flags.width), 10), height: Number.parseInt(String(flags.height), 10) },
    fullPage: !flags['no-fullpage'],
    waitUntil: dependencies.defaults.waitUntil,
    timeout: dependencies.defaults.timeout,
  };
  const operation = flags['generate-baselines']
    ? dependencies.generateBaselines(path.resolve(first), path.resolve(second), { ...options, settleMs: dependencies.defaults.settleMs })
    : dependencies.takeScreenshot(first, second, options);
  operation.then((result) => {
    dependencies.stdout(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  }).catch((error) => fatal(error, dependencies.stderr));
}
