import type { BusterStartupHandoff } from './buster-startup.ts';
export interface BusterStartupFileCapture {
  readonly handoff: BusterStartupHandoff;
  assertCurrent(): void;
  close(): void;
}
export function captureBusterStartupFile(base: string): BusterStartupFileCapture;
export function captureProductiveBusterStartupFile(): BusterStartupFileCapture;
export function publishBusterStartupFile(base: string, handoff: BusterStartupHandoff): BusterStartupFileCapture;
