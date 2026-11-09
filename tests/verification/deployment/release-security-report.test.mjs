import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanInventory, readScan, securityMarkdown, blocksRelease } from '../../../scripts/updates/security-report.mjs';

const reference = `example/image@sha256:${'a'.repeat(64)}`;
const item = { reference, sources: ['releases/ops-images.json:images.ops-mcp'], categories: ['Selected release'] };
function fixture(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-security-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, `${'a'.repeat(64)}.json`);
  fs.writeFileSync(file, JSON.stringify({ SchemaVersion: 2, ArtifactType: 'container_image',
    Metadata: { RepoDigests: [reference] }, Results: [], ...overrides }));
  return { dir, file };
}
const findings = [{ VulnerabilityID: 'CVE-test', Severity: 'CRITICAL', PkgName: 'pkg', InstalledVersion: '1.0', FixedVersion: '1.1' },
  { VulnerabilityID: 'CVE-unfixed', Severity: 'HIGH', PkgName: 'pkg2', InstalledVersion: '2.0', Status: 'affected' }];

test('real inventory includes production overrides and deduplicates shared images without losing owners', () => {
  const inventory = scanInventory(process.cwd());
  assert.deepEqual(inventory.errors, []);
  assert.ok(inventory.images.some(x => x.sources.includes('versions.json:postgresqlProduction.image')));
  assert.ok(inventory.images.some(x => x.sources.includes('versions.json:litellmProduction.image')));
  assert.equal(inventory.images.filter(x => x.sources.some(s => s.startsWith('releases/runtime-images.json:'))).length, 10);
  const node = inventory.images.find(x => x.sources.includes('versions.json:buildArgs.OPS_NODE_BASE'));
  assert.ok(node.sources.includes('versions.json:buildArgs.OPS_MCP_NODE_BASE'));
  assert.equal(new Set(inventory.images.map(x => x.reference)).size, inventory.images.length);
});

test('completed vulnerable and clean scans differ from failed, missing, malformed and wrong-digest reports', t => {
  const {dir,file} = fixture(t, { Results: [{Target:'node_modules/pkg/package.json', Type:'node-pkg', Vulnerabilities: findings}] });
  const result = readScan(item, dir, 1);
  assert.equal(result.status, 'vulnerable');
  assert.equal(result.findings[0].fixed, '1.1');
  assert.equal(result.findings[1].fixed, null);
  assert.equal(result.findings[0].target, 'node_modules/pkg/package.json');
  assert.equal(readScan(item, dir, null).status, 'error');
  fs.writeFileSync(file, JSON.stringify({SchemaVersion:2, ArtifactType:'container_image', Metadata:{RepoDigests:[reference]}, Results:[]}));
  assert.equal(readScan(item, dir, 0).status, 'clean');
  assert.equal(readScan(item, dir, 1).status, 'error');
  assert.equal(readScan({...item, reference:reference.replaceAll('a'.repeat(64),'b'.repeat(64))},dir,0).status,'error');
  const data = JSON.parse(fs.readFileSync(file)); data.Metadata.RepoDigests = [`other@sha256:${'b'.repeat(64)}`];
  fs.writeFileSync(file,JSON.stringify(data));
  assert.equal(readScan(item,dir,0).status,'error');
  fs.writeFileSync(file,'{'); assert.equal(readScan(item,dir,0).status,'error');
  fs.unlinkSync(file); assert.equal(readScan(item,dir,0).status,'error');
});

