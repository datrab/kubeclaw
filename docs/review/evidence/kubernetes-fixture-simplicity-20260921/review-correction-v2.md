# V2 source correction

V1 retained unchanged. V2 changes only four invalid local `export const` declarations in validateContainerSecurity to ordinary local declarations. This was a real extraction defect: parseDiagnostics alone did not establish grammar/type validity. No new syntax/type/lint/runtime success is claimed.

The inherited release suppression remains exactly the original semantic policy: await bounded release, suppress that rejection, and rethrow the original preparation failure. The actual canonical discipline plugin registers only a CatchClause visitor for no-swallowed-error (discipline-eslint-plugin.mjs:174–177); its swallowedCatch helper (97–110) checks empty, absent-return and console-only catch bodies. A Promise `.catch(() => undefined)` is not a CatchClause, so the relocated original callback is outside this rule's detection. The enclosing catch rethrows the primary error and has multiple statements. The generated-credential catch throws a deliberately sanitized error and does not meet the swallowed predicate.

This is a description of current rule coverage, not a claim that cleanup failure is newly handled. No suppression was converted to evade a rule, no lint rule changed, and no annotation exemption was introduced. Altering the inherited primary-error/cleanup contract would require a separately specified behavior change; this refactor preserves it.
