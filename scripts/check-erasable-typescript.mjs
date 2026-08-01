import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const baseConfig = path.join(root, 'tsconfig.base.json');
const sourceConfigs = execFileSync('find', [
  'contracts', 'skills', 'tests',
  '-name', 'tsconfig.json',
  '-type', 'f',
], { cwd: root, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((file) => file && !file.includes('/node_modules/'))
  .sort();

for (const config of sourceConfigs) {
  const file = path.join(root, config);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const extended = path.resolve(path.dirname(file), parsed.extends ?? '');
  if (extended !== baseConfig) throw new Error(`${config} must extend tsconfig.base.json`);
  if (parsed.compilerOptions?.paths || parsed.compilerOptions?.baseUrl) {
    throw new Error(`${config} must use package exports instead of compiler-only aliases`);
  }
  execFileSync('tsc', ['--noEmit', '-p', config], { cwd: root, stdio: 'inherit' });
}

const trackedGenerated = execFileSync('git', [
  'ls-files',
  'skills/**/dist/**',
  'contracts/**/dist/**',
], { cwd: root, encoding: 'utf8' }).trim();
if (trackedGenerated) throw new Error(`generated dist files must not be tracked:\n${trackedGenerated}`);

const sourceFiles = execFileSync('git', ['ls-files', '*.ts', '*.mts'], {
  cwd: root,
  encoding: 'utf8',
}).trim().split('\n').filter((file) => file && !file.includes('/dist/'));
for (const sourceFile of sourceFiles) {
  const source = fs.readFileSync(path.join(root, sourceFile), 'utf8');
  if (!/\.d\.(?:m)?ts$/u.test(sourceFile)) {
    const transpiled = ts.transpileModule(source, {
      fileName: sourceFile,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        erasableSyntaxOnly: true,
        rewriteRelativeImportExtensions: true,
        verbatimModuleSyntax: true,
      },
    });
    const errors = (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
      throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
      }));
    }
  }
  for (const match of source.matchAll(/['"](\.{1,2}\/[^'"]+)\.js['"]/gu)) {
    const specifier = match[1];
    if (!specifier) continue;
    const typescriptTarget = path.resolve(root, path.dirname(sourceFile), `${specifier}.ts`);
    const moduleTarget = path.resolve(root, path.dirname(sourceFile), `${specifier}.mts`);
    if (fs.existsSync(typescriptTarget) || fs.existsSync(moduleTarget)) {
      throw new Error(`${sourceFile} must import its TypeScript source with an explicit TypeScript extension: ${specifier}.js`);
    }
  }
}

const pluginManifests = execFileSync('git', ['ls-files', 'skills/**/plugin.json'], {
  cwd: root,
  encoding: 'utf8',
}).trim().split('\n').filter(Boolean);
for (const manifestFile of pluginManifests) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestFile), 'utf8'));
  for (const registration of [...manifest.stages, ...manifest.observers, ...manifest.adapters]) {
    if (!registration.module.startsWith('src/') || !registration.module.endsWith('.ts')) {
      throw new Error(`${manifestFile} registration ${registration.id} must point at TypeScript source`);
    }
  }
}

console.log(JSON.stringify({
  ok: true,
  sourceConfigs: sourceConfigs.length,
  sourceFiles: sourceFiles.length,
  pluginManifests: pluginManifests.length,
}));
