import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const registry = JSON.parse(fs.readFileSync(new URL('./docs-local-helm-field-authorities.json', import.meta.url), 'utf8'));

export function localHelmAuthorityFile(sourcePath) {
  return registry.files[sourcePath] ?? null;
}

export function localHelmFieldAuthority(sourcePath, fieldPath) {
  const declaration = localHelmAuthorityFile(sourcePath);
  const authority = declaration?.fields[fieldPath];
  return authority ? { ...authority, sourceFileSha256: declaration.sourceSha256, chartRoot: declaration.chartRoot } : null;
}

export function localHelmAuthorityPaths(sourcePath) {
  return Object.keys(localHelmAuthorityFile(sourcePath)?.fields ?? {}).sort();
}

export function localHelmChartAuthority(chartRoot) {
  return registry.charts[chartRoot] ?? null;
}

export function localHelmChartRoots() {
  return Object.keys(registry.charts).sort();
}

export function localHelmAuthorityStats() {
  return {
    files: Object.keys(registry.files).length,
    fields: Object.values(registry.files).reduce((sum, file) => sum + Object.keys(file.fields).length, 0),
    templates: Object.values(registry.charts).reduce((sum, chart) => sum + Object.keys(chart.templates).length, 0),
  };
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonicalHelmPath = (value) => value.replace(/^\$\.?/u, '')
  .replace(/\["((?:\\.|[^"])*)"\]/gu, (_match, key) => `.${JSON.parse(`"${key}"`)}`)
  .replace(/^\./u, '')
  .replace(/\[[0-9]+\]/gu, '[]');

