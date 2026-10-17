import type {TestContext} from 'node:test';
import type {ChildProcessByStdio} from 'node:child_process';
import type {Readable} from 'node:stream';
export interface PrismProcessPublication {
  root: string; author: string; code: string; system: string; mount: string;
  callerId: 'prism-control' | 'prism-worker';
}
export function preparePrismProcessPublication(entryFile: string, callerId: 'prism-control' | 'prism-worker'): Promise<PrismProcessPublication>;
export function spawnInstalledPrismProcess(t: Pick<TestContext, 'after'>, entryFile: string,
  callerId: 'prism-control' | 'prism-worker', environment: NodeJS.ProcessEnv,
  failedDiagnosticSink?: boolean): Promise<{child: ChildProcessByStdio<null, Readable, Readable>; publication: PrismProcessPublication}>;
