import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { declaredPipelineServices, materializePipelineGeneration } from './updates/pipeline-generation.mjs';

const callers = ['prism-control', 'prism-studio', 'prism-worker', 'prism-ingestion', 'prism-agent-bridge'];

/** Image projection of the sole central author; not a fallback or a second editable author. */
export async function buildPrismImageBundle({ repository, output, callerId, revision, builtAt }) {
  if (!callers.includes(callerId) || !/^[a-f0-9]{40}$/u.test(revision ?? '')
    || !Number.isFinite(Date.parse(builtAt))) throw new Error('PRISM_IMAGE_BUILD_IDENTITY_REQUIRED');
  for (const directory of [repository, output]) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) !== directory) throw new Error('PRISM_IMAGE_BUILD_PATH_INVALID');
  }
  if (fs.existsSync(output)) throw new Error('PRISM_IMAGE_BUILD_OUTPUT_EXISTS');
  // Select the explicitly authored deployment tuple, never the build host/CWD/ENV.
  const authorRoot = path.join(repository, 'config');
  const root = JSON.parse(fs.readFileSync(path.join(authorRoot, 'pipeline.config.json'), 'utf8'));
  const receiver = callerId === 'prism-agent-bridge' ? 'prism-agent-bridge' : 'prism-control';
  const controls = root.bindings?.filter(binding => binding.role === 'prism' && binding.owner === 'prism-control'
    && binding.instanceId.endsWith(`/${receiver}`));
  if (!controls || controls.length !== 1) throw new Error('PRISM_IMAGE_RELEASE_COMPOSITION_REQUIRED');
  const [namespace, releaseName, service, ...extra] = controls[0].instanceId.split('/');
  if (extra.length || service !== receiver) throw new Error('PRISM_IMAGE_RELEASE_COMPOSITION_REQUIRED');
  const services = declaredPipelineServices(authorRoot, { role: 'prism', namespace, releaseName, deployment: callerId === 'prism-agent-bridge' ? 'agent-bridge' : 'services' });
  fs.mkdirSync(output, { mode: 0o755 });
  const packageRoot = path.join(output, 'role');
  const generationRoot = path.join(output, 'generation');
  const publisher = path.join(output, 'publish');
  execFileSync('cc', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', path.join(repository, 'scripts/pipeline-publish.c'), '-o', publisher], { stdio: 'pipe' });
  execFileSync(process.execPath, [path.join(repository, 'scripts/build-runtime-role-bundle.mjs'), 'prism', packageRoot,
    revision, 'pipeline-image-projection.v1', builtAt], { cwd: repository, stdio: 'pipe' });
  const generation = await materializePipelineGeneration({ authorRoot, packageRoot, output: generationRoot, services, publisher });
  const deliveryRoot = path.join(output, 'delivery');
  fs.mkdirSync(deliveryRoot, { mode: 0o755 });
  fs.cpSync(path.join(generationRoot, 'expected', callerId), path.join(deliveryRoot, 'version'), { recursive: true });
  fs.symlinkSync('version', path.join(deliveryRoot, '..data'));
  const result = { callerId, revision, generationDigest: generation.generationDigest,
    packageRoot, systemRoot: path.join(generationRoot, 'system'), deliveryRoot,
    serviceInstanceId: services.find(service => service.callerId === callerId).serviceInstanceId };
  fs.writeFileSync(path.join(output, 'image-projection.json'), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o444 });
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [callerId, output, revision] = process.argv.slice(2);
  if (process.argv.length !== 5) throw new Error('Usage: build-prism-image-bundle.mjs CALLER ABSOLUTE_OUTPUT SOURCE_COMMIT');
  const result = await buildPrismImageBundle({ repository: path.resolve(import.meta.dirname, '..'), output, callerId, revision,
    builtAt: new Date().toISOString() });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
