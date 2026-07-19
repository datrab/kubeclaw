#!/usr/bin/env node
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'runtime/check-runtime-collisions' });
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
  SHARED_PIPELINE_HELPER_PATHS,
  materializeRuntimeTree,
  importRuntimeModule,
} from '../lib/lifecycle-audit-lib.mjs';

const args = parseArgs();
const { sourceRoot, overlayRoot } = resolveRoots(args);
const images = ['general', 'busterPipeline'];
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

function collectCommonPipelineImportViolations(sourceRoot, overlayRoot) {
  const violations = [];
  const commonRelPaths = new Set(
    [...effectiveFiles(sourceRoot, overlayRoot, 'skills/common/pipeline').keys()]
      .filter((relPath) => /\.js$/.test(relPath))
      .map((relPath) => path.posix.join('pipeline', relPath.replace(/\\/g, '/'))),
  );
  const importPattern = /(?:import|export)\s+(?:[^'"`]+?\s+from\s+)?['"]([^'"]*common\/pipeline\/[^'"]+\.js)['"]|import\(\s*['"]([^'"]*common\/pipeline\/[^'"]+\.js)['"]\s*\)/g;

  for (const area of ['nova', 'buster']) {
    const files = effectiveFiles(sourceRoot, overlayRoot, `skills/${area}`);
    for (const [relPathRaw, absPath] of files.entries()) {
      const relPath = relPathRaw.replace(/\\/g, '/');
      if (!/\.js$/.test(relPath)) continue;
      const isShim = commonRelPaths.has(relPath);
      const text = fs.readFileSync(absPath, 'utf8');
      const matches = [...text.matchAll(importPattern)].map((match) => match[1] || match[2]);
      if (matches.length > 0 && !isShim) {
        violations.push({
          file: path.posix.join('skills', area, relPath),
          imports: matches,
        });
      }
    }
  }

  return violations;
}

function collectMissingSharedPipelineShims(sourceRoot, overlayRoot) {
  const commonRelPaths = [...effectiveFiles(sourceRoot, overlayRoot, 'skills/common/pipeline').keys()]
    .map((relPath) => relPath.replace(/\\/g, '/'))
    .filter((relPath) => /\.js$/.test(relPath) || SHARED_PIPELINE_HELPER_PATHS.includes(path.posix.join('pipeline', relPath)))
    .sort();
  const declaredRelPaths = SHARED_PIPELINE_HELPER_PATHS
    .map((relPath) => relPath.replace(/^pipeline\//, ''))
    .sort();
  const declarationDrift = [
    ...commonRelPaths.filter((relPath) => !declaredRelPaths.includes(relPath)).map((relPath) => ({ relPath, issue: 'missing_from_shared_helper_inventory' })),
    ...declaredRelPaths.filter((relPath) => !commonRelPaths.includes(relPath)).map((relPath) => ({ relPath, issue: 'declared_but_missing_from_common' })),
  ];

  const missing = [];
  for (const area of ['nova', 'buster']) {
    const areaFiles = effectiveFiles(sourceRoot, overlayRoot, `skills/${area}/pipeline`);
    for (const relPath of commonRelPaths) {
      if (!areaFiles.has(relPath)) missing.push({ area, relPath: path.posix.join('pipeline', relPath) });
    }
  }

  return { missing, declarationDrift };
}

function collectRuntimeCommonSurfaceViolations(runtimeRoot, manifest) {
  const manifestPaths = [...manifest.keys()].filter((destPath) => destPath.startsWith('/app/common'));
  const importViolations = [];
  const appSkillsRoot = path.join(runtimeRoot, 'app', 'skills');
  const importPattern = /(?:import|export)\s+(?:[^'"`]+?\s+from\s+)?['"]([^'"]*(?:\/app\/common|common\/pipeline)[^'"]*)['"]|import\(\s*['"]([^'"]*(?:\/app\/common|common\/pipeline)[^'"]*)['"]\s*\)/g;

  for (const filePath of walkFiles(appSkillsRoot).filter((file) => /\.(js|mjs|cjs)$/.test(file))) {
    const text = fs.readFileSync(filePath, 'utf8');
    const imports = [...text.matchAll(importPattern)].map((match) => match[1] || match[2]);
    if (imports.length > 0) {
      importViolations.push({
        file: path.relative(runtimeRoot, filePath).replace(/\\/g, '/'),
        imports,
      });
    }
  }

  return { manifestPaths, importViolations };
}

function isTestOrSpecFile(relPath) {
  return /\.(?:test|spec)\.(?:mjs|js|ts)$/.test(relPath.replace(/\\/g, '/'));
}

function collectSkillSourceTestFiles(sourceRoot, overlayRoot) {
  return [...effectiveFiles(sourceRoot, overlayRoot, 'skills').keys()]
    .map((relPath) => relPath.replace(/\\/g, '/'))
    .filter(isTestOrSpecFile)
    .map((relPath) => path.posix.join('skills', relPath))
    .sort();
}

function collectTsNoCheckFiles(sourceRoot, overlayRoot) {
  const files = [];
  for (const relDir of ['skills', 'plugins']) {
    for (const [relPath, absPath] of effectiveFiles(sourceRoot, overlayRoot, relDir).entries()) {
      if (!/\.ts$/.test(relPath) || /\.d\.ts$/.test(relPath)) continue;
      const text = fs.readFileSync(absPath, 'utf8');
      if (/^\s*\/\/\s*@ts-nocheck\b/m.test(text)) {
        files.push(path.posix.join(relDir, relPath.replace(/\\/g, '/')));
      }
    }
  }
  return files.sort();
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

const sourceCommonImportViolations = collectCommonPipelineImportViolations(sourceRoot, overlayRoot);
const sourceSkillTestFiles = collectSkillSourceTestFiles(sourceRoot, overlayRoot);
const sourceTsNoCheckFiles = collectTsNoCheckFiles(sourceRoot, overlayRoot);
const sharedShimCoverage = collectMissingSharedPipelineShims(sourceRoot, overlayRoot);
const runtimeCommonSurfaceViolations = [];

for (const image of images) {
  const collisions = findCollisions(sourceRoot, overlayRoot, image);
  const { manifest } = buildManifest(sourceRoot, overlayRoot, image);
  const expectedOwners = expectedPackagedRuntimeOwners(image);
  const { runtimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, image);
  const commonSurfaceViolations = collectRuntimeCommonSurfaceViolations(runtimeRoot, manifest);
  runtimeCommonSurfaceViolations.push({ image, ...commonSurfaceViolations });
  const brokenRelativeImports = collectBrokenRelativeImports(path.join(runtimeRoot, 'app', 'skills'), runtimeRoot);
  const importChecks = [];
  const ownerDrift = Object.entries(expectedOwners).flatMap(([destPath, expectedOwner]) => {
    const actual = manifest.get(destPath);
    const actualOwner = actual ? path.relative(sourceRoot, actual.absPath).replace(/\\/g, '/') : null;
    return actualOwner === expectedOwner ? [] : [{ destPath, expectedOwner, actualOwner }];
  });

  if (image === 'general') {
    for (const runtimePath of ['/app/skills/pipeline.ts', '/app/skills/pipeline/index.ts']) {
      try {
        await importRuntimeModule(runtimeRoot, runtimePath);
        importChecks.push({ runtimePath, ok: true });
      } catch (error) {
        importChecks.push({ runtimePath, ok: false, error: error.message });
      }
    }
  } else if (image === 'busterPipeline') {
    for (const runtimePath of ['/app/skills/buster-pipeline.ts', '/app/skills/pipeline/tools/redis.ts']) {
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
    runtimeOwners: Object.fromEntries(
      [...Object.keys(expectedOwners), '/app/skills/pipeline/tools/redis.ts'].map((runtimePath) => [
        runtimePath,
        manifest.get(runtimePath)
          ? path.relative(sourceRoot, manifest.get(runtimePath).absPath).replace(/\\/g, '/')
          : null,
      ]),
    ),
  });
}

const totalCollisions = results.reduce((sum, entry) => sum + entry.collisionCount, 0);
const totalOwnerDrift = results.reduce((sum, entry) => sum + entry.ownerDriftCount, 0);
const totalBrokenRelativeImports = results.reduce((sum, entry) => sum + entry.brokenRelativeImportCount, 0);
const totalBrokenSourceRelativeImports = sourceBrokenRelativeImports.length;
const totalRuntimeCommonManifestPaths = runtimeCommonSurfaceViolations.reduce((sum, entry) => sum + entry.manifestPaths.length, 0);
const totalRuntimeCommonImports = runtimeCommonSurfaceViolations.reduce((sum, entry) => sum + entry.importViolations.length, 0);
const failedImports = results.flatMap((entry) => entry.importChecks.filter((check) => !check.ok));
quietConsole.restore();
console.log(JSON.stringify({
  sourceRoot,
  overlayRoot,
  totalCollisions,
  totalOwnerDrift,
  totalBrokenRelativeImports,
  totalBrokenSourceRelativeImports,
  totalSourceSkillTestFiles: sourceSkillTestFiles.length,
  totalSourceTsNoCheckFiles: sourceTsNoCheckFiles.length,
  totalSourceCommonImportViolations: sourceCommonImportViolations.length,
  totalMissingSharedPipelineShims: sharedShimCoverage.missing.length,
  totalSharedHelperDeclarationDrift: sharedShimCoverage.declarationDrift.length,
  totalRuntimeCommonManifestPaths,
  totalRuntimeCommonImports,
  sourceBrokenRelativeImports,
  sourceSkillTestFiles,
  sourceTsNoCheckFiles,
  sourceCommonImportViolations,
  sharedShimCoverage,
  runtimeCommonSurfaceViolations,
  failedImportCount: failedImports.length,
  results,
}, null, 2));
process.exit(
  totalCollisions === 0
  && totalOwnerDrift === 0
  && totalBrokenRelativeImports === 0
  && totalBrokenSourceRelativeImports === 0
  && sourceSkillTestFiles.length === 0
  && sourceTsNoCheckFiles.length === 0
  && sourceCommonImportViolations.length === 0
  && sharedShimCoverage.missing.length === 0
  && sharedShimCoverage.declarationDrift.length === 0
  && totalRuntimeCommonManifestPaths === 0
  && totalRuntimeCommonImports === 0
  && failedImports.length === 0
    ? 0
    : 1,
);
