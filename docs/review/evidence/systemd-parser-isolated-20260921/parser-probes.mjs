import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { renderNativeWorkerNode } from '../../../../scripts/render-native-worker-node.mjs';
const directory = path.resolve('node_modules/.cache/systemd-parser-20260921/probes');
fs.mkdirSync(directory, {recursive:true});
const source = load(fs.readFileSync('my-values/infra/native-worker-pools.yaml','utf8'));
const unit = renderNativeWorkerNode({...source,nodeName:'native-policy-test',runtime:{containerdVersion:'v2.2.0-k3s1'}})['kubeclaw-native-pools.service'];
fs.writeFileSync(path.join(directory,'kubeclaw-native-pools.service'),unit);
fs.writeFileSync(path.join(directory,'malformed.service'),unit.replace(/^ExecStart=.*$/mu,'ExecStart=/a/nonexistent/executable-for-parser-negative-control'));

fs.writeFileSync(path.join(directory,'missing-start.service'),unit.replace(/^ExecStart=.*$/mu,''));
