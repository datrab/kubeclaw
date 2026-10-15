import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Finite documentation-source substitution, not a runtime loader. The owning
// sync script copies exactly this contract directory. Product code is not run.
const plugin = 'skills/common/plugins/openclaw-agent-observer';
const generated = plugin + '/src/generated/agent-observability';
const canonical = 'contracts/agent-observability/v1/src';
const pins = {
  "skills/common/plugins/openclaw-agent-observer/src/config.ts": "1617f4937214a1b601b66d2525309a780c9202e54666a4ac3ff9135e3216297c",
  "skills/common/plugins/openclaw-agent-observer/src/observer-support.ts": "67444a5a791b2e408b53f3d166afce85937131890aba036b0037e42d9c78c774",
  "skills/common/plugins/openclaw-agent-observer/src/hook-normalizers.ts": "58976e1ae44055663149b4cd830f593e2fdebb41705413c88f99e858722cbab0",
  "skills/common/plugins/openclaw-agent-observer/src/hook-payloads.ts": "02a054facf3ca13ab0d875b1380c52a585362d96d5138b842f7bd026a03fcf6b",
  "skills/common/plugins/openclaw-agent-observer/src/hook-values.ts": "7514c3213f914e60b91e5139e6c624c7c289fdc26b1351786a8ee287caeaa911",
  "skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts": "8f974830cf10d931410d6bd1f23b4782aa8988b96baba13f4172a3b9f85d4a5d",
  "skills/common/plugins/openclaw-agent-observer/src/index.ts": "a800b92606e0c803ae51867c7625ae5610169e23b2074b54d69f58e5f0d6f3aa",
  "skills/common/plugins/openclaw-agent-observer/src/redis-writer-types.ts": "63ff685537b415cbe5a67c4b8d4ada42241ef2187fc278ec75ec403855763ac8",
  "skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs": "9cf81c81f0fa85ea740e578d6a3e10bcf86c7d85dec3c1ea287f3e7bab7d9fab",
  "skills/common/plugins/openclaw-agent-observer/scripts/build.mjs": "82b56e00d0aa995ec786f53b8d07036622507f47101dda78a02f2f2fe13b6098",
  "skills/common/plugins/openclaw-agent-observer/package.json": "6b11285263ea87e3b0642db57faaea2960fbe15b7db11a7286e96f73732cb63b",
  "skills/common/plugins/openclaw-agent-observer/.gitignore": "6a422561c8e2c996c88b744abd47737ecf65612a1fea716496425276f20329af",
  "contracts/agent-observability/v1/src/complexity.ts": "cc1e3f8a9beaaec2d56cb04533a681b7569e2ac8a457694248249380624d6d60",
  "contracts/agent-observability/v1/src/constants.ts": "7362261fe21d18e7acdf32b266f938a740e1106a4642579e7a1b203cb8b97924",
  "contracts/agent-observability/v1/src/index.ts": "53701c60777f686a2f9da25235ad02e755e820714ca8621de795bf1a5376acb3",
  "contracts/agent-observability/v1/src/mapping.ts": "76dcb599813722b108f9f0a918c60899c019ece2484b10587b628bf72f055592",
  "contracts/agent-observability/v1/src/routing.ts": "ef7851b00d9c32b46d890ca4210f4afee6fa0ecc9796fab417b6b2c705af571d",
  "contracts/agent-observability/v1/src/types.ts": "f1b3a0dff514d59f62a8448649c444b4eb6116de6d85500bc3aa6671ea63eb96",
  "contracts/agent-observability/v1/src/validation.ts": "2e8b7c17d7deeb0cc87e4bd2b05dc8e9712372de161e7c1eeb7cc5270ad6697e"
};
const callers = new Set(["skills/common/plugins/openclaw-agent-observer/src/config.ts", "skills/common/plugins/openclaw-agent-observer/src/observer-support.ts", "skills/common/plugins/openclaw-agent-observer/src/hook-normalizers.ts", "skills/common/plugins/openclaw-agent-observer/src/hook-payloads.ts", "skills/common/plugins/openclaw-agent-observer/src/hook-values.ts", "skills/common/plugins/openclaw-agent-observer/src/redis-writer.ts", "skills/common/plugins/openclaw-agent-observer/src/index.ts", "skills/common/plugins/openclaw-agent-observer/src/redis-writer-types.ts"]);
const names = ["complexity.ts", "constants.ts", "index.ts", "mapping.ts", "routing.ts", "types.ts", "validation.ts"];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fail(detail) { throw new Error('DOCUMENTATION_MATERIALIZED_SOURCE_UNQUALIFIED: ' + detail); }
function plain(root, relative, directory = false) {
  const absolute = path.resolve(root, relative);
  try { fs.lstatSync(absolute); } catch (error) { if (error.code === 'ENOENT') fail(relative + '; missing authority'); throw error; }
  if (fs.realpathSync(absolute) !== absolute) fail(relative + '; redirected path');
  const stat = fs.lstatSync(absolute);
  if (directory ? !stat.isDirectory() : !stat.isFile()) fail(relative + '; invalid kind');
  return absolute;
}
export function observerMaterializedSourceState(root) {
  // Unrelated small synthetic roots have no observer authority and no mapping.
  try { fs.lstatSync(path.join(root, plugin)); } catch (error) { if (error.code === 'ENOENT') return 'unavailable'; throw error; }
  if (JSON.stringify(fs.readdirSync(plain(root, canonical, true)).sort()) !== JSON.stringify(names)) fail(canonical + '; unsupported canonical members');
  for (const [file, expected] of Object.entries(pins)) {
    if (!fs.existsSync(path.join(root, file))) fail(file + '; missing authority');
    if (digest(fs.readFileSync(plain(root, file))) !== expected) fail(file + '; source/caller authority drift');
  }
  // Check existing ancestors even when the leaf is absent (including dangling
  // symlinks). A redirected generated parent cannot become an absent copy.
  let current = root;
  for (const component of generated.split('/')) {
    current = path.join(current, component);
    let stat; try { stat = fs.lstatSync(current); } catch (error) { if (error.code === 'ENOENT') return 'absent'; throw error; }
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(current) !== path.resolve(current)) fail(generated + '; redirected/non-directory ancestor');
  }
  const actual = fs.readdirSync(plain(root, generated, true)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(names)) fail(generated + '; incomplete or extra copy members');
  for (const name of names) if (digest(fs.readFileSync(plain(root, generated + '/' + name))) !== pins[canonical + '/' + name]) fail(generated + '/' + name + '; copy drift');
  return 'present-identical';
}
export function canonicalObserverDocumentationSource(root, source) {
  if (!source.startsWith(generated + '/')) return source;
  if (observerMaterializedSourceState(root) === 'unavailable') fail(source + '; no owning authority');
  const name = source.slice(generated.length + 1);
  if (!names.includes(name)) fail(source + '; unsupported copy member');
  return canonical + '/' + name;
}
export function resolveObserverDocumentationImport(root, source, specifier, kind, dependency = () => {}) {
  if (!callers.has(source) || specifier !== './generated/agent-observability/index.ts' || kind !== 'import') return null;
  if (observerMaterializedSourceState(root) === 'unavailable') fail(source + '; no owning authority');
  for (const file of Object.keys(pins)) dependency(file);
  return canonical + '/index.ts';
}
