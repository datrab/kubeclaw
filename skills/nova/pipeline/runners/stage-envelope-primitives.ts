// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type AnyRecord = Record<string, any>;
type StageRefSpec = string | { prefix?: unknown; parts?: unknown[] | null } | null | undefined;

function hasRefPart(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function assertValidStageRef(key: string, spec: Exclude<StageRefSpec, string | null | undefined>): string {
  const prefix = typeof spec?.prefix === 'string' && spec.prefix.trim() ? spec.prefix.trim() : null;
  const parts = Array.isArray(spec?.parts) ? spec.parts : null;
  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!prefix), () => (!parts))), () => (parts.length === 0))), () => (parts.some((part: unknown) => !hasRefPart(part))))) {
    throw new Error(`Malformed stage ref '${key}': prefix and non-empty parts are required`);
  }
  return `${prefix}:${parts.map((part: unknown) => String(part)).join(':')}`;
}

export function buildStageRefs(entries: Record<string, StageRefSpec> = {}): Record<string, string> {
  const refs: Record<string, string> = {};
  for (const [key, spec] of Object.entries(selectDefinedValue(() => (entries), () => ({})))) {
    if (selectTruthyValue(() => (spec === null), () => (spec === undefined))) continue;
    if (typeof spec === 'string') {
      if (!spec.trim()) throw new Error(`Malformed stage ref '${key}': raw ref must be non-empty`);
      refs[key] = spec;
      continue;
    }
    refs[key] = assertValidStageRef(key, spec);
  }
  return refs;
}

export function buildStagePluginInvocation(stageId: string, fields: AnyRecord = {}): AnyRecord {
  return {
    stageId,
    ...(selectDefinedValue(() => (fields), () => ({}))),
  };
}

export function collectExistingArtifactRefs(candidates: AnyRecord[] = [], existsFn: (path: string) => boolean = fs.existsSync): AnyRecord[] {
  const refs: AnyRecord[] = [];
  for (const artifact of selectDefinedValue(() => (candidates), () => ([]))) {
    if (selectTruthyValue(() => (!artifact?.path), () => (!existsFn(String(artifact.path))))) continue;
    refs.push(artifact);
  }
  return refs;
}
