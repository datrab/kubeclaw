// Build-time only: genuine generations for the original HTTP suite, bound to
// the SAME installed role. No publisher, compiler or mutable receipt at runtime.
import fs from 'node:fs';
import path from 'node:path';
import { declaredPipelineServices, materializePipelineGeneration } from './updates/pipeline-generation.mjs';
const [repository, image] = process.argv.slice(2);
if (process.getuid?.() !== 0 || !path.isAbsolute(repository ?? '') || !path.isAbsolute(image ?? '')) throw new Error('STUDIO_PROOF_ROOT_BUILD_REQUIRED');
const proof = path.join(image, 'studio-proof');
fs.mkdirSync(proof);
for (const id of ['150', '250', '600', 'canonical']) {
  const root = path.join(proof, id), author = path.join(root, 'author');
  fs.mkdirSync(root); fs.cpSync(path.join(repository, 'config'), author, { recursive: true });
  const entry = JSON.parse(fs.readFileSync(path.join(author, 'pipeline.config.json'), 'utf8'));
  const binding = entry.bindings.filter(value => value.role === 'prism' && value.owner === 'prism-studio');
  if (binding.length !== 1) throw new Error('STUDIO_PROOF_BINDING_REQUIRED');
  const file = path.join(author, entry.components['prism-studio']);
  const component = JSON.parse(fs.readFileSync(file, 'utf8'));
  const settings = component.profiles[binding[0].profileId].settings;
  if (id !== 'canonical') Object.assign(settings, { port: 19080, controlUrl: 'http://127.0.0.1:19081', controlTimeoutMs: Number(id) });
  fs.writeFileSync(file, JSON.stringify(component));
  const { port, controlUrl, controlTimeoutMs } = settings;
  fs.writeFileSync(path.join(root, 'selection.json'), JSON.stringify({ port, controlUrl, controlTimeoutMs }), { mode: 0o444 });
  const control = entry.bindings.find(value => value.role === 'prism' && value.owner === 'prism-control' && value.instanceId.endsWith('/prism-control'));
  const [namespace, releaseName] = control.instanceId.split('/');
  await materializePipelineGeneration({ authorRoot: author, packageRoot: path.join(image, 'role'), output: path.join(root, 'generation'),
    services: declaredPipelineServices(author, { role: 'prism', namespace, releaseName, deployment: 'services' }), publisher: path.join(image, 'publish') });
  const transport = path.join(root, 'studio-transport'); fs.mkdirSync(transport);
  fs.cpSync(path.join(root, 'generation/expected/prism-studio'), path.join(transport, 'version-A'), { recursive: true });
  fs.symlinkSync('version-A', path.join(transport, '..data'));
  // Original post-publication author mutation remains real. Only this unused
  // source input is handed to the test user by Docker; sealed generation/code are not.
  fs.chmodSync(file, 0o644);
}