export function assertLocalHelmAuthorityRegistry(repositoryRoot = process.cwd(), { verifyBytes = true } = {}) {
  assert.equal(registry.version, 2);
  assert.match(registry.semanticPolicy ?? '', /explicit field contract/u);
  for (const [sourcePath, declaration] of Object.entries(registry.files)) {
    assert.match(declaration.sourceSha256, /^[a-f0-9]{64}$/u, `${sourcePath}: invalid source digest`);
    if (verifyBytes) {
      const absoluteSource = path.join(repositoryRoot, sourcePath);
      assert(fs.existsSync(absoluteSource), `${sourcePath}: authority source is missing`);
      assert.equal(sha256(fs.readFileSync(absoluteSource)), declaration.sourceSha256,
        `${sourcePath}: authority source bytes changed`);
    }
    assert(registry.charts[declaration.chartRoot], `${sourcePath}: missing chart contract ${declaration.chartRoot}`);
    for (const [fieldPath, authority] of Object.entries(declaration.fields)) {
      assert(fieldPath.startsWith('$.'), `${sourcePath}#${fieldPath}: field path is not exact`);
      assert(!['typed-rendered-value', 'bounded-integer', 'container-path', 'duration', 'kubernetes-or-runtime-name', 'network-or-source-url', 'numeric-security-mode', 'protocol-selector'].includes(authority.group),
        `${sourcePath}#${fieldPath}: mechanical or conflated fallback authority is forbidden`);
      assert(Object.hasOwn(authority, 'selectedBaseline'), `${sourcePath}#${fieldPath}: selected baseline is missing`);
      assert.equal(authority.semanticAuthority, 'explicit-field-contract', `${sourcePath}#${fieldPath}: semantic authority was not explicitly approved`);
      for (const name of ['purpose', 'acceptedValues', 'emptyBehavior', 'impact', 'failure']) {
        assert(typeof authority[name] === 'string' && authority[name].length >= 20, `${sourcePath}#${fieldPath}: incomplete ${name}`);
      }
      assert(Array.isArray(authority.consumerProof) && authority.consumerProof.length > 0,
        `${sourcePath}#${fieldPath}: exact consumer proof is missing`);
      for (const consumer of authority.consumerProof) {
        assert(consumer.path.startsWith(`${declaration.chartRoot}/templates/`), `${sourcePath}#${fieldPath}: consumer is outside the selected chart`);
        assert(consumer.kind?.startsWith('helm-template'), `${sourcePath}#${fieldPath}: consumer is not an exact Helm template binding`);
        assert(typeof consumer.templateExpression === 'string' && consumer.templateExpression.length > 0,
          `${sourcePath}#${fieldPath}: consumer expression is missing`);
        assert.equal(consumer.exactValuePath, fieldPath.replace(/^\$\.?/u, ''),
          `${sourcePath}#${fieldPath}: consumer proof is not bound to this exact leaf`);
        assert(typeof consumer.bindingKind === 'string' && consumer.bindingKind.length > 0,
          `${sourcePath}#${fieldPath}: Helm binding kind is missing`);
        assert(typeof consumer.bindingProof === 'string' && consumer.bindingProof.length >= 20,
          `${sourcePath}#${fieldPath}: leaf-to-expression binding proof is incomplete`);
        assert(Number.isSafeInteger(consumer.line) && consumer.line > 0,
          `${sourcePath}#${fieldPath}: consumer line is missing`);
        assert.match(consumer.sourceLineSha256 ?? '', /^[a-f0-9]{64}$/u,
          `${sourcePath}#${fieldPath}: consumer line digest is missing`);
        assert.match(consumer.contextSha256 ?? '', /^[a-f0-9]{64}$/u,
          `${sourcePath}#${fieldPath}: consumer context digest is missing`);
        assert(typeof consumer.receiver === 'string' && consumer.receiver.length > 0,
          `${sourcePath}#${fieldPath}: rendered receiver is missing`);
        assert(typeof consumer.condition === 'string' && consumer.condition.length > 0,
          `${sourcePath}#${fieldPath}: render condition is missing`);
        assert(typeof consumer.defaultProof === 'string' && consumer.defaultProof.length > 0,
          `${sourcePath}#${fieldPath}: default selection proof is missing`);
        assert(Array.isArray(consumer.receiverProof) && consumer.receiverProof.length > 0,
          `${sourcePath}#${fieldPath}: receiver proof list is empty`);
        assert.doesNotMatch(consumer.receiver, /^(?:exact template output|render branch|dynamic rendered value)/u,
          `${sourcePath}#${fieldPath}: receiver description is generic`);
        assert(Array.isArray(consumer.conditionProof), `${sourcePath}#${fieldPath}: condition proof list is missing`);
        if (consumer.condition !== 'unconditional in the linked template branch') {
          assert(consumer.conditionProof.length > 0,
            `${sourcePath}#${fieldPath}: conditional consumption has no branch proof`);
        }
        assert(consumer.defaultProofEvidence?.path === sourcePath && consumer.defaultProofEvidence?.fieldPath === fieldPath,
          `${sourcePath}#${fieldPath}: selected-value proof does not bind the exact source field`);
        assert.equal(consumer.defaultProofEvidence.sourceSha256, declaration.sourceSha256,
          `${sourcePath}#${fieldPath}: selected-value proof has the wrong source digest`);
        if (consumer.defaultClauseProof) {
          assert(['primary', 'fallback'].includes(consumer.defaultClauseProof.role),
            `${sourcePath}#${fieldPath}: nested default role is invalid`);
          assert(consumer.defaultClauseProof.left && consumer.defaultClauseProof.fallback,
            `${sourcePath}#${fieldPath}: nested default operands are incomplete`);
          assert.equal(consumer.defaultClauseProof.sourceLineSha256, consumer.sourceLineSha256,
            `${sourcePath}#${fieldPath}: nested default proof is not bound to the consumer line`);
        }
        assert(Array.isArray(consumer.defaultClauseProofs),
          `${sourcePath}#${fieldPath}: complete default-clause proof list is missing`);
        for (const proof of consumer.defaultClauseProofs) {
          assert(['primary', 'fallback'].includes(proof.role),
            `${sourcePath}#${fieldPath}: default-clause role is invalid`);
          assert(proof.left && proof.fallback,
            `${sourcePath}#${fieldPath}: default-clause operands are incomplete`);
          assert.equal(proof.sourceLineSha256, consumer.sourceLineSha256,
            `${sourcePath}#${fieldPath}: default-clause proof is not bound to the consumer line`);
        }
        if (verifyBytes) {
          const templateText = fs.readFileSync(path.join(repositoryRoot, consumer.path), 'utf8');
          const lines = templateText.split('\n');
          assert.equal(sha256(lines[consumer.line - 1] ?? ''), consumer.sourceLineSha256,
            `${sourcePath}#${fieldPath}: exact consumer line changed`);
          const start = Math.max(0, consumer.line - 4);
          const end = Math.min(lines.length, consumer.line + 3);
          assert.equal(sha256(lines.slice(start, end).join('\n')), consumer.contextSha256,
            `${sourcePath}#${fieldPath}: consumer context changed while its value expression may be unchanged`);
          if (/\{\{-?\s*define\s+"[^"]+"/u.test(lines.slice(0, consumer.line).join('\n'))) {
            assert(consumer.receiverProof.some((receiver) => /exact (?:transitive )?call site for Helm helper .* (?:with root-context argument|with \.Values\.)/u.test(receiver.relation ?? '')),
              `${sourcePath}#${fieldPath}: helper value has no exact parameter/root include/template call-site proof`);
          }
          for (const receiver of consumer.receiverProof) {
            assert(Number.isSafeInteger(receiver.line) && receiver.line > 0,
              `${sourcePath}#${fieldPath}: receiver line is invalid`);
            assert(typeof receiver.relation === 'string' && receiver.relation.length >= 12,
              `${sourcePath}#${fieldPath}: receiver relationship is not explained`);
            const receiverPath = receiver.path ?? consumer.path;
            assert(receiverPath.startsWith(`${declaration.chartRoot}/templates/`),
              `${sourcePath}#${fieldPath}: receiver is outside the selected chart`);
            const receiverLines = fs.readFileSync(path.join(repositoryRoot, receiverPath), 'utf8').split('\n');
            assert.equal(sha256(receiverLines[receiver.line - 1] ?? ''), receiver.sourceLineSha256,
              `${sourcePath}#${fieldPath}: downstream receiver changed`);
          }
          for (const condition of consumer.conditionProof) {
            assert(condition.path === consumer.path && Number.isSafeInteger(condition.line) && condition.line > 0,
              `${sourcePath}#${fieldPath}: branch proof is outside the consumer template`);
            assert.equal(sha256(lines[condition.line - 1] ?? ''), condition.sourceLineSha256,
              `${sourcePath}#${fieldPath}: branch condition changed`);
          }
        }
      }
      assert.doesNotMatch(authority.purpose, /^Sets .+ in the rendered .+ resources\.$/u, `${sourcePath}#${fieldPath}: tautological render-only purpose`);
      assert(!/-unresolved$/u.test(authority.group), `${sourcePath}#${fieldPath}: unresolved semantic proposal was accepted`);
      if (authority.group === 'environment-runtime-contract') {
        assert(Array.isArray(authority.runtimeConsumerProof) && authority.runtimeConsumerProof.length > 0,
          `${sourcePath}#${fieldPath}: environment delivery has no runtime-boundary proof`);
      }
    }
  }
  for (const [chartRoot, chart] of Object.entries(registry.charts)) {
    assert(Object.keys(chart.templates).length > 0, `${chartRoot}: empty template authority set`);
    for (const [templatePath, sha256] of Object.entries(chart.templates)) {
      assert(templatePath.startsWith(`${chartRoot}/templates/`), `${templatePath}: template is outside ${chartRoot}`);
      assert.match(sha256, /^[a-f0-9]{64}$/u, `${templatePath}: invalid template digest`);
      if (verifyBytes) {
        const absoluteTemplate = path.join(repositoryRoot, templatePath);
        assert(fs.existsSync(absoluteTemplate), `${templatePath}: pinned template is missing`);
        assert.equal(crypto.createHash('sha256').update(fs.readFileSync(absoluteTemplate)).digest('hex'), sha256,
          `${templatePath}: pinned template bytes changed`);
      }
    }
  }
}

if (!process.argv.includes('--allow-local-helm-authority-maintenance')) {
  // Import-time validation proves the registry structure. The inventory calls
  // this function again with its selected --root to prove the actual bytes.
  assertLocalHelmAuthorityRegistry(process.cwd(), { verifyBytes: false });
}
