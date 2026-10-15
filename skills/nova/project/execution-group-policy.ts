export interface CompilerExecutionGroups {
  readonly cumulative: Readonly<{timeoutMs:number}>;
  readonly source: Readonly<{timeoutMs:number}>;
  readonly demo: Readonly<{timeoutMs:number}>;
}

/** Receives only the explicitly authored WFINAL-02 executionGroups member.
 * Shape/value validation is NOT selected-owner/task/R/caller authentication.
 * No fallback to module execution.timeoutMs or another group's timeout.
 */
export function resolveCompilerExecutionGroups(value: unknown): CompilerExecutionGroups {
  const groups = ['cumulative','source','demo'] as const;
  const object = (v: unknown, keys: readonly string[]): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v,key));
  if (!object(value,groups)) throw new Error('PROJECT_EXECUTION_GROUPS_INVALID');
  const result = {} as Record<typeof groups[number], Readonly<{timeoutMs:number}>>;
  for (const group of groups) {
    const row = value[group];
    if (!object(row,['timeoutMs']) || !Number.isSafeInteger(row.timeoutMs)
      || Number(row.timeoutMs) < 1 || Number(row.timeoutMs) > 2147483647) {
      throw new Error(`PROJECT_EXECUTION_GROUPS_INVALID:${group}`);
    }
    result[group] = Object.freeze({timeoutMs:Number(row.timeoutMs)});
  }
  return Object.freeze(result);
}
