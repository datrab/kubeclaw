import { log } from '../core/logger.ts';
import { appendLifecycleEvent } from './status-store.ts';
import { buildPipelineRefs } from './status-store-lifecycle/refs.ts';
import { cloneSerializable } from './serialization.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;

function checkpointPoint(point: unknown): string {
  return String(selectDefinedValue(() => (point), () => ('')))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function emitPipelineCheckpoint(config: AnyRecord = {}, point: string, details: AnyRecord = {}): void {
  const normalizedPoint = checkpointPoint(point);
  if (!normalizedPoint) return;
  try {
    appendLifecycleEvent(config, {
      type: 'pipeline.checkpoint',
      refs: buildPipelineRefs(config),
      data: {
        point: normalizedPoint,
        details: cloneSerializable(selectDefinedValue(() => (details), () => ({}))),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('WARN', `Pipeline checkpoint '${normalizedPoint}' could not be recorded: ${message}`);
  }
}

