import { cloneSerializable } from "../serialization.ts";
import {
  lifecycleEventsPath,
  lifecycleReadModelsPath,
  readJsonIfPresent,
  readJsonLines,
  writeJsonAtomic,
} from "./storage.ts";
import { applyLifecycleEventToReadModels } from "./projections.ts";
import {
  createDefaultLifecycleReadModels,
  recomputeProgression,
} from "./read-model-core.ts";

import { selectDefinedValue } from "../../optional-absence.ts";
export {
  createDefaultLifecycleReadModels,
  recomputeProgression,
} from "./read-model-core.ts";

export function loadLifecycleReadModels(config: any) {
  const filePath = lifecycleReadModelsPath(config);
  const cached = config?._lifecycleReadModelsCache
    ? cloneSerializable(config._lifecycleReadModelsCache)
    : null;
  if (!filePath) {
    return catchUpLifecycleReadModels(
      config,
      lifecycleReadModelAuthority(config, cached),
      {
        persist: false,
      },
    );
  }
  const stored = readJsonIfPresent(
    filePath,
    lifecycleReadModelAuthority(config, cached),
  );
  return catchUpLifecycleReadModels(config, stored, {
    persist: config?._lifecycleReadOnly !== true,
  });
}

function lifecycleReadModelAuthority(config: any, cached: any) {
  if (cached) return cached;
  return createDefaultLifecycleReadModels(config);
}

export function saveLifecycleReadModels(config: any, readModels: any) {
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

function cachedLifecycleEvents(config: any) {
  return Array.isArray(config?._lifecycleEventsCache)
    ? config._lifecycleEventsCache
    : [];
}

export function readLifecycleEvents(config: any) {
  const filePath = lifecycleEventsPath(config);
  if (!filePath) return cloneSerializable(cachedLifecycleEvents(config));
  return readJsonLines(filePath);
}

export function rebuildLifecycleReadModels(
  config: any,
  events: any = readLifecycleEvents(config),
) {
  return events.reduce(
    (readModels: any, event: any) =>
      applyLifecycleEventToReadModels(readModels, event),
    createDefaultLifecycleReadModels(config),
  );
}

function catchUpLifecycleReadModels(
  config: any,
  readModels: any,
  { persist = true }: any = {},
) {
  const events = readLifecycleEvents(config);
  if (!events.length) {
    config._lifecycleReadModelsCache = cloneSerializable(readModels);
    return cloneSerializable(readModels);
  }

  const latestEvent = events[events.length - 1];
  if (
    readModels?.last_event_id === latestEvent?.event_id &&
    Number(
      selectDefinedValue(
        () => readModels?.event_count,
        () => 0,
      ),
    ) >= events.length
  ) {
    config._lifecycleReadModelsCache = cloneSerializable(readModels);
    return cloneSerializable(readModels);
  }

  const rebuilt = rebuildLifecycleReadModels(config, events);
  if (persist) return saveLifecycleReadModels(config, rebuilt);
  config._lifecycleReadModelsCache = cloneSerializable(rebuilt);
  return cloneSerializable(rebuilt);
}
