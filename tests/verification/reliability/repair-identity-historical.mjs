import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));
const producerPath = 'docs/review/evidence/run2-sdk-remaining/repair-authorization-locale.mjs';

function dependency(source, destination) {
  if (fs.lstatSync(source).isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(source), destination);
  else fs.symlinkSync(source, destination, 'dir');
}

/** Original producer overlay. No checkout, network, old Git object, or tag removal. */
export function materializeLegacyCore(destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const name of ['skills', 'tests', 'contracts']) {
    fs.cpSync(path.join(checkout, name), path.join(destination, name), {
      recursive: true, verbatimSymlinks: true,
      filter: file => !file.split(path.sep).includes('node_modules'),
    });
  }
  fs.copyFileSync(path.join(checkout, 'package.json'), path.join(destination, 'package.json'));
  const modules = path.join(destination, 'node_modules'); fs.mkdirSync(modules);
  for (const entry of fs.readdirSync(path.join(checkout, 'node_modules'))) {
    const source = path.join(checkout, 'node_modules', entry);
    if (entry.startsWith('@')) {
      fs.mkdirSync(path.join(modules, entry));
      for (const name of fs.readdirSync(source)) dependency(path.join(source, name), path.join(modules, entry, name));
    } else dependency(source, path.join(modules, entry));
  }
  const archive = JSON.parse(fs.readFileSync(new URL('../../fixtures/repair-budget/legacy-core.json', import.meta.url), 'utf8'));
  for (const file of archive.files) {
    const bytes = Buffer.from(file.content);
    assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), file.gitBlob);
    const target = path.join(destination, file.path);
    assert(target.startsWith(`${destination}${path.sep}`));
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
  }
  assert.equal(fs.realpathSync(path.join(modules, '@kubeclaw/plugin-sdk')), path.join(destination, 'skills/common/plugin-runtime/sdk'));
  return { destination, producer: path.join(destination, producerPath), archive };
}

export function legacyOperation(legacy, mode, root, locale = 'en_US.UTF-8') {
  const env = { ...process.env, LANG: locale, LC_ALL: locale }; delete env.NODE_TEST_CONTEXT;
  return JSON.parse(execFileSync(process.execPath, [legacy.producer, mode, root], {
    cwd: legacy.destination, env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  }));
}
