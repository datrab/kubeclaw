import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/** Original engine plugins/adapters and native Git/HTTP/artifact stores. */
export async function sourceApprovalFixture(root, clean = false, findingSeverity = 'warn') {
  const repository = path.join(root, 'repository'); const workspaces = path.join(root, 'workspaces');
  fs.mkdirSync(repository); fs.mkdirSync(workspaces);
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Regression'); git('config', 'user.email', 'regression@example.invalid');
  fs.writeFileSync(path.join(repository, 'architecture.md'), 'Stable API boundary\n');
  fs.writeFileSync(path.join(repository, 'plan.json'), '{"modules":["api"]}\n');
  git('add', '.'); git('commit', '-qm', 'Source'); const sourceRevision = git('rev-parse', 'HEAD');
  git('checkout', '-qb', 'architecture'); fs.writeFileSync(path.join(repository, 'plan.json'), '{"modules":["api","ui"]}\n');
  git('add', '.'); git('commit', '-qm', 'Reviewed plan'); const architectureRevision = git('rev-parse', 'HEAD'); git('checkout', '-q', 'main');
  const messages = []; const dispatches = []; const hooks = {};
  const server = http.createServer((request, response) => {
    const chunks = []; request.on('data', chunk => chunks.push(chunk)); request.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks)); response.setHeader('content-type', 'application/json');
        if (request.url === '/operator') { messages.push(body); response.end(JSON.stringify({ id: `message:${messages.length}` })); return; }
        dispatches.push(body);
        if (body.protocol === 'kubeclaw.architecture-validation.v2') {
          response.end(JSON.stringify({ result: { verdict: findingSeverity === 'blocking' ? 'blocked' : 'passed', summary: 'Reviewed immutable architecture and plan.',
            checkedFiles: body.reviewSubject?.paths ?? ['architecture.md', 'plan.json'], findings: clean ? [] : [{ id: 'api-owner', severity: findingSeverity, scope: 'integration_boundary', paths: ['architecture.md'], explanation: 'Confirm ownership.', remediation: 'Operator confirms.' }] } })); return;
        }
        const workspace = body.workspaceReference.workspacePath;
        const content = 'export const answer = 42;\n'; fs.writeFileSync(path.join(workspace, `${body.identity.moduleId}.mjs`), content);
        hooks.implementation?.(body);
        const now = new Date().toISOString();
        response.end(JSON.stringify({ result: { status: 'ready_for_testing', summary: 'Wrote deterministic module file.', changedPaths: [`${body.identity.moduleId}.mjs`], checks: [{ name: 'fixture-content', passed: fs.readFileSync(path.join(workspace, `${body.identity.moduleId}.mjs`), 'utf8') === content }],
          session: { sessionId: `native:${dispatches.length}`, startedAt: now, completedAt: now, transcriptDigest: createHash('sha256').update(JSON.stringify(body)).digest('hex'), handoffs: 0, termination: 'completed' } } }));
      } catch (error) { response.statusCode = 500; response.end(JSON.stringify({ error: String(error) })); }
    });
  }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const secretName = 'NOVA_SOURCE_APPROVAL_TEST_TOKEN'; const previous = process.env[secretName]; process.env[secretName] = 'native-private-test';
  const installation = path.join(root, 'installed'); fs.mkdirSync(installation);
  for (const source of [...['architecture-validator','human-approval','blueprint-sync','implementation-agent','repository-adapter'].map(name => `skills/nova/plugins/${name}`),
    ...['artifact-store','wait-store','operator-messaging','network-http','secret-resolver','runtime-dispatch','git-workspace','state-store'].map(name => `skills/common/plugins/${name}`)]) {
    fs.cpSync(source, path.join(installation, path.basename(source)), { recursive: true, filter: file => path.basename(file) !== 'node_modules' });
  }
  fs.symlinkSync(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  const allArtifacts = { allowedNamespaces: ['kubeclaw.architecture-validator','kubeclaw.human-approval','kubeclaw.blueprint-sync','kubeclaw.implementation-agent'] };
  const read = { allowedPrefixes: ['.'] }; const mutate = { allowedRoots: [repository, workspaces] };
  const workspace = { ...mutate, allowedWorkspaceRoots: [workspaces] };
  const platform = { schemaVersion: 'pipeline-platform.v2', installationRoots: [installation], trustedBuiltinRoots: [installation], externalTrust: { allowedSourceDigests: {}, verifiedAttestations: {} },
    providers: { 'artifacts.read':'kubeclaw.artifact-store:artifact-store','artifacts.write':'kubeclaw.artifact-store:artifact-store','signal.wait':'kubeclaw.wait-store:waits','operator.request':'kubeclaw.operator-messaging:operator',
      'network.http':'kubeclaw.network-http:http','secrets.read':'kubeclaw.secret-resolver:secrets','runtime.dispatch':'kubeclaw.runtime-dispatch:runtime','git.repository.read':'kubeclaw.repository-adapter:repository',
      ...Object.fromEntries(['git.workspace.create','git.workspace.remove','git.sync','git.commit','git.merge'].map(cap => [cap,'kubeclaw.git-workspace:git'])), 'state.append':'kubeclaw.state-store:state' },
    grants: { 'kubeclaw.architecture-validator:architecture': { 'runtime.dispatch':{allowedAgents:['architect']},'artifacts.read':allArtifacts,'artifacts.write':allArtifacts,'git.repository.read':read },
      'kubeclaw.human-approval:architecture-approval': {'artifacts.read':allArtifacts,'artifacts.write':allArtifacts,'git.repository.read':read,'operator.request':{allowedTargets:['operators']},'signal.wait':{allowedSignalTypes:['approval.resolved'],allowedIssuerIds:['operator:test']}},
      'kubeclaw.blueprint-sync:sync':{'git.sync':mutate,'git.commit':mutate,'state.append':{allowedNamespaces:['kubeclaw.blueprint-sync']},'artifacts.read':allArtifacts,'artifacts.write':allArtifacts},
      'kubeclaw.implementation-agent:implementation':{'runtime.dispatch':{allowedAgents:['forge']},'artifacts.read':allArtifacts,'artifacts.write':allArtifacts,'git.workspace.create':workspace,'git.workspace.remove':workspace,'git.commit':mutate,'git.merge':mutate},
      'kubeclaw.runtime-dispatch:runtime':{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['token']}},
      'kubeclaw.operator-messaging:operator':{'network.http':{allowedOrigins:[origin]},'secrets.read':{allowedNames:['token']}} },
    adapters: {'kubeclaw.artifact-store:artifact-store':{artifactRoot:path.join(root,'artifacts')},'kubeclaw.wait-store:waits':{root:path.join(root,'waits')},
      'kubeclaw.operator-messaging:operator':{deliveryRoot:path.join(root,'deliveries'),targets:{operators:{endpoint:`${origin}/operator`,tokenSecret:'token'}}},
      'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['content-type','idempotency-key','x-kubeclaw-signature']},'kubeclaw.secret-resolver:secrets':{environment:{token:secretName}},
      'kubeclaw.runtime-dispatch:runtime':{targets:{architect:{endpoint:`${origin}/agent`,tokenSecret:'token'},forge:{endpoint:`${origin}/agent`,tokenSecret:'token'}}},
      'kubeclaw.repository-adapter:repository':{repositoryRoot:repository},'kubeclaw.state-store:state':{root:path.join(root,'state-adapter')},
      'kubeclaw.git-workspace:git':{allowedRepositoryRoots:[repository],workspaceRoot:workspaces,gitExecutable:'/usr/bin/git',authorName:'Regression',authorEmail:'regression@example.invalid',maxExecutionMs:5000,maxOutputBytes:1048576,terminationGraceMs:100}},
    activeAdapters:[], observers:{},storageRoot:path.join(root,'state'),shutdownTimeoutMs:5000,orchestratorIssuerId:'nova',administrativeDecisionIssuers:[] };
  const execution = {maxAttempts:3,maxRemediationCycles:0,timeoutMs:10000};
  const definition = {schemaVersion:'pipeline-definition.v2',id:'test:source-approval',maxConcurrency:1,stages:[
    {id:'architecture',type:'kubeclaw.validate.architecture',dependsOn:[],config:{agent:'architect'},execution,input:{task:'Review these architecture and module plan bytes.',source:{projectId:'project:test',repositoryRoot:repository,architectureRef:'architecture',paths:['architecture.md','plan.json']}}},
    {id:'approval',type:'kubeclaw.decision.architecture-approval',dependsOn:['architecture'],config:{target:'operators',issuerId:'operator:test'},execution,input:{summary:'Approve exactly this source and plan.',artifactId:'architecture-validation',namespace:'kubeclaw.architecture-validator'}},
    {id:'sync',type:'kubeclaw.generate.blueprint-sync',dependsOn:['approval'],config:{},execution,input:{blueprintId:'project:test',repositoryRoot:repository,branchRef:'architecture',controlPaths:['architecture.md','plan.json']}},
    ...['api','ui'].map((moduleId,index) => ({id:moduleId,type:'kubeclaw.agent.implementation',dependsOn:[index?'api':'sync'],config:{agent:'forge'},execution,input:{runId:'rebound-by-core',moduleId,attempt:1,task:'Write deterministic module.',headBefore:sourceRevision,workspace:{repositoryRoot:repository,workspacePath:path.join(workspaces,moduleId),branch:moduleId,baseRef:'HEAD',mergeTarget:repository,commitMessage:`Implement ${moduleId}`}}})),
  ]};
  return { platform, definition, repository, git, sourceRevision, architectureRevision, messages, dispatches, hooks, async close() {server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); if(previous===undefined)delete process.env[secretName];else process.env[secretName]=previous;} };
}
