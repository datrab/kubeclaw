from pathlib import Path
import json,hashlib,difflib
root=Path(__file__).resolve().parent
rel=Path('skills/buster/engine/test-gates'); file=root/'files'/rel/'runner.ts'; s=file.read_text(); original=s
proof=[]
def extract(name,start,end,header,exports):
 global s
 begin=s.index(start); finish=s.index(end,begin); body=s[begin:finish]
 s=s[:begin]+s[finish:]
 exportbody=body
 for symbol,kind in exports:
  token=f'{kind} {symbol}'
  if f'export {token}' not in exportbody:exportbody=exportbody.replace(token,f'export {token}',1)
 dest=root/'files'/rel/name;dest.write_text(header+exportbody)
 proof.append({'path':str(rel/name),'originalBodySha256':hashlib.sha256(body.encode()).hexdigest(),'bodyChanges':'export modifiers only','originalBody':body})
 return [sym for sym,_ in exports]
values_header='''import crypto from 'node:crypto';
import { canonical } from './canonical-value.ts';
import { validatePipelineTestGateContract, type AttemptResultV1, type ExecutionState, type NodeResultV1, type ReceiptRefV1, type ResolvedPlanNodeV1, type ResolvedTestPlanV1, type TerminalNodeState, type TestOutcome } from '@kubeclaw/pipeline-test-gate-contract';
'''
# Adjacent foundational helpers are moved first; result helpers append without body edits.
base=extract('runner-values.ts','function compareText(', 'function containedRelative(',values_header,[('compareText','function'),('digest','function'),('freeze','function'),('detail','function')])
paths=extract('runner-paths.ts','function containedRelative(', 'function assertPlanIdentity(',"import fs from 'node:fs';\nimport path from 'node:path';\n",[('containedRelative','function'),('secureDirectory','function')])
identity=extract('runner-plan-identity.ts','function assertPlanIdentity(', 'function createLogCapture(',"import { validatePipelineTestGateContract, type ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';\nimport type { RegistrySnapshot } from '@kubeclaw/plugin-foundation/registry/types';\nimport { canonical } from './canonical-value.ts';\nimport { digest } from './runner-values.ts';\n",[('assertPlanIdentity','function')])
logs=extract('runner-log-capture.ts','function createLogCapture(', 'function terminalResult(',"import fs from 'node:fs';\nimport path from 'node:path';\nimport type { DeclaredEvidenceV1 } from '@kubeclaw/pipeline-test-gate-contract';\nimport type { TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';\ninterface LogCapture {\n readonly contextLog: TestProviderExecutionContext['log'];\n readonly bytes: () => number;\n readonly exceeded: () => boolean;\n readonly write: (directory: string) => DeclaredEvidenceV1 | null;\n}\n",[('createLogCapture','function')])
# Remove old now duplicated LogCapture interface only.
a=s.index('interface LogCapture {');b=s.index('class RunnerFault',a);s=s[:a]+s[b:]
# collect short value functions around providerEntry (identity helper retained for later cohesive profile extraction)
for start,end,symbols in [('function terminalResult(','function providerEntry(',['terminalResult']),('function selectedEvidenceTypes(','function invocationInputs(',['selectedEvidenceTypes','receipt','resultIdentity','finalNodeResult'])]:
 a=s.index(start);b=s.index(end,a);body=s[a:b];s=s[:a]+s[b:];t=root/'files'/rel/'runner-values.ts';changed=body
 for symbol in symbols:changed=changed.replace('function '+symbol,'export function '+symbol,1)
 t.write_text(t.read_text()+changed);base.extend(symbols)
 proof.append({'path':str(rel/'runner-values.ts'),'originalBodySha256':hashlib.sha256(body.encode()).hexdigest(),'bodyChanges':'export modifiers only','originalBody':body})
imports=f"import {{ {', '.join(base)} }} from './runner-values.ts';\nimport {{ {', '.join(paths)} }} from './runner-paths.ts';\nimport {{ assertPlanIdentity }} from './runner-plan-identity.ts';\nimport {{ createLogCapture }} from './runner-log-capture.ts';\n"
file.write_text(imports+s)
# Capture exact extracted bodies privately, so a reviewer can compare beyond claims.
(root/'support-extraction-preservation.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'privateModules':4,'runnerLines':len((imports+s).splitlines()),'status':'unexecuted draft; imports and remaining decomposition pending'}))
