from pathlib import Path
root=Path(__file__).resolve().parent/'files/skills/buster/engine/test-gates';p=root/'runner.ts';s=p.read_text();a=s.index('    const workerLocalRuntime =',s.index('  constructor('));b=s.index('    fs.mkdirSync(options.workspaceRoot',a)
validation=s[a:b];validation=validation.replace('const workerLocalRuntime = validateLocalWorkerRuntimePolicy(options.workerLocalRuntime);','const workerLocalRuntime = validateLocalWorkerRuntimePolicy(options.workerLocalRuntime);')
text="""import fs from 'node:fs';
import path from 'node:path';
import { validateLocalWorkerRuntimePolicy, LocalWorkerRuntime, type LocalWorkerRuntimePolicy } from '@kubeclaw/worker-core';
import type { TestPlanRunnerOptions, WorkerAttemptRuntime } from './runner-types.ts';
import { assertPlanIdentity } from './runner-plan-identity.ts';
import { containedRelative, secureDirectory } from './runner-paths.ts';
import { createBusterWorkerProfiles } from './runner-worker-profile.ts';
const MAX_TIMER_MS = 2_147_483_647;
const WORKER_RESULT_WRAPPER_BYTES = 4096;

export function validateRunnerOptions(options: TestPlanRunnerOptions) {
"""+validation+'''    return workerLocalRuntime;
}

'''
c=s.index('    this.#options =',b);paths=s[b:c];paths=paths.replace('this.#workspaceRoot = fs.realpathSync(options.workspaceRoot);','const workspaceRoot = fs.realpathSync(options.workspaceRoot);').replace('this.#workspaceRoot','workspaceRoot')
# break at secureDirectory: all mutable workspace/artifact operations remain first.
split=paths.index('    const observabilityRoot =')
workspace=paths[:split];rest=paths[split:]
text+='''function prepareWorkspace(options: TestPlanRunnerOptions) {
'''+workspace+'''    return { workspaceRoot, artifactRoot };
}

export function prepareRunnerPaths(options: TestPlanRunnerOptions) {
    const { workspaceRoot, artifactRoot } = prepareWorkspace(options);
'''+rest+'''    return { workspaceRoot, artifactRoot, observabilityRoot };
}

'''
s=s[:a]+'''    const workerLocalRuntime = validateRunnerOptions(options);
    const { workspaceRoot, artifactRoot, observabilityRoot } = prepareRunnerPaths(options);
    this.#workspaceRoot = workspaceRoot;
'''+s[c:]
a=s.index('    if (options.workerRuntime) {',s.index('  constructor('));b=s.index('\n  async run()',a);runtime=s[a:b];assert runtime.endswith('  }\n')
runtime=runtime[:-4];runtime=runtime.replace('this.#workerRuntime = options.workerRuntime;', 'return options.workerRuntime;').replace('this.#workerRuntime = runtime;', 'return runtime;').replace('now: this.#now,','now,')
text+='''export function configuredWorkerRuntime(options: TestPlanRunnerOptions,
  workerLocalRuntime: LocalWorkerRuntimePolicy, now: () => Date): WorkerAttemptRuntime {
'''+runtime+'''}
'''
s=s[:a]+'''    this.#workerRuntime = configuredWorkerRuntime(options, workerLocalRuntime, this.#now);
  }
'''+s[b:]
p.write_text("import { validateRunnerOptions, prepareRunnerPaths, configuredWorkerRuntime } from './runner-setup.ts';\n"+s);(root/'runner-setup.ts').write_text(text)
print({'setupLines':len(text.splitlines()),'runnerLines':len(s.splitlines())})
