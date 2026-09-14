import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import yaml from 'js-yaml';

const source = path.resolve(import.meta.dirname, '../../..');
test('original Argo installer installs exact health text and annotation tracking through pinned Helm chart', () => {
  const chart = process.env.ARGO_HELM_CHART_ROOT;
  assert.ok(chart, 'Set ARGO_HELM_CHART_ROOT to original argo-cd 10.8.0 chart with redis-ha 4.38.0 dependency');
  const metadata = yaml.load(fs.readFileSync(path.join(chart, 'Chart.yaml'), 'utf8'));
  assert.equal(metadata.version, '10.8.0'); assert.equal(metadata.appVersion, 'v3.5.2');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'argocd-installer-'));
  try {
    const bin = path.join(temporary, 'bin'); fs.mkdirSync(bin);
    const output = path.join(temporary, 'rendered.yaml'), log = path.join(temporary, 'calls.log');
    const script = `${process.execPath}`;
    fs.writeFileSync(path.join(bin, 'helm'), `#!${script}\nconst fs=require('node:fs'),cp=require('node:child_process');const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(['helm',...a])+'\\n');if(a[0]==='repo')process.exit(0);if(a[0]!=='upgrade'||a[3]!=='argo/argo-cd')throw Error('Unexpected Helm mutation');const flags=[];for(const key of ['--values','--set-string','--set-file']){const i=a.indexOf(key);if(i<0)throw Error('Missing '+key);flags.push(key,a[i+1]);}const manifest=cp.execFileSync(${JSON.stringify(process.env.HELM_BIN ?? 'helm')},['template','argocd',${JSON.stringify(chart)},'--namespace','argocd',...flags],{encoding:'utf8',maxBuffer:32*1024*1024});fs.writeFileSync(${JSON.stringify(output)},manifest);\n`, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, 'kubectl'), `#!${script}\nconst fs=require('node:fs'),a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(['kubectl',...a])+'\\n');if(a[0]==='create')process.stdout.write('apiVersion: v1\\nkind: Namespace\\nmetadata: {name: argocd}\\n');else if(a[0]==='apply'&&a[2]==='-')fs.readFileSync(0);else if(a[0]!=='apply')throw Error('Unexpected kubectl command');\n`, { mode: 0o755 });
    const values = path.join(temporary, 'private.yaml');
    fs.writeFileSync(values, 'configs:\n  cm:\n    application.resourceTrackingMethod: label\n');
    execFileSync('bash', [path.join(source, 'scripts/deploy-argocd.sh')], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ARGOCD_VALUES_FILE: values } });
    const docs = yaml.loadAll(fs.readFileSync(output, 'utf8')).filter(Boolean);
    const cm = docs.find(doc => doc.kind === 'ConfigMap' && doc.metadata.name === 'argocd-cm');
    assert.equal(cm.data['application.resourceTrackingMethod'], 'annotation');
    assert.equal(cm.data['resource.customizations.health.argoproj.io_Application'], fs.readFileSync(path.join(source, 'charts/gitops/files/application-health.lua'), 'utf8'));
    assert.equal(cm.data['resource.customizations.useOpenLibs.argoproj.io_Application'], undefined);
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const install = calls.find(call => call[0] === 'helm' && call[1] === 'upgrade');
    assert.equal(install[install.indexOf('--version') + 1], '10.8.0');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
