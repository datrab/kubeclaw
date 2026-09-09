import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import YAML from 'yaml';

const read=name=>{
  const doc=YAML.parseDocument(fs.readFileSync(`.github/workflows/${name}.yaml`,'utf8'),{uniqueKeys:true});
  assert.deepEqual(doc.errors,[]); return doc.toJS();
};
const ops=read('build-ops-mcp'),docs=read('docs-checks');
// Evaluate only the explicit boolean/ref/event subset used by these workflow guards.
// This is YAML policy evidence, not execution by GitHub or a token-permission test.
function enabled(job,event,ref){
  const expression=job.if;
  assert.equal(typeof expression,'string');
  assert.match(expression,/^[a-z_.' /()!=&|]+$/u);
  const names=expression.replace(/'[^']*'/gu,'').match(/[a-z_.]+/gu)??[];
  assert(names.every(name=>['github.event_name','github.ref'].includes(name)));
  return Function('github',`"use strict"; return (${expression});`)({event_name:event,ref});
}
const trusted=(event,ref)=>['push','workflow_dispatch'].includes(event)&&ref==='refs/heads/main';

test('parsed job guards keep PRs and non-main dispatches read-only',()=>{
  for(const workflow of [ops,docs]){
    assert.deepEqual(workflow.permissions,{contents:'read'});
    assert(!workflow.on.pull_request_target); assert(!workflow.on.workflow_run);
    assert.deepEqual(workflow.on.push.branches,['main']);
    for(const event of ['pull_request','pull_request_target','push','workflow_dispatch','workflow_run']){
      for(const ref of ['refs/heads/main','refs/heads/feature','refs/pull/17/merge','refs/tags/main']){
        for(const job of Object.values(workflow.jobs)){
          if(Object.values(job.permissions??{}).includes('write'))assert.equal(enabled(job,event,ref),trusted(event,ref));
        }
        assert.equal(enabled(workflow.jobs.validate,event,ref),event==='pull_request'||(event==='workflow_dispatch'&&ref!=='refs/heads/main'));
      }
    }
  }
});

test('read-only jobs cannot publish, persist checkout credentials or pass artifacts forward',()=>{
  for(const workflow of [ops,docs]){
    const job=workflow.jobs.validate;
    assert.deepEqual(job.permissions,{contents:'read'});
    const text=JSON.stringify(job);
    assert.doesNotMatch(text,/secrets\.|github\.token|login-action|upload-artifact|git push/u);
    for(const step of job.steps){
      if(step.uses?.startsWith('actions/checkout@'))assert.equal(step.with['persist-credentials'],false);
      assert.notEqual(step.with?.push,true);
    }
  }
  const build=ops.jobs.validate.steps.find(s=>s.id==='build');assert.equal(build.with.load,true);assert.equal(build.with.push,false);
  assert(ops.jobs.validate.steps.some(s=>s.run?.includes('bash ops/pod/test-image.sh')));
  assert(ops.jobs.validate.steps.some(s=>s.run?.includes('bash tools/ops-mcp/test-image.sh')));
  assert(docs.jobs.validate.steps.some(s=>s.run?.includes('Generated docs are stale')&&!s.if));
});

test('trusted publication rebuilds source and retains digest smoke and receipt authority',()=>{
  const job=ops.jobs.publish;
  assert.equal(job.needs,undefined);
  assert.deepEqual(job.permissions,{contents:'read',packages:'write'});
  assert.doesNotMatch(JSON.stringify(job),/download-artifact|cache-from|cache-to/u);
  const build=job.steps.find(s=>s.id==='publish');assert.equal(build.with.context,'${{ matrix.context }}');assert.equal(build.with.push,true);
  assert.equal(build.with.provenance,'mode=max');assert.equal(build.with.sbom,true);
  const smoke=job.steps.find(s=>s.name==='Exercise the exact published artifact and record its receipt');
  assert(smoke.env.IMAGE.endsWith('@${{ steps.publish.outputs.digest }}'));
  for(const command of ['docker pull "$IMAGE"','bash ops/pod/test-image.sh "$IMAGE"','bash tools/ops-mcp/test-image.sh "$IMAGE"','commit:process.env.GITHUB_SHA'])assert(smoke.run.includes(command));
  const upload=job.steps.find(s=>s.uses?.startsWith('actions/upload-artifact@'));
  assert(job.steps.indexOf(upload)>job.steps.indexOf(smoke));assert.equal(upload.with['if-no-files-found'],'error');
  assert.equal(ops.jobs['preserve-receipts'].needs,'publish');assert.equal(ops.jobs['preserve-receipts'].if,job.if);
  assert.equal(ops.jobs['preserve-receipts'].uses,'./.github/workflows/publish-image-receipts.yaml');
  assert.deepEqual(job.strategy.matrix,ops.jobs.validate.strategy.matrix);
});

test('trusted docs check before a scoped main-only commit and consume no validation artifacts',()=>{
  const job=docs.jobs.update;assert.equal(job.needs,undefined);
  assert.doesNotMatch(JSON.stringify(job),/download-artifact|cache:|head_ref/u);
  assert.equal(job.steps.find(s=>s.uses?.startsWith('actions/checkout@')).with.ref,'${{ github.sha }}');
  const commit=job.steps.find(s=>s.name==='Commit generated docs');assert.equal(job.steps.at(-1),commit);
  assert.match(commit.run,/git add docs\/generated docs\/reference/u);
  assert.match(commit.run,/git push origin HEAD:refs\/heads\/main/u);
  assert.doesNotMatch(commit.run,/--force|git add \./u);
  for(const command of ['npm run docs:check:generated','node scripts/docs-check.mjs','npm run docs:check:refs','npm run docs:check:coverage','git diff --check'])assert(job.steps.some(s=>s.run===command));
});

test('every external action in the two entrypoints is commit pinned',()=>{
  for(const workflow of [ops,docs])for(const job of Object.values(workflow.jobs))for(const step of job.steps??[]){
    if(step.uses)assert.match(step.uses,/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+@[a-f0-9]{40}$/u);
  }
});
