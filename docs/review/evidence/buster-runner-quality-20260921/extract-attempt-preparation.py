from pathlib import Path
root=Path(__file__).resolve().parent/'files/skills/buster/engine/test-gates';p=root/'runner.ts';s=p.read_text();a=s.index('    const attemptId =',s.index('  async #executeAttempt('));b=s.index('    const state = createRunnerProviderState();',a);body=s[a:b]
body=body.replace('this.#options','owner.options').replace('this.#workspaceRoot','owner.workspaceRoot').replace('this.#id()','owner.id()')
cut=body.index('    const entry = providerEntry(');dirs=body[:cut];rest=body[cut:]
imports='''import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validatePipelineTestGateContract, type ExecutionState, type ProducedOutputV1,
  type ProviderInvocationV1, type ResolvedInputV1, type ResolvedPlanNodeV1, type ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestPlanRunnerOptions } from './runner-types.ts';
import { containedRelative } from './runner-paths.ts';
import { providerEntry, grantedCapabilities } from './runner-worker-profile.ts';
import { compareText, detail, resultIdentity } from './runner-values.ts';
interface PreparationOwner {
  readonly options: TestPlanRunnerOptions;
  readonly workspaceRoot: string;
  readonly id: () => string;
}
'''
a2=s.index('class RunnerFault');b2=s.index('function invocationInputs(',a2);fault=s[a2:b2];a3=b2;b3=s.index('function attemptSummary(',a3);inputs=s[a3:b3]
s=s[:a2]+s[b3:];# remove preparation using exact body source captured before changes
original=s[s.index('    const attemptId =',s.index('  async #executeAttempt(')):s.index('    const state = createRunnerProviderState();',s.index('  async #executeAttempt('))]
s=s.replace(original,'''    const prepared = prepareRunnerAttempt({ options: this.#options, workspaceRoot: this.#workspaceRoot, id: this.#id },
      node, attemptNumber, outputs);
    const { attemptId, attemptRepository, stagingBase, evidenceDirectory, stagedEvidenceDirectory,
      stagedErrorEvidenceDirectory, runnerEvidenceDirectory, entry, granted, preparationFault,
      missingCapability, invocation } = prepared;
''',1)
returns='attemptId, attemptRepository, stagingBase, evidenceDirectory, stagedEvidenceDirectory, stagedErrorEvidenceDirectory, runnerEvidenceDirectory, attemptRepositoryRelative, scratchDirectory'
text=imports+fault+inputs+'''function attemptDirectories(owner: PreparationOwner, node: ResolvedPlanNodeV1, attemptNumber: number) {
'''+dirs+'    return { '+returns+''' };
}

export function prepareRunnerAttempt(owner: PreparationOwner, node: ResolvedPlanNodeV1,
  attemptNumber: number, outputs: ReadonlyMap<string, readonly ProducedOutputV1[]>) {
    const directories = attemptDirectories(owner, node, attemptNumber);
    const { attemptId, attemptRepositoryRelative, scratchDirectory, evidenceDirectory } = directories;
'''+rest+'''    return { ...directories, entry, granted, missingCapability, preparationFault, invocation };
}
'''
(root/'runner-attempt-preparation.ts').write_text(text);p.write_text("import { prepareRunnerAttempt } from './runner-attempt-preparation.ts';\n"+s);print({'preparationLines':len(text.splitlines()),'runnerLines':len(s.splitlines())})
