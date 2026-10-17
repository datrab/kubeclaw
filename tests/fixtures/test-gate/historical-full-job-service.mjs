import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));
let materialized;

/** Genuine historical full-job execution/HTTP closure, NEVER a productive service.
 * Current tests inject the maintained historical store and use current producers,
 * contracts, compactor, CLI and assertions. No fake completion or provider pass.
 * Source provenance is the full commit plus individual Git blob identities.
 * No Git objects/network/install privileges are required by CI at replay time.
 */
export async function historicalFullJobService() {
  if (materialized) return materialized;
  const bytes = fs.readFileSync(new URL('./historical-full-job-service.json', import.meta.url));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '6987ff7a2b42f42897f295d800137eb872119dd6a308e586888745e63877eb17');
  const archive = JSON.parse(bytes);
  assert.equal(archive.commit, '550eb948ec8766b38e8c8d4ccb88a1fdab28e61a');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-full-job-service-'));
  process.once('exit', () => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  for (const file of archive.files) {
    const target = path.resolve(root, file.path);
    assert(target.startsWith(`${root}${path.sep}`));
    const content = Buffer.from(file.content);
    const blob = crypto.createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
    assert.equal(blob, file.gitBlob);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const modules = path.join(root, 'node_modules'); fs.mkdirSync(modules);
  const link = (source, target) => {
    const original = fs.realpathSync(source);
    const relative = path.relative(checkout, original);
    const archived = !relative.startsWith('..') && !path.isAbsolute(relative)
      && !relative.split(path.sep).includes('node_modules') ? path.join(root, relative) : original;
    fs.symlinkSync(archived, target, 'dir');
  };
  for (const name of fs.readdirSync(path.join(checkout, 'node_modules'))) {
    const source = path.join(checkout, 'node_modules', name);
    if (name.startsWith('@')) {
      const scope = path.join(modules, name); fs.mkdirSync(scope);
      for (const child of fs.readdirSync(source)) link(path.join(source, child), path.join(scope, child));
    } else link(source, path.join(modules, name));
  }
  const service = await import(pathToFileURL(path.join(root, 'skills/buster/engine/test-gates/remote-plan-service.ts')).href);
  const runtime = await import(pathToFileURL(path.join(root, 'skills/buster/engine/test-gates/remote-plan-runtime.ts')).href);
  materialized = { BusterRemotePlanService: service.BusterRemotePlanService, BusterRemotePlanRuntime: runtime.BusterRemotePlanRuntime };
  return materialized;
}