test('actionable report preserves unfixed findings, source paths and errors, and bounds the issue with a full-report pointer', t => {
  const {dir} = fixture(t, {Results:[{Target:'pkg',Type:'node-pkg',Vulnerabilities:findings}]});
  const image=readScan(item,dir,1);
  const plan={generatedAt:'2026-10-26',runUrl:'https://github.com/datrab/kubeclaw/actions/runs/1',errors:['Missing release'],images:[image,{...item,status:'error',error:'Network failed',findings:[]}]};
  const body=securityMarkdown(plan);
  for(const text of ['1.0','1.1','CVE-test','No published fix','Missing release','Network failed','releases/ops-images.json:images.ops-mcp','promote the verified receipt']) assert.ok(body.includes(text),text);
  const large={...plan,images:[{...image,findings:Array.from({length:2000},(_,i)=>({...image.findings[0],package:`package-${i}`}))}]};
  const bounded=securityMarkdown(large,{limit:55000});
  assert.ok(bounded.length<55000);
  assert.match(bounded,/update-plan.md/);
  assert.ok(securityMarkdown(large).includes('package-1999'));
});


test('gate exempts only unfixed findings and re-blocks when a fix appears', t => {
  const {dir,file} = fixture(t, {Results:[{Vulnerabilities:[findings[1]]}]});
  let image = readScan(item,dir,1);
  assert.equal(image.status,'vulnerable');
  assert.equal(image.findings.length,1);
  assert.equal(blocksRelease(image),false);
  assert.match(securityMarkdown({images:[image],errors:[]}),/non-blocking/);
  const data = JSON.parse(fs.readFileSync(file));
  data.Results[0].Vulnerabilities.push(findings[0]);
  fs.writeFileSync(file,JSON.stringify(data));
  image = readScan(item,dir,1);
  assert.equal(blocksRelease(image),true);
  assert.equal(image.findings.length,2);
  assert.equal(blocksRelease(readScan(item,dir,2)),true);
  fs.unlinkSync(file);
  assert.equal(blocksRelease(readScan(item,dir,0)),true);
  assert.equal(blocksRelease({...item,status:'clean',findings:[]}),false);
});


test('gate CLI distinguishes deferred findings, blocking findings and scanner errors', t => {
  const {dir,file} = fixture(t, {Results:[{Vulnerabilities:[findings[1]]}]});
  const run = code => spawnSync(process.execPath, ['scripts/updates/security-gate.mjs',reference,dir,String(code)], {encoding:'utf8'});
  assert.equal(run(1).status,0);
  assert.match(run(1).stdout,/1 without published fix/);
  assert.equal(run(2).status,2);
  const data = JSON.parse(fs.readFileSync(file));
  data.Results[0].Vulnerabilities.push(findings[0]);
  fs.writeFileSync(file,JSON.stringify(data));
  assert.equal(run(1).status,1);
  fs.unlinkSync(file);
  assert.equal(run(0).status,2);
});

test('upstream exception matches exact unchanged findings and never masks owned fixes or baseline failures', async () => {
  const {deferInheritedOpenclaw,usesOpenclaw}=await import('../../../scripts/updates/upstream-security-policy.mjs');
  const upstreamFinding={id:'CVE-base',package:'upstream-lib',installed:'1',severity:'HIGH',fixed:'2',type:'node-pkg',target:'Node.js',packagePath:'app/node_modules/upstream-lib/package.json'};
  const upstream={reference:'pinned-openclaw@sha256:base',status:'vulnerable',findings:[upstreamFinding]};
  const image={status:'vulnerable',findings:[{...upstreamFinding},{...upstreamFinding,packagePath:'opt/our-plugin/node_modules/upstream-lib/package.json'}]};
  const result=deferInheritedOpenclaw(image,upstream);
  assert.equal(result.findings.length,2);
  assert.equal(result.findings[0].deferredReason,'retained-openclaw-upstream');
  assert.equal(result.findings[1].deferredReason,undefined);
  assert.equal(blocksRelease(result),true);
  assert.equal(blocksRelease({...result,findings:[result.findings[0]]}),false);
  assert.equal(blocksRelease(deferInheritedOpenclaw(image,{status:'error',error:'missing',findings:[]})),true);
  assert.equal(usesOpenclaw(`ghcr.io/datrab/kubeclaw-prism-agent@sha256:${'a'.repeat(64)}`),true);
  assert.equal(usesOpenclaw(`ghcr.io/datrab/kubeclaw-prism-worker@sha256:${'a'.repeat(64)}`),false);
});
