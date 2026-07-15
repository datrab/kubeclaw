import { getRunId } from '../../core/runtime.ts';
import { cloneSerializable } from '../serialization.ts';
import {
  lifecycleEventsPath,
  lifecycleReadModelsPath,
  readJsonIfPresent,
  readJsonLines,
  writeJsonAtomic,
} from './storage.ts';
import { applyLifecycleEventToReadModels } from './projections.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const LIFECYCLE_READ_MODELS_VERSION = 'v1';

export function createDefaultLifecycleReadModels(config) {
  return {
    schemaVersion: LIFECYCLE_READ_MODELS_VERSION,
    run_id: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (config?._runId), () => (config?.run_id))), () => (getRunId(config)))), () => (null)),
    generated_at: new Date().toISOString(),
    last_event_id: null,
    last_event_type: null,
    event_count: 0,
    pipeline: null,
    progression: {
      modules_total: 0,
      modules_passed: 0,
      modules_failed: 0,
      modules_blocked: 0,
      modules_active: 0,
    },
    modules: {},
    gates: {},
    waits: {
      by_ref: {},
    },
    signals: {
      by_ref: {},
    },
    active_sessions: {
      modules: {},
      gates: {},
    },
    cooldowns: {
      modules: {},
      gates: {},
    },
  };
}

export function loadLifecycleReadModels(config) {
  const filePath = lifecycleReadModelsPath(config);
  const cached = config?._lifecycleReadModelsCache
    ? cloneSerializable(config._lifecycleReadModelsCache)
    : null;
  if (!filePath) {
    return catchUpLifecycleReadModels(config, lifecycleReadModelAuthority(config, cached), {
      persist: false,
    });
  }
  const stored = readJsonIfPresent(filePath, lifecycleReadModelAuthority(config, cached));
  return catchUpLifecycleReadModels(config, stored, { persist: config?._lifecycleReadOnly !== true });
}

function lifecycleReadModelAuthority(config, cached) {
  if (cached) return cached;
  return createDefaultLifecycleReadModels(config);
}

export function saveLifecycleReadModels(config, readModels) {
  const filePath = lifecycleReadModelsPath(config);
  const next = {
    ...readModels,
    generated_at: new Date().toISOString(),
  };
  config._lifecycleReadModelsCache = cloneSerializable(next);
  if (!filePath) return cloneSerializable(next);
  writeJsonAtomic(filePath, next);
  return next;
}

function cachedLifecycleEvents(config) {
  return Array.isArray(config?._lifecycleEventsCache) ? config._lifecycleEventsCache : [];
}

export function readLifecycleEvents(config) {
  const filePath = lifecycleEventsPath(config);
  if (!filePath) return cloneSerializable(cachedLifecycleEvents(config));
  return readJsonLines(filePath);
}

export function rebuildLifecycleReadModels(config, events = readLifecycleEvents(config)) {
  return events.reduce(
    (readModels, event) => applyLifecycleEventToReadModels(readModels, event),
    createDefaultLifecycleReadModels(config),
  );
}

function catchUpLifecycleReadModels(config, readModels, { persist = true } = {}) {
  const events = readLifecycleEvents(config);
  if (!events.length) {
    config._lifecycleReadModelsCache = cloneSerializable(readModels);
    return cloneSerializable(readModels);
  }

  const latestEvent = events[events.length - 1];
  if (
    readModels?.last_event_id === latestEvent?.event_id
    && Number(selectDefinedValue(() => (readModels?.event_count), () => (0))) >= events.length
  ) {
    config._lifecycleReadModelsCache = cloneSerializable(readModels);
    return cloneSerializable(readModels);
  }

  const rebuilt = rebuildLifecycleReadModels(config, events);
  if (persist) return saveLifecycleReadModels(config, rebuilt);
  config._lifecycleReadModelsCache = cloneSerializable(rebuilt);
  return cloneSerializable(rebuilt);
}

export function recomputeProgression(readModels) {
  const moduleEntries = Object.values(selectDefinedValue(() => (readModels.modules), () => ({})));
  readModels.progression = {
    modules_total: moduleEntries.length,
    modules_passed: moduleEntries.filter((entry) => entry.status === 'PASS').length,
    modules_failed: moduleEntries.filter((entry) => entry.status === 'FAIL').length,
    modules_blocked: moduleEntries.filter((entry) => entry.status === 'BLOCKED').length,
    modules_active: moduleEntries.filter((entry) => ['IN_PROGRESS', 'READY_FOR_TESTING', 'TESTING', 'RATE_LIMITED'].includes(entry.status)).length,
  };
  return readModels.progression;
}
