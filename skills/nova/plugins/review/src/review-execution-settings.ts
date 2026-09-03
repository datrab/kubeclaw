export interface ReviewExecutionSettings {
  readonly concurrency: number;
  readonly maxRetries: number;
  readonly deadlineEpochMs?: number;
  readonly beforeDispatch?: (
    payload: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>> | void;
  readonly beforeRetry?: () => void;
}

export function assertReviewDeadline(deadlineEpochMs: number | undefined, label: string): void {
  if (deadlineEpochMs !== undefined && Date.now() >= deadlineEpochMs) throw new Error(`${label} wall time budget exhausted`);
}

export async function invokeBeforeReviewDeadline<T>(
  operation: () => Promise<T>, deadlineEpochMs: number | undefined, label: string,
): Promise<T> {
  assertReviewDeadline(deadlineEpochMs, label);
  if (deadlineEpochMs === undefined) return operation();
  let timer!: NodeJS.Timeout;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} wall time budget exhausted`)),
      Math.max(1, deadlineEpochMs - Date.now()));
    timer.unref();
  });
  try { return await Promise.race([operation(), timeout]); } finally { clearTimeout(timer); }
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} is invalid`);
  }
}

export function resolveReviewExecutionSettings(
  value: number | ReviewExecutionSettings, label: string,
): ReviewExecutionSettings {
  const settings = typeof value === 'number' ? { concurrency: value, maxRetries: 0 } : value;
  boundedInteger(settings.concurrency, 1, 32, `${label} concurrency`);
  boundedInteger(settings.maxRetries, 0, 10, `${label} retry limit`);
  if (settings.deadlineEpochMs !== undefined) {
    boundedInteger(settings.deadlineEpochMs, 1, Number.MAX_SAFE_INTEGER, `${label} deadline`);
    if (settings.deadlineEpochMs <= Date.now()) throw new Error(`${label} deadline is expired`);
  }
  return settings;
}
