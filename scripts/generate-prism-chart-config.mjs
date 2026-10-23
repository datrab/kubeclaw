import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureSwarmSettings } from '../skills/common/plugin-runtime/foundation/config/swarm.ts';
import { createPipelineGenerationReceipt } from '../skills/common/plugin-runtime/foundation/config/pipeline-generation.ts';
import { declaredPipelineServices } from './updates/pipeline-generation.mjs';

/** Build-only projection; Helm cannot independently author runtime policy. */
export function prismChartProjection(authorRoot) {
  const entryFile = path.join(authorRoot, 'pipeline.config.json');
  const root = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
  const controls = root.bindings.filter(binding => binding.role === 'prism' && binding.owner === 'prism-control' && binding.instanceId.endsWith('/prism-control'));
  if (controls.length !== 1) throw new Error('PRISM_CHART_COMPOSITION_REQUIRED');
  const [namespace, releaseName] = controls[0].instanceId.split('/');
  const services = declaredPipelineServices(authorRoot, { role: 'prism', namespace, releaseName });
  const captures = Object.fromEntries(services.map(selection => [selection.callerId, captureSwarmSettings(entryFile, selection)]));
  const generationDigest = createPipelineGenerationReceipt(captures['prism-control']).digest;
  if (Object.values(captures).some(capture => createPipelineGenerationReceipt(capture).digest !== generationDigest)) throw new Error('PRISM_CHART_GENERATION_CHANGED');
  const control = captures['prism-control'].components['prism-control'].settings;
  const workerControl = captures['prism-worker'].components['prism-control'].settings;
  if (control.controlInternalUrl !== workerControl.controlInternalUrl || control.maximumArtifactAcknowledgmentBytes !== workerControl.maximumArtifactAcknowledgmentBytes) throw new Error('PRISM_CHART_SHARED_CONTROL_PROFILE_MISMATCH');
  const worker = captures['prism-worker'].components['prism-worker'].settings;
  const execution = captures['prism-control'].components['prism-execution'].settings;
  return { schemaVersion: 'pipeline-prism-chart-projection.v1', generatedFrom: 'config/pipeline.config.json',
    generationDigest, deployment: { namespace, releaseName },
    profile: root.profile, features: root.features, tuning: root.tuning, overrides: root.overrides,
    operator: { prism: { control, studio: captures['prism-studio'].components['prism-studio'].settings,
      worker: worker.ingress, native: { ...execution, supervisor: worker.supervisor, dispatchTimeoutMs: control.dispatchTimeoutMs },
      ingestion: captures['prism-ingestion'].components['prism-control'].settings.ingestionServer } } };
}


