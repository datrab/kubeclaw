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
  // This newly documented library check is not a runtime registration. Keep
  // its real workspace commands distinct from the existing verification block.
  const promptPage = 'docs/site/extend/contracts.md';
  const promptBlocks = publicationExampleBlocks(sources.get(promptPage) ?? '');
  assert.equal(promptBlocks.length, 2, 'prompt contract instruction responsibilities changed');
  assert.equal(promptBlocks[0].info, 'bash', 'prompt library commands must retain their shell syntax owner');
  assert.equal(promptBlocks[0].content,
    'npm run build --workspace @kubeclaw/prompt-contract\nnpm test --workspace @kubeclaw/prompt-contract\n',
    'prompt library workspace commands changed; review the actual package receiver');
  assert.equal(hash(promptBlocks[1].content), '9705523f44ad3b7e115ea9071851d0d7e29d3298edd4f444df77d687ed27c01b',
    'existing five-registration verification body changed, not merely its block ordinal');
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
  // Preserve all454 previous hosts and the four uncertain-effect procedure blocks.
  // The explicit declaration binds every old/new block; all parser-only limits remain.
  assert.equal(selected.size, 458, 'instruction host responsibility changed');
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
