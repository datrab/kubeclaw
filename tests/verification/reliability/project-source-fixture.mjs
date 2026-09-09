import fs from 'node:fs';
import path from 'node:path';
import {buildRegistry, discoverPackages, resolveTestPlan} from '../../../skills/nova/core/src/index.ts';
import {gateCoverageDigest} from '../../../contracts/pipeline-test-gate/v1/src/index.ts';
import {compileProject} from '../../../skills/nova/project/compiler.ts';
import {sourceApprovalFixture} from './approval-source-fixture.mjs';

export async function projectSourceFixture(root,{invalid=false,review=false,clean=true}={}) {
  const f=await sourceApprovalFixture(root,clean);
  try {
  const ids=['api','ui'];
  f.git('checkout','-q','architecture');
  for(const moduleId of ids){
    fs.mkdirSync(path.join(f.repository,'modules',moduleId),{recursive:true});
    fs.writeFileSync(path.join(f.repository,'modules',moduleId,'FORGE.md'),invalid && moduleId==='api'
      ? 'Do not deliver api.mjs. This belongs to another project.'
      : '```kubeclaw-deliverables\n'+JSON.stringify({schemaVersion:'forge-deliverables.v1',moduleId,substep:null,deliverables:[`${moduleId}.mjs`]})+'\n```');
  }
  f.git('add','.');f.git('commit','-qm','Explicit authored module declarations');f.git('checkout','-q','main');
  const installation=f.platform.installationRoots[0];
  fs.cpSync('skills/nova/plugins/preflight-contract',path.join(installation,'preflight-contract'),{recursive:true});
  f.platform.grants['kubeclaw.preflight-contract:source']={'git.repository.read':{allowedPrefixes:['.']},'artifacts.write':{allowedNamespaces:['kubeclaw.preflight-contract']}};
  for(const grant of Object.values(f.platform.grants))for(const capability of ['artifacts.read','artifacts.write']){
    if(grant[capability])grant[capability].allowedNamespaces=[...new Set([...grant[capability].allowedNamespaces,'kubeclaw.preflight-contract'])];
  }
  if(!review)for(const registration of ['kubeclaw.architecture-validator:architecture','kubeclaw.human-approval:architecture-approval','kubeclaw.operator-messaging:operator'])delete f.platform.grants[registration];
  const registryRoot=path.join(root,'provider-registry');
  fs.mkdirSync(registryRoot);
  for (const plugin of ['direct-command', 'junit-report-adapter']) {
    fs.cpSync(`skills/buster/plugins/${plugin}`, path.join(registryRoot, plugin), {recursive:true});
  }
  const registry=buildRegistry(discoverPackages({installationRoots:[registryRoot],trustPolicy:{trustedBuiltinRoots:[registryRoot],allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'source-contract-regression'}}));
  const runId='run:project-source';
  const modules=ids.map(id=>({id,dependsOn:id==='ui'?['api']:[],task:`Produce ${id}.mjs from its reviewed blueprint.`,ownedPaths:[`${id}.mjs`],requirements:[{id:`${id}-exists`,statement:`${id}.mjs implements its declared module.`}],
    blueprint:{modulePath:`modules/${id}`,serveDockerfile:`${id}.mjs`,apiSpecFile:null},implementation:{agent:'forge'},lint:{policyPath:path.join(root,'lint.json'),policyProject:'source'}}));
  function testPlan(selected,kind){
    const requiredChecks=[{checkId:'declared-tests',requirementRefs:selected.map(module=>({moduleId:module.id,requirementId:module.requirements[0].id})),nodeIds:['assertion']}];
    const unsigned={schemaVersion:'gate-coverage.v1',projectId:'source',kind,baseRevision:f.sourceRevision,modules:selected.map(module=>({moduleId:module.id,ownedPaths:module.ownedPaths,requirements:module.requirements})),integrationRequirements:[],requiredChecks};
    const limits={cpuMillis:30000,memoryBytes:512*1024*1024,logBytes:1048576,artifactBytes:1048576,artifactFiles:16,processes:16};
    const plan=resolveTestPlan({planId:`plan:${kind}:${selected[0].id}`,runId,project:'source',scope:kind==='module'?{moduleId:selected[0].id,gateId:null}:{moduleId:null,gateId:'final-test'},createdAt:'2026-09-09T00:00:00Z',registry,
      declaration:{coverage:{...unsigned,policyDigest:gateCoverageDigest(unsigned)},tests:{assertion:{uses:'kubeclaw.direct-command@1',mode:'blocking',config:{executable:'node',args:['--test'],workingDirectory:'.',resultMode:'exit-code'}}}},suiteTemplates:[],facts:{changedPaths:[],moduleType:'service',pipelineStage:'test'},
      policy:{defaultTimeoutMs:30000,maximumTimeoutMs:60000,defaultLimits:limits,maximumLimits:limits,maximumRetryCount:1,maximumMatrixSize:4,maximumNodes:8,defaultConcurrencyLimit:1,maximumConcurrencyLimits:{}}});
    return {requiredChecks,providerPlan:{repositoryId:'source',plan,grants:{assertion:['command.execute']},maximumConcurrency:1,submittedAt:plan.createdAt,timeoutMs:60000}};
  }
  for(const module of modules)module.test=testPlan([module],'module');
  const project={schemaVersion:'nova-project.v2',id:'source',runId,repositoryRoot:f.repository,workspaceRoot:path.join(root,'workspaces'),baseRevision:f.sourceRevision,
    architecture:{ref:'architecture',requiredFiles:['architecture.md','plan.json'],...(review?{review:{agent:'architect',approval:{target:'operators',issuerId:'operator:test'}}}:{})},modules,
    final:{lint:modules[0].lint,integrationRequirements:[],test:testPlan(modules,'cumulative')}};
  const compiled=compileProject(project);
  // Execute only this independently bounded source/Git/transport contract prefix.
  // Lint, remote providers and LLM verdict quality are not executed or claimed.
  const retained=new Set(['source-preflight','architecture-review','architecture-approval','blueprint-sync','implement-api','implement-ui']);
  const definition={...compiled.definition,stages:compiled.definition.stages.filter(stage=>retained.has(stage.id)).map(stage=>stage.id==='implement-ui'?{...stage,dependsOn:['implement-api']}:stage)};
  return {...f,project,compiled,definition,runId};
  } catch(error) { await f.close(); throw error; }
}
