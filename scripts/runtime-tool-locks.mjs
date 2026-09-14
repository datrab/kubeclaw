import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const groups = ['common', 'semgrep-nova', 'buster'];
const inputs = [...groups.map(group => `docker/python-tools/${group}.in`), 'docker/go-tools/requirements.json'];
const outputs = [...groups.map(group => `docker/python-tools/${group}.txt`), 'docker/go-tools/go.mod', 'docker/go-tools/go.sum'];
const receiptFile = 'docker/runtime-tool-locks.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function identities(directory, names) {
  return Object.fromEntries(names.map(name => [name, digest(fs.readFileSync(path.join(directory, name)))]));
}

export function checkRuntimeToolLocks(directory = root) {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, receiptFile), 'utf8'));
  if (receipt.schemaVersion !== 'runtime-tool-locks.v1'
    || JSON.stringify(receipt.inputs) !== JSON.stringify(identities(directory, inputs))
    || JSON.stringify(receipt.outputs) !== JSON.stringify(identities(directory, outputs))) {
    throw new Error('RUNTIME_TOOL_LOCK_DRIFT: run npm run versions:sync and review the resolved lock changes');
  }
  for (const group of groups) {
    const requirements = fs.readFileSync(path.join(directory, `docker/python-tools/${group}.in`), 'utf8');
    const locked = fs.readFileSync(path.join(directory, `docker/python-tools/${group}.txt`), 'utf8');
    for (const line of requirements.split('\n').filter(line => line && !line.startsWith('#'))) {
      if (!locked.split('\n').some(lockedLine => lockedLine.startsWith(`${line} `))) throw new Error('RUNTIME_PYTHON_ROOT_NOT_LOCKED');
    }
  }
  return { inputs: inputs.length, locks: outputs.length };
}

function run(command, args, cwd) {
  const executable = command === 'go' ? 'env' : command;
  const arguments_ = command === 'go' ? ['GOTOOLCHAIN=local', 'go', ...args] : args;
  return execFileSync(executable, arguments_, { cwd, encoding: 'utf8', timeout: 600000,
    maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
}

function resolvePython(directory, temporary) {
  for (const group of groups) {
    const source = `docker/python-tools/${group}.in`, output = `docker/python-tools/${group}.txt`;
    const common = ['pip', 'compile', '--python-version', '3.11', '--generate-hashes', '--only-binary', ':all:',
      '--no-annotate', '--no-header', '--default-index', 'https://pypi.org/simple'];
    run('uv', [...common, '--python-platform', 'x86_64-manylinux_2_36', source, '-o', output], directory);
    const arm = path.join(temporary, `${group}-arm64.txt`);
    run('uv', [...common, '--python-platform', 'aarch64-manylinux_2_36', '--constraints', output, source, '-o', arm], directory);
    if (!fs.readFileSync(path.join(directory, output)).equals(fs.readFileSync(arm))) throw new Error('RUNTIME_PYTHON_ARCHITECTURE_LOCK_MISMATCH');
  }
}

function resolveGo(directory) {
  const cwd = path.join(directory, 'docker/go-tools');
  const requirements = JSON.parse(fs.readFileSync(path.join(cwd, 'requirements.json'), 'utf8'));
  if (!run('go', ['version'], cwd).startsWith(`go version go${requirements.GO_VERSION} `)) throw new Error('RUNTIME_GO_TOOLCHAIN_NOT_SELECTED');
  if (!fs.existsSync(path.join(cwd, 'go.mod'))) run('go', ['mod', 'init', 'kubeclaw.local/runtime-tools'], cwd);
  run('go', ['get', '-tool', `honnef.co/go/tools/cmd/staticcheck@${requirements.STATICCHECK_VERSION}`,
    `golang.org/x/vuln/cmd/govulncheck@${requirements.GOVULNCHECK_VERSION}`,
    `github.com/fzipp/gocyclo/cmd/gocyclo@${requirements.GOCYCLO_VERSION}`], cwd);
  run('go', ['mod', 'tidy'], cwd);
  run('go', ['mod', 'download', 'all'], cwd);
  run('go', ['mod', 'verify'], cwd);
}

export function updateRuntimeToolLocks(directory = root) {
  try { return checkRuntimeToolLocks(directory); }
  catch (error) {
    if (error.code !== 'ENOENT' && !error.message.startsWith('RUNTIME_')) throw error;
    console.error(`Refreshing runtime tool locks: ${error.message}`);
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-tool-locks-'));
  try {
    resolvePython(directory, temporary);
    resolveGo(directory);
    // A failed resolution cannot publish a receipt certifying partial outputs.
    fs.writeFileSync(path.join(directory, receiptFile), JSON.stringify({ schemaVersion: 'runtime-tool-locks.v1',
      inputs: identities(directory, inputs), outputs: identities(directory, outputs) }, null, 2) + '\n');
    return checkRuntimeToolLocks(directory);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || !['--check', '--update'].includes(process.argv[2])) throw new Error('Usage: runtime-tool-locks.mjs --check|--update');
  console.log(JSON.stringify(process.argv[2] === '--check' ? checkRuntimeToolLocks() : updateRuntimeToolLocks()));
}
