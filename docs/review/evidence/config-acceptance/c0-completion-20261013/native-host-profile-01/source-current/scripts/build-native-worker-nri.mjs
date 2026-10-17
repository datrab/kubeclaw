// Installer-Step: native.build; category: prepare. See scripts/install/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repository = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.length !== 3) throw new Error('Usage: build-native-worker-nri.mjs NEW_OUTPUT_BINARY');
const output = path.resolve(process.argv[2]);
if (fs.existsSync(output)) throw new Error('NATIVE_NRI_BUILD_OUTPUT_EXISTS');
const version = JSON.parse(fs.readFileSync(path.join(repository, 'versions.json'), 'utf8')).buildArgs.GO_VERSION;
const env = { ...process.env, GOTOOLCHAIN: 'local', CGO_ENABLED: '0' };
const cwd = path.join(repository, 'tools/native-worker-nri');
if (execFileSync('go', ['env', 'GOVERSION'], { cwd, env, encoding: 'utf8' }).trim() !== `go${version}`) {
  throw new Error('NATIVE_NRI_SELECTED_GO_VERSION_REQUIRED');
}
execFileSync('go', ['mod', 'verify'], { cwd, env, stdio: 'inherit' });
execFileSync('go', ['build', '-mod=readonly', '-trimpath', '-buildvcs=false', '-o', output, '.'], { cwd, env, stdio: 'inherit' });
process.stdout.write(`${output}\n`);