/** These my-values fields are generated projections, not alternate policy authors. */
export function prismAgentBridgeProjection(authorRoot) {
  const root=JSON.parse(fs.readFileSync(path.join(authorRoot,'pipeline.config.json'),'utf8'));
  const bindings=root.bindings.filter(binding=>binding.role==='prism'&&binding.owner==='prism-control'&&binding.instanceId.endsWith('/prism-agent-bridge'));
  if(bindings.length!==1)throw new Error('PRISM_BRIDGE_COMPOSITION_REQUIRED');
  const [namespace,releaseName,container,...extra]=bindings[0].instanceId.split('/');
  if(extra.length||container!=='prism-agent-bridge')throw new Error('PRISM_BRIDGE_COMPOSITION_REQUIRED');
  const [service]=declaredPipelineServices(authorRoot,{role:'prism',namespace,releaseName,deployment:'agent-bridge'});
  const capture=captureSwarmSettings(path.join(authorRoot,'pipeline.config.json'),service);
  return {deployment:{namespace,releaseName},settings:capture.components['prism-control'].settings.agentBridge,
    toolPlugin:{controlUrl:capture.components['prism-control'].settings.agentToolControlUrl}};
}
function checkBridgeValues(repository) {
  const projection=prismAgentBridgeProjection(path.join(repository,'config'));
  const values=yaml.load(fs.readFileSync(path.join(repository,'my-values/prism-agent-values.yaml'),'utf8'));
  if (values.extraEnv?.some(variable=>variable.name==='PRISM_CONTROL_URL')) throw new Error('PRISM_TOOL_LEGACY_ENV_AUTHOR:remove gateway PRISM_CONTROL_URL');
  const bridges=values.extraContainers?.filter(container=>container.name==='prism-agent-bridge');
  const bridge=bridges?.[0];
  if(bridges?.length!==1||JSON.stringify(bridge.command)!==JSON.stringify(['node','/app/prism/skills/packages/prism-engine/server/agent-bridge-entry.mjs'])
    ||bridge.readinessProbe?.httpGet?.port!==projection.settings.port||bridge.livenessProbe?.httpGet?.port!==projection.settings.port
    ||bridge.env?.some(variable=>['PORT','PRISM_CONTROL_URL','PRISM_STUDIO_PUBLIC_URL'].includes(variable.name)))throw new Error('PRISM_BRIDGE_VALUES_PROJECTION_DRIFT:run npm run config:prism:sync');
}
function syncBridgeValues(repository) {
  const projection=prismAgentBridgeProjection(path.join(repository,'config'));
  const file=path.join(repository,'my-values/prism-agent-values.yaml');
  const source=fs.readFileSync(file,'utf8');
  const values=yaml.load(source);const bridges=values.extraContainers?.filter(container=>container.name==='prism-agent-bridge');
  if(bridges?.length!==1)throw new Error('PRISM_BRIDGE_VALUES_CONTAINER_REQUIRED');
  // Replace only generated probe port tokens; preserve operator image/resources/secrets.
  const marker='  - name: prism-agent-bridge';const start=source.indexOf(marker);
  if(start<0)throw new Error('PRISM_BRIDGE_VALUES_CONTAINER_REQUIRED');
  let end=source.indexOf('\nworkspace:',start);if(end<0)throw new Error('PRISM_BRIDGE_VALUES_CONTAINER_BOUNDARY_REQUIRED');
  const block=source.slice(start,end).replace(/(httpGet: \{ path: \/(?:ready|health), port: )\d+/gu,`$1${projection.settings.port}`);
  fs.writeFileSync(file,source.slice(0,start)+block+source.slice(end));
  checkBridgeValues(repository);
}

export function assertPrismChartProjection(repository) {
  checkBridgeValues(repository);
  const toolsTarget = path.join(repository, 'charts/kubeclaw/files/pipeline/prism-agent-tools.json');
  const toolsBytes = `${JSON.stringify({ ...prismAgentBridgeProjection(path.join(repository, 'config')).deployment, ...prismAgentBridgeProjection(path.join(repository, 'config')).toolPlugin }, null, 2)}\n`;
  if (!fs.existsSync(toolsTarget) || fs.readFileSync(toolsTarget, 'utf8') !== toolsBytes) throw new Error('PRISM_TOOL_PROJECTION_DRIFT:run npm run config:prism:sync');
  const target = path.join(repository, 'charts/prism/files/pipeline/prism-topology.json');
  const bytes = `${JSON.stringify(prismChartProjection(path.join(repository, 'config')), null, 2)}\n`;
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== bytes) throw new Error('PRISM_CHART_PROJECTION_DRIFT:run npm run config:prism:sync');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(value => value !== '--check')) throw new Error('Usage: generate-prism-chart-config.mjs [--check]');
  const repository = path.resolve(import.meta.dirname, '..');
  if (process.argv.includes('--check')) assertPrismChartProjection(repository);
  else {
    syncBridgeValues(repository);
    const toolsProjection = prismAgentBridgeProjection(path.join(repository, 'config'));
    const toolsTarget = path.join(repository, 'charts/kubeclaw/files/pipeline/prism-agent-tools.json');
    fs.mkdirSync(path.dirname(toolsTarget), { recursive: true });
    fs.writeFileSync(toolsTarget, `${JSON.stringify({ ...toolsProjection.deployment, ...toolsProjection.toolPlugin }, null, 2)}\n`);
    const target = path.join(repository, 'charts/prism/files/pipeline/prism-topology.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(prismChartProjection(path.join(repository, 'config')), null, 2)}\n`);
  }
}
