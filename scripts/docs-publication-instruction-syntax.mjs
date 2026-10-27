import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { publicationExampleBlocks } from './lib/docs-publication-example-coverage.mjs';
import { textCommandReferences, syntaxMaterializations, embeddedProgramBindings } from './lib/docs-publication-instruction-bindings.mjs';

const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const cleanEnvironment = { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', TZ: 'UTC' };
function parseOnly(command, argv, source) {
  execFileSync(command, argv, { input: source, encoding: 'utf8', timeout: 15000,
    maxBuffer: 1024 * 1024, env: cleanEnvironment });
}

export function validateInstructionSyntax(pages, sources) {
  const textCommands = new Set(textCommandReferences);
  const selected = new Map();
  const materializations = [];
  for (const page of pages) {
    const markdown = sources.get(page);
    assert(typeof markdown === 'string', `unbound instruction page: ${page}`);
    for (const block of publicationExampleBlocks(markdown)) {
      const ref = `${page}#block-${block.ordinal}`;
      if (!['bash', 'sh'].includes(block.info) && !textCommands.has(ref)) continue;
      let source = block.content;
      for (const replacement of syntaxMaterializations[ref] ?? []) {
        assert(source.includes(replacement.from), `instruction placeholder changed: ${ref}`);
        source = source.replaceAll(replacement.from, replacement.to);
      }
      if (syntaxMaterializations[ref]) materializations.push({ ref,
        substitutions: syntaxMaterializations[ref], materializedSha256: hash(source), execution: false });
      parseOnly(block.info === 'sh' ? '/bin/sh' : '/bin/bash',
        block.info === 'sh' ? ['-n'] : ['--noprofile', '--norc', '-n'], source);
      selected.set(ref, block.content);
      textCommands.delete(ref);
    }
  }
  assert.equal(textCommands.size, 0, 'declared text command disappeared');
  assert.equal(selected.size, 447, 'instruction host responsibility changed');
  const embedded = [];
  for (const binding of embeddedProgramBindings) {
    assert(selected.has(binding.ref), `unbound embedded host input: ${binding.ref}`);
    const body = selected.get(binding.ref).slice(binding.start, binding.start + binding.length);
    assert.equal(hash(body), binding.sha256, `literal embedded host changed: ${binding.ref}`);
    if (binding.language === 'javascript') {
      assert(['module', 'commonjs'].includes(binding.mode));
      parseOnly(process.execPath, ['--check', `--input-type=${binding.mode}`], body);
    } else {
      assert.equal(binding.language, 'python');
      parseOnly('/usr/bin/python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], body);
    }
    embedded.push({ ref: binding.ref, language: binding.language, sourceSha256: binding.sha256 });
  }
  return { checkedCommandReferences: [...selected.keys()], embeddedLiteralSyntax: embedded,
    explicitMaterializations: materializations, documentCommandsExecuted: false,
    importsResolvedOrNativeArgumentsValidatedBySyntax: false,
    sqlAndYamlPayloads: 'Four authored payloads retain their separate native/projection/schema duties; no shell expansion or SQL executed' };
}
