import fs from 'node:fs';
import ts from 'typescript';
const dir='skills/common/plugin-runtime/foundation/observability/';
const source=fs.readFileSync('docs/review/evidence/attempt-store-quality-20260921/durable-attempts.before.ts','utf8');
const tree=ts.createSourceFile('durable-attempts.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const cls=tree.statements.find(node=>ts.isClassDeclaration(node));
const member=name=>cls.members.find(node=>node.name?.getText(tree)===name).getText(tree);
const fn=name=>tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name.text===name).getText(tree);
const standalone=name=>member(name).replace(`async ${name}(`,`export async function ${name}(store: AttemptState, `)
 .replaceAll('this.#storeClosureUnlocked(', 'storeClosureUnlocked(store, ')
 .replaceAll(/this\.#(\w+)/g,'store.$1');
const typeNames=['DurableAttemptStoreLimits','DurableEvidenceInput','DurableEvidenceMetadata','DurableCompletionIntent','DurableResultMetadata','DurableAttemptStoreSnapshot','DurableResultOwner','RequiredProducerClosure'];
const typeImport=`import type {${typeNames.join(',')}} from './durable-attempts.ts';\n`;
const importsObs=`import {canonicalJson,validatePipelineObservabilityContract,type ProducerIdentityV1,type ProducerClosureV1,type ObservabilityCompletenessV1,type ProducerGapReportV1,type UnresolvedObservabilityItemV1} from '@kubeclaw/pipeline-observability-contract';\n`;
const importsState="import type {AttemptState} from './attempt-state.ts';\n";
const importsAdmission="import type {FileObservabilityAdmissionStore,AdmittedRecordView} from './durable-delivery.ts';\n";
const helpers=['requireIdentity','digest','sameProducer','syncDirectory','durableBlob','cleanupStaging','cleanupUnreferencedBlobs','scopedEvidenceId'];
let evidence="import fs from 'node:fs/promises';\nimport type {Dirent} from 'node:fs';\nimport path from 'node:path';\nimport {createHash,randomUUID} from 'node:crypto';\nimport {pathToFileURL} from 'node:url';\nimport type {WorkerEvidenceRefV1} from '@kubeclaw/pipeline-worker-core-contract';\nimport {ensureDirectoryDurable} from './durable-delivery.ts';\n"+importsObs+typeImport+importsState;
evidence+=helpers.map(name=>fn(name).replace(/^export /u,'').replace(/^(async )?function/u,'export $1function').replace('import("node:fs").Dirent<string>[]','Dirent<string>[]')).join('\n\n');
evidence+='\n'+standalone('storeEvidence')+'\n';fs.writeFileSync(dir+'attempt-evidence.ts',evidence);
let state="import path from 'node:path';\nimport {canonicalJson} from '@kubeclaw/pipeline-observability-contract';\nimport {decodeAttemptState,encodeAttemptState,type AttemptProjections,type PersistedAttempt} from './attempt-projection.ts';\nimport type {ClosureProjections} from './closure-projection.ts';\nimport {assertAttemptReplay} from './attempt-replay.ts';\nimport {cleanupStaging,cleanupUnreferencedBlobs} from './attempt-evidence.ts';\nimport {readDurableState,writeDurableState,withDurableStoreLock} from './durable-delivery.ts';\n"+typeImport;
state+=source.slice(source.indexOf('const EMPTY_STATE'),source.indexOf('function requireIdentity'));
state+='\nexport class AttemptState {\nreadonly root:string;\nreadonly file:string;\nreadonly limits:DurableAttemptStoreLimits;\n#queue:Promise<unknown>=Promise.resolve();\nclosureProjections:ClosureProjections=new Map();\nprojections:AttemptProjections=new Map();\n';
state+=cls.members.find(ts.isConstructorDeclaration).getText(tree).replaceAll(/this\.#(root|file|limits)/g,'this.$1')+'\n';
for(const name of ['#serial','#readState','#writeState','#checkSize','#reclaimExpiredEvidence'])state+=member(name).replaceAll(/#(?!queue)(\w+)/g,'$1')+'\n';
state+='}\n';fs.writeFileSync(dir+'attempt-state.ts',state);
let results="import fs from 'node:fs/promises';\nimport {canonicalJson,type ProducerClosureV1} from '@kubeclaw/pipeline-observability-contract';\nimport {validatePipelineWorkerCoreContract,type WorkerAttemptResultV1} from '@kubeclaw/pipeline-worker-core-contract';\nimport {assertCompletionIntent} from './attempt-replay.ts';\nimport {requireIdentity,digest,cleanupUnreferencedBlobs} from './attempt-evidence.ts';\nimport {storeClosureUnlocked} from './attempt-completeness.ts';\n"+typeImport+importsState+importsAdmission;
results+=standalone('storeResult')+'\n'+standalone('resumeCompletion')+'\n';fs.writeFileSync(dir+'attempt-results.ts',results);
let completeness="import fs from 'node:fs/promises';\nimport {createHash} from 'node:crypto';\nimport {sameProducer,scopedEvidenceId,digest} from './attempt-evidence.ts';\n"+importsObs+typeImport+importsState+importsAdmission;
completeness+=member('#storeClosureUnlocked').replace('async #storeClosureUnlocked(','export async function storeClosureUnlocked(store: AttemptState, ').replaceAll(/this\.#(\w+)/g,'store.$1')+'\n';
completeness+=standalone('storeClosure')+'\n'+standalone('evaluateCompleteness')+'\n';fs.writeFileSync(dir+'attempt-completeness.ts',completeness);
let retirement="import path from 'node:path';\nimport {canonicalJson} from '@kubeclaw/pipeline-observability-contract';\nimport {closureKey,closureIntentDigest,type ClosureRetirementIntent,type ClosureReference} from './closure-projection.ts';\nimport {completionRetirementSource,type AdmissionRetiredEntry} from './admission-retirement.ts';\nimport {createAttemptProjection,attemptProjectionKey,attemptStoreDigest,assertAttemptRetirementIntent,readAttemptJournalPrefix,replaceAttemptProjectionSync,encodeAttemptState,type AttemptRetirementIntent} from './attempt-projection.ts';\nimport {assertAttemptReplay} from './attempt-replay.ts';\n"+importsState+importsAdmission;
for(const name of ['retireAdmissionCompletion','retireImportedResult','retireImportedClosure'])retirement+=standalone(name)+'\n';fs.writeFileSync(dir+'attempt-retirement.ts',retirement);
let facade="import {producerClosureDigest,type ObservabilityCompletenessV1,type ProducerClosureV1,type ProducerGapReportV1,type ProducerIdentityV1,type ProducerRecordV1,type UnresolvedObservabilityItemV1} from '@kubeclaw/pipeline-observability-contract';\nimport type {WorkerAttemptResultV1,WorkerEvidenceRefV1} from '@kubeclaw/pipeline-worker-core-contract';\nimport type {ClosureRetirementIntent} from './closure-projection.ts';\nimport type {AttemptRetirementIntent} from './attempt-projection.ts';\nimport type {AdmissionRetiredEntry} from './admission-retirement.ts';\nimport type {FileObservabilityAdmissionStore} from './durable-delivery.ts';\nimport {AttemptState} from './attempt-state.ts';\nimport {storeEvidence} from './attempt-evidence.ts';\nimport {storeResult,resumeCompletion} from './attempt-results.ts';\nimport {storeClosure,evaluateCompleteness} from './attempt-completeness.ts';\nimport {retireAdmissionCompletion,retireImportedResult,retireImportedClosure} from './attempt-retirement.ts';\nexport {scopedEvidenceId} from './attempt-evidence.ts';\n";
facade+=source.slice(source.indexOf('export interface DurableAttemptStoreLimits'),source.indexOf('const EMPTY_STATE'));
facade+='export class FileDurableAttemptStore {\nreadonly #state:AttemptState;\nconstructor(root:string,limits:DurableAttemptStoreLimits){this.#state=new AttemptState(root,limits);}\nstorageDirectory():string{return this.#state.root;}\n';
for(const name of ['storeEvidence','storeResult','resumeCompletion','retireAdmissionCompletion','retireImportedResult','retireImportedClosure','storeClosure','evaluateCompleteness']) {
 const m=cls.members.find(node=>node.name?.getText(tree)===name);
 const params=m.parameters.map(p=>p.getText(tree)).join(',\n');const args=m.parameters.map(p=>p.name.getText(tree)).join(',');
 facade+=`async ${name}(${params}):${m.type.getText(tree)} {return ${name}(this.#state,${args});}\n`;
}
facade+=member('snapshot').replaceAll('this.#serial','this.#state.serial').replaceAll('this.#readState','this.#state.readState').replaceAll('this.#reclaimExpiredEvidence','this.#state.reclaimExpiredEvidence')+'\n}\n'+fn('createProducerClosure')+'\n';fs.writeFileSync(dir+'durable-attempts.ts',facade);
