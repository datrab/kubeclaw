import type { TestContext } from 'node:test';
type FixtureContext = Pick<TestContext, 'after'>;
import type { PipelineBootCapture } from '../../../common/plugin-runtime/foundation/config/pipeline-boot.mjs';

export function publishedControlConfig(t: FixtureContext, changes?: Record<string, unknown>): Promise<{
  root: string;
  author: string;
  capture: PipelineBootCapture;
} & typeof import('../../server/control-config.ts')>;

export function publishedControlConfig(t: FixtureContext, changes: Record<string, unknown>, workerChanges: Record<string, unknown>, studioChanges?: undefined, mutateAuthor?: (author: string) => void | Promise<void>): Promise<{
  root: string;
  author: string;
  capture: PipelineBootCapture;
  workerCapture: PipelineBootCapture;
} & typeof import('../../server/control-config.ts') & typeof import('../../server/worker-config.ts')>;

export function publishedControlConfig(t: FixtureContext, changes: Record<string, unknown>, workerChanges: undefined, studioChanges: Record<string, unknown>): Promise<{
  root: string;
  author: string;
  capture: PipelineBootCapture;
  studioCapture: PipelineBootCapture;
} & typeof import('../../server/control-config.ts') & typeof import('../../server/studio-config.ts')>;

export function publishedServiceConfig(t: FixtureContext, caller: 'prism-ingestion' | 'prism-agent-bridge', changes?: Record<string, unknown>): Promise<{
  root: string; author: string; code: string; output: string; mount: string; capture: PipelineBootCapture;
}>;

export function publishedControlConfig(t: FixtureContext, changes: Record<string, unknown>, workerChanges: undefined, studioChanges: undefined, mutateAuthor: (author: string) => void | Promise<void>): Promise<{
  root: string; author: string; capture: PipelineBootCapture;
} & typeof import('../../server/control-config.ts')>;
