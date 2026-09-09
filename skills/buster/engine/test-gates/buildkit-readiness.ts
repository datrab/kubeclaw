import { runDependencyProcess, validateDependencyProcessLimits, type DependencyProcessResult } from './dependency-process.ts';

export interface BuildkitReadinessOptions {
  readonly buildctlExecutable: string;
  readonly buildkitHost: string;
  readonly maximumExecutionMs: number;
  readonly maximumOutputBytes: number;
}

/** One current native check shared by concurrent callers; no completed result cache. */
export class BuildkitReadiness {
  readonly #options: BuildkitReadinessOptions;
  #lastCode: DependencyProcessResult['code'] | undefined;
  #checking: Promise<DependencyProcessResult> | undefined;
  readonly #cancellation = new AbortController();

  constructor(options: BuildkitReadinessOptions) {
    if (!options.buildctlExecutable.startsWith('/') || /[\0\r\n]/u.test(options.buildctlExecutable) || !options.buildkitHost || /[\0\r\n]/u.test(options.buildkitHost)) {
      throw new Error('BUSTER_READINESS_BUILDKIT_CONFIG_INVALID');
    }
    validateDependencyProcessLimits(options);
    this.#options = { ...options };
  }

  async shutdown(): Promise<void> {
    this.#cancellation.abort();
    await this.#checking;
  }

  check(): Promise<DependencyProcessResult> {
    this.#checking ??= runDependencyProcess({ executable: this.#options.buildctlExecutable,
      signal: this.#cancellation.signal,
      args: ['--addr', this.#options.buildkitHost, 'debug', 'workers'],
      maximumExecutionMs: this.#options.maximumExecutionMs, maximumOutputBytes: this.#options.maximumOutputBytes,
    }).then(result => {
      if (result.code !== this.#lastCode) {
        this.#lastCode = result.code;
        process.stderr.write(JSON.stringify({ event: 'buster.dependency-readiness', dependency: 'buildkit', ...result }) + '\n');
      }
      return result;
    }).finally(() => { this.#checking = undefined; });
    return this.#checking;
  }
}
