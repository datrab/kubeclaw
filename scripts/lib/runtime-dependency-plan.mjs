import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Resolve package directories without requiring package.json to be exported.
function resolvePackage(name, origin) {
  assert(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name), `invalid runtime dependency: ${name}`);
  const search = createRequire(path.join(origin, 'package.json')).resolve.paths(name) ?? [];
  for (const directory of search) {
    const candidate = path.join(directory, name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return fs.realpathSync(candidate);
  }
  return null;
}

export function runtimeDependencyPlan(roots, internalNames = new Set()) {
  const packages = new Map();
  const links = new Map();
  function link(target, destination) {
    assert(!links.has(target) || links.get(target) === destination,
      `runtime dependency target collision: ${target}`);
    links.set(target, destination);
  }
  function visit(name, origin, optional, parentTarget) {
    if (internalNames.has(name)) return;
    const sourceRoot = resolvePackage(name, origin);
    if (!sourceRoot && optional) return;
    assert(sourceRoot, `runtime dependency is not installed: ${name} (from ${origin})`);
    let record = packages.get(sourceRoot);
    if (!record) {
      const id = String(packages.size);
      record = { name, sourceRoot, target: `skills/.runtime-dependencies/${id}` };
      packages.set(sourceRoot, record); // Register before recursion to support cycles.
      const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8'));
      const optionalNames = new Set(Object.keys(manifest.optionalDependencies ?? {}));
      const peers = Object.keys(manifest.peerDependencies ?? {});
      for (const dependency of new Set([...Object.keys(manifest.dependencies ?? {}), ...optionalNames, ...peers])) {
        const optionalPeer = !Object.hasOwn(manifest.dependencies ?? {}, dependency)
          && manifest.peerDependenciesMeta?.[dependency]?.optional === true;
        visit(dependency, sourceRoot, optionalNames.has(dependency) || optionalPeer, record.target);
      }
    }
    link(path.posix.join(parentTarget, 'node_modules', name), record.target);
  }
  // Plugin digests forbid symlinks within plugin trees. Resolve their direct
  // dependencies through the shared skills ancestor; conflicting versions fail
  // closed instead of silently selecting a different installed package.
  for (const { name, origin, optional = false, target = 'skills' } of roots) {
    const dependencyTarget = target.startsWith('skills/plugins/') ? 'skills' : target;
    visit(name, origin, optional, dependencyTarget);
  }
  return { packages: [...packages.values()], links: [...links].map(([target, destination]) => ({ target, destination })) };
}
