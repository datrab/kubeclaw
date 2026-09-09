import type {Demo} from './demo.ts';
import {canonicalJson, sha256Text, parseReviewSource, type StageDefinition} from '@kubeclaw/plugin-sdk';

type ObjectValue = Record<string, any>;
function object(value: unknown, fields: string[], label: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key))) throw new Error(`PROJECT_SOURCE_INVALID:${label}`);
  return value as ObjectValue;
}
function relative(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || /[\\\x00-\x1f:]/u.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('PROJECT_SOURCE_PATH_INVALID');
  return value;
}
function paths(value: unknown): string[] {
  if (!Array.isArray(value) || new Set(value).size !== value.length) throw new Error('PROJECT_SOURCE_PATHS_REQUIRED');
  return value.map(relative);
}
function moduleSource(module: ObjectValue) {
  const declaration = object(module.blueprint, ['modulePath','substeps','serveDockerfile','apiSpecFile'], 'blueprint');
  const modulePath = relative(declaration.modulePath);
  const substeps = declaration.substeps === undefined ? undefined : paths(declaration.substeps);
  if (substeps?.length === 0) throw new Error('PROJECT_SOURCE_SUBSTEPS_REQUIRED');
  const serveDockerfile = declaration.serveDockerfile === null ? null : relative(declaration.serveDockerfile);
  const apiSpecFile = declaration.apiSpecFile === null ? null : relative(declaration.apiSpecFile);
  return {moduleId:module.id,modulePath,...(substeps ? {substeps}:{}),ownedPaths:module.ownedPaths,serveDockerfile,apiSpecFile};
}

/** One source admission and one sync precede the entire sequential publication lane. */
export function sourceStages(project: ObjectValue, ordered: ObjectValue[], demo?:Demo) {
  const architecture = object(project.architecture, ['ref','requiredFiles','review'], 'architecture');
  if (typeof architecture.ref !== 'string' || !architecture.ref.trim() || /[\x00-\x20]/u.test(architecture.ref)) throw new Error('PROJECT_ARCHITECTURE_REF_REQUIRED');
  const requiredFiles = paths(architecture.requiredFiles).sort();
  const modules = ordered.map(moduleSource);
  const controlPaths = [...new Set([...requiredFiles,...modules.flatMap(module => module.substeps
    ? module.substeps.map(substep => `${module.modulePath}/${substep}/FORGE.md`) : [`${module.modulePath}/FORGE.md`])])].sort();
  const source = parseReviewSource({projectId:project.id,repositoryRoot:project.repositoryRoot,architectureRef:architecture.ref,paths:controlPaths});
  const contract = {projectId:project.id,baseRevision:project.baseRevision,requiredFiles,modules,
    policy:{...(demo===undefined?{}:{demo}),modules:ordered.map(module => ({moduleId:module.id,task:module.task,dependsOn:module.dependsOn,requirements:module.requirements,requiredChecks:module.test.requiredChecks})),
      integrationRequirements:project.final.integrationRequirements,requiredChecks:project.final.test.requiredChecks}};
  const binding = {stageId:'source-preflight',inputDigest:sha256Text(canonicalJson(contract)),
    ...(architecture.review ? {reviewStageId:'architecture-review'}:{})};
  const execution = {maxAttempts:1,maxRemediationCycles:0,timeoutMs:120000};
  const stages: StageDefinition[] = [{id:'source-preflight',type:'kubeclaw.validate.source-preflight',dependsOn:[],config:{},
    input:{source,contract},execution}];
  if (architecture.review !== undefined) {
    const review = object(architecture.review,['agent','approval'],'review');
    if (typeof review.agent !== 'string' || !review.agent.trim()) throw new Error('PROJECT_ARCHITECTURE_AGENT_REQUIRED');
    const approval = object(review.approval,['target','issuerId','timeoutMinutes'],'approval');
    if (typeof approval.target !== 'string' || !approval.target.trim() || typeof approval.issuerId !== 'string' || !approval.issuerId.trim()) throw new Error('PROJECT_ARCHITECTURE_APPROVAL_REQUIRED');
    stages.push({id:'architecture-review',type:'kubeclaw.validate.architecture',dependsOn:['source-preflight'],config:{agent:review.agent},
      input:{task:'Review the declared project architecture and module requirements in the supplied immutable subject.',sourceBinding:binding},execution});
    stages.push({id:'architecture-approval',type:'kubeclaw.decision.architecture-approval',dependsOn:['architecture-review'],config:approval,
      input:{summary:`Architecture findings for ${project.id}`,artifactId:'architecture-validation',namespace:'kubeclaw.architecture-validator'},
      activation:{sourceStage:'architecture-review',fact:'architecture.review',equals:'approval_required'},
      // One invocation creates the durable wait; a second consumes its bound decision.
      execution:{...execution,maxAttempts:2}});
  }
  stages.push({id:'blueprint-sync',type:'kubeclaw.generate.blueprint-sync',dependsOn:[architecture.review ? 'architecture-approval':'source-preflight'],config:{},
    input:{blueprintId:project.id,repositoryRoot:project.repositoryRoot,branchRef:architecture.ref,controlPaths,sourceBinding:binding},execution});
  return {stages,binding};
}
