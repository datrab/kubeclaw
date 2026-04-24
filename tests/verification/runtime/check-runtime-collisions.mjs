#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseArgs,
  resolveRoots,
  buildManifest,
  effectiveFiles,
  findCollisions,
  expectedPackagedRuntimeOwners,
  materializeRuntimeTree,
  importRuntimeModule,
} from '../lib/lifecycle-audit-lib.mjs';

const args = parseArgs();
const { sourceRoot, overlayRoot } = resolveRoots(args);
const images = ['general', 'sandbox'];
const results = [];

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absPath, out);
    } else if (entry.isFile()) {
      out.push(absPath);
    }
  }
  return out;
}

function resolveRelativeImport(baseFile, specifier) {
  const basePath = path.resolve(path.dirname(baseFile), specifier);
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.mjs'),
    path.join(basePath, 'index.cjs'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function collectBrokenRelativeImports(scanRoot, baseRoot = scanRoot) {
  const jsFiles = walkFiles(scanRoot).filter((file) => /\.(js|mjs|cjs)$/.test(file));
  const violations = [];
  const importPattern = /(?:import|export)\s+(?:[^'"`]+?\s+from\s+)?['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

  for (const filePath of jsFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const match of text.matchAll(importPattern)) {
      const specifier = match[1] || match[2];
      if (!specifier) continue;
      if (!resolveRelativeImport(filePath, specifier)) {
        violations.push({
          file: path.relative(baseRoot, filePath).replace(/\\/g, '/'),
          specifier,
        });
      }
    }
  }

  return violations;
}

function materializeEffectiveTree(sourceRoot, overlayRoot, relDir) {
  const treeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-source-'));
  const files = effectiveFiles(sourceRoot, overlayRoot, relDir);

  for (const [relPath, absPath] of files.entries()) {
    const targetPath = path.join(treeRoot, relPath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(absPath, targetPath);
  }

  return { treeRoot, files };
}

const sourceBrokenRelativeImports = [];
const { treeRoot: effectiveSkillsRoot } = materializeEffectiveTree(sourceRoot, overlayRoot, 'skills');
for (const relDir of ['nova', 'buster']) {
  const broken = collectBrokenRelativeImports(path.join(effectiveSkillsRoot, relDir), effectiveSkillsRoot);
  sourceBrokenRelativeImports.push(
    ...broken.map((entry) => ({
      file: path.posix.join('skills', entry.file),
      specifier: entry.specifier,
    })),
  );
}

for (const image of images) {
  const collisions = findCollisions(sourceRoot, overlayRoot, image);
  const { manifest } = buildManifest(sourceRoot, overlayRoot, image);
  const expectedOwners = expectedPackagedRuntimeOwners(image);
  const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, image);
  const brokenRelativeImports = collectBrokenRelativeImports(path.join(runtimeRoot, 'app', 'skills'), runtimeRoot);
  const importChecks = [];
  const ownerDrift = Object.entries(expectedOwners).flatMap(([destPath, expectedOwner]) => {
    const actual = manifest.get(destPath);
    const actualOwner = actual ? path.relative(sourceRoot, actual.absPath).replace(/\\/g, '/') : null;
    return actualOwner === expectedOwner ? [] : [{ destPath, expectedOwner, actualOwner }];
  });

  if (image === 'general') {
    for (const runtimePath of ['/app/skills/pipeline.js', '/app/skills/pipeline/index.js']) {
      try {
        await importRuntimeModule(runtimeRoot, runtimePath);
        importChecks.push({ runtimePath, ok: true });
      } catch (error) {
        importChecks.push({ runtimePath, ok: false, error: error.message });
      }
    }
  } else if (image === 'sandbox') {
    for (const runtimePath of ['/app/skills/buster-pipeline.js', '/app/skills/redis.js']) {
      try {
        await importRuntimeModule(runtimeRoot, runtimePath);
        importChecks.push({ runtimePath, ok: true });
      } catch (error) {
        importChecks.push({ runtimePath, ok: false, error: error.message });
      }
    }
  }

  results.push({
    image,
    collisionCount: collisions.length,
    ownerDriftCount: ownerDrift.length,
    fileCount: manifest.size,
    brokenRelativeImportCount: brokenRelativeImports.length,
    brokenRelativeImports,
    importChecks,
    ownerDrift,
    collisions: collisions.map((entry) => ({
      destPath: entry.destPath,
      owners: entry.entries.map((owner) => path.relative(sourceRoot, owner.absPath)),
    })),
    runtimeOwners: {
      '/app/common/pipeline/agents/runtime.js': manifest.get('/app/common/pipeline/agents/runtime.js')
        ? path.relative(sourceRoot, manifest.get('/app/common/pipeline/agents/runtime.js').absPath)
        : null,
      '/app/common/pipeline/integrations/gateway.js': manifest.get('/app/common/pipeline/integrations/gateway.js')
        ? path.relative(sourceRoot, manifest.get('/app/common/pipeline/integrations/gateway.js').absPath)
        : null,
      '/app/common/pipeline/agents/lifecycle.js': manifest.get('/app/common/pipeline/agents/lifecycle.js')
        ? path.relative(sourceRoot, manifest.get('/app/common/pipeline/agents/lifecycle.js').absPath)
        : null,
      '/app/common/pipeline/agents/acp-monitor.js': manifest.get('/app/common/pipeline/agents/acp-monitor.js')
        ? path.relative(sourceRoot, manifest.get('/app/common/pipeline/agents/acp-monitor.js').absPath)
        : null,
      '/app/common/pipeline/lifecycle-state.js': manifest.get('/app/common/pipeline/lifecycle-state.js')
        ? path.relative(sourceRoot, manifest.get('/app/common/pipeline/lifecycle-state.js').absPath)
        : null,
      '/app/skills/pipeline/agents/runtime.js': manifest.get('/app/skills/pipeline/agents/runtime.js')
        ? path.relative(sourceRoot, manifest.get('/app/skills/pipeline/agents/runtime.js').absPath)
        : null,
      '/app/skills/pipeline/integrations/gateway.js': manifest.get('/app/skills/pipeline/integrations/gateway.js')
        ? path.relative(sourceRoot, manifest.get('/app/skills/pipeline/integrations/gateway.js').absPath)
        : null,
      '/app/skills/pipeline/agents/lifecycle.js': manifest.get('/app/skills/pipeline/agents/lifecycle.js')
        ? path.relative(sourceRoot, manifest.get('/app/skills/pipeline/agents/lifecycle.js').absPath)
        : null,
      '/app/skills/pipeline/agents/acp-monitor.js': manifest.get('/app/skills/pipeline/agents/acp-monitor.js')
        ? path.relative(sourceRoot, manifest.get('/app/skills/pipeline/agents/acp-monitor.js').absPath)
        : null,
      '/app/skills/pipeline/lifecycle-state.js': manifest.get('/app/skills/pipeline/lifecycle-state.js')
        ? path.relative(sourceRoot, manifest.get('/app/skills/pipeline/lifecycle-state.js').absPath)
        : null,
      '/app/skills/redis.js': manifest.get('/app/skills/redis.js')
        ? path.relative(sourceRoot, manifest.get('/app/skills/redis.js').absPath)
        : null,
    },
  });
}

const totalCollisions = results.reduce((sum, entry) => sum + entry.collisionCount, 0);
const totalOwnerDrift = results.reduce((sum, entry) => sum + entry.ownerDriftCount, 0);
const totalBrokenRelativeImports = results.reduce((sum, entry) => sum + entry.brokenRelativeImportCount, 0);
const totalBrokenSourceRelativeImports = sourceBrokenRelativeImports.length;
const failedImports = results.flatMap((entry) => entry.importChecks.filter((check) => !check.ok));
console.log(JSON.stringify({ sourceRoot, overlayRoot, totalCollisions, totalOwnerDrift, totalBrokenRelativeImports, totalBrokenSourceRelativeImports, sourceBrokenRelativeImports, failedImportCount: failedImports.length, results }, null, 2));
process.exit(totalCollisions === 0 && totalOwnerDrift === 0 && totalBrokenRelativeImports === 0 && totalBrokenSourceRelativeImports === 0 && failedImports.length === 0 ? 0 : 1);
