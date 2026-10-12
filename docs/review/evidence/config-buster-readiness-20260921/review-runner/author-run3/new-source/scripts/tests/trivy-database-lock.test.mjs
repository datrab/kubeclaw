import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { definitions, databaseLock, fileIdentity, installDatabases, validateDatabaseInputs } from '../trivy-database-lock.mjs';

const identity = bytes => ({ digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, size: bytes.length });
const clone = value => structuredClone(value);

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trivy-lock-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inputs = {}, sources = {}, requests = [];
  for (const [kind, definition] of Object.entries(definitions)) {
    const source = path.join(root, kind); fs.mkdirSync(source);
    const database = Buffer.from(`${kind}: fixture database, not a real scanner database`);
    const metadata = Buffer.from(JSON.stringify({ Version: definition.schema,
      UpdatedAt: '2026-09-20T00:00:00Z', NextUpdate: '2026-09-21T00:00:00Z' }));
    fs.writeFileSync(path.join(source, definition.file), database);
    fs.writeFileSync(path.join(source, 'metadata.json'), metadata);
    const archive = path.join(root, `${kind}.tar.gz`);
    execFileSync('tar', ['-czf', archive, '-C', source, definition.file, 'metadata.json']);
    const layer = await fileIdentity(archive);
    const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
      layers: [{ ...layer, mediaType: definition.mediaType }] }));
    inputs[kind] = { repository: definition.repository, manifest: identity(manifest), layer,
      files: { [definition.file]: identity(database), 'metadata.json': identity(metadata) } };
    sources[kind] = { source, archive, manifest, database, metadata };
  }
  const reader = repository => {
    const kind = Object.keys(inputs).find(key => inputs[key].repository === repository);
    assert(kind, 'only locked repositories may be requested');
    return (type, reference, output) => {
      requests.push({ kind, type, reference });
      assert.match(reference, /^sha256:[a-f0-9]{64}$/u, 'installer never resolves a mutable tag');
      if (type === 'manifests') { assert.equal(reference, inputs[kind].manifest.digest); return sources[kind].manifest; }
      assert.equal(type, 'blobs'); assert.equal(reference, inputs[kind].layer.digest);
      fs.copyFileSync(sources[kind].archive, output);
    };
  };
  const lock = databaseLock({ buildArgs: { TRIVY_VERSION: '0.74.0' }, trivyDatabases: inputs });
  return { root, sources, inputs, requests, reader, lock, target: path.join(root, 'cache') };
}

test('TD01/07: exact locked files publish together without rewriting metadata or resolving tags', async t => {
  const f = await fixture(t);
  await installDatabases(f.lock, f.target, '0.74.0', f.reader);
  for (const [kind, definition] of Object.entries(definitions)) {
    assert.deepEqual(fs.readFileSync(path.join(f.target, definition.directory, definition.file)), f.sources[kind].database);
    assert.deepEqual(fs.readFileSync(path.join(f.target, definition.directory, 'metadata.json')), f.sources[kind].metadata);
  }
  assert.deepEqual(fs.readdirSync(f.target).sort(), ['db', 'java-db']);
  assert.equal(f.requests.length, 4);
  assert.equal(fs.existsSync(`${f.target}.installing`), false);
});

test('TD02/13: malformed inputs and scanner mismatch fail before registry access', async t => {
  const f = await fixture(t);
  for (const change of [input => { delete input.java; }, input => { input.java.layer.digest = 'sha256:bad'; },
    input => { input.java.repository = 'unselected.example/db'; }]) {
    const input = clone(f.inputs); change(input); assert.throws(() => validateDatabaseInputs(input), /TRIVY_DB_/u);
  }
  await assert.rejects(installDatabases(f.lock, f.target, '0.73.0', f.reader), /SCANNER_VERSION_MISMATCH/u);
  assert.equal(f.requests.length, 0); assert.equal(fs.existsSync(f.target), false);
});

for (const kind of ['vulnerability', 'java']) {
  test(`TD04: changed ${kind} manifest is rejected without publishing either database`, async t => {
    const f = await fixture(t); f.sources[kind].manifest = Buffer.concat([f.sources[kind].manifest, Buffer.from(' ')]);
    await assert.rejects(installDatabases(f.lock, f.target, '0.74.0', f.reader), /MANIFEST_DIGEST_MISMATCH/u);
    assert.equal(fs.existsSync(f.target), false); assert.equal(fs.existsSync(`${f.target}.installing`), false);
  });
  test(`TD05: changed ${kind} archive is rejected before extraction`, async t => {
    const f = await fixture(t); fs.appendFileSync(f.sources[kind].archive, 'corrupt');
    await assert.rejects(installDatabases(f.lock, f.target, '0.74.0', f.reader), /LAYER_DIGEST_MISMATCH/u);
    assert.equal(fs.existsSync(f.target), false);
  });
}

test('TD06: correct archive with wrong locked extracted bytes fails', async t => {
  const f = await fixture(t); const changed = clone(f.lock);
  changed.databases.java.files['trivy-java.db'].digest = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(installDatabases(changed, f.target, '0.74.0', f.reader), /FILE_DIGEST_MISMATCH/u);
  assert.equal(fs.existsSync(f.target), false);
});

for (const member of ['duplicate', 'symlink', 'traversal']) {
  test(`TD06: ${member} archive members are rejected before publication`, async t => {
    const f = await fixture(t); const source = f.sources.java; const definition = definitions.java;
    if (member === 'duplicate') execFileSync('tar', ['-czf', source.archive, '-C', source.source,
      definition.file, 'metadata.json', definition.file]);
    else {
      execFileSync('python3', ['-c',
        'import io,sys,tarfile\nwith tarfile.open(sys.argv[1],"w:gz") as t:\n i=tarfile.TarInfo("trivy-java.db" if sys.argv[2]=="symlink" else "../escape")\n i.type=tarfile.SYMTYPE if sys.argv[2]=="symlink" else tarfile.REGTYPE\n i.linkname="/etc/passwd" if sys.argv[2]=="symlink" else ""\n t.addfile(i,io.BytesIO(b""))\n t.add(sys.argv[3],arcname="metadata.json")',
        source.archive, member, path.join(source.source, 'metadata.json')]);
    }
    f.inputs.java.layer = await fileIdentity(source.archive);
    source.manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
      layers: [{ ...f.inputs.java.layer, mediaType: definition.mediaType }] }));
    f.inputs.java.manifest = identity(source.manifest);
    await assert.rejects(installDatabases(f.lock, f.target, '0.74.0', f.reader), /ARCHIVE_MEMBERS_INVALID/u);
    assert.equal(fs.existsSync(f.target), false); assert.equal(fs.existsSync(path.join(f.root, 'escape')), false);
  });
}

test('TD08: registry failure has no fallback or partial cache publication', async t => {
  const f = await fixture(t); let calls = 0;
  await assert.rejects(installDatabases(f.lock, f.target, '0.74.0', () => () => {
    calls++; throw new Error('fixture registry unavailable');
  }), /registry unavailable/u);
  assert.equal(calls, 1); assert.equal(fs.existsSync(f.target), false);
});

test('TD09/14: existing directory and dangling symlink remain untouched', async t => {
  const f = await fixture(t); fs.mkdirSync(f.target); fs.writeFileSync(path.join(f.target, 'keep'), 'retained');
  await assert.rejects(installDatabases(f.lock, f.target, '0.74.0', f.reader), /DESTINATION_EXISTS/u);
  assert.equal(fs.readFileSync(path.join(f.target, 'keep'), 'utf8'), 'retained');
  const linked = path.join(f.root, 'dangling'); fs.symlinkSync(path.join(f.root, 'absent'), linked);
  await assert.rejects(installDatabases(f.lock, linked, '0.74.0', f.reader), /DESTINATION_EXISTS/u);
  assert(fs.lstatSync(linked).isSymbolicLink()); assert.equal(f.requests.length, 0);
});

test('TD14: two installers cannot publish or merge into the same destination', async t => {
  const f = await fixture(t);
  const attempts = await Promise.allSettled([installDatabases(f.lock, f.target, '0.74.0', f.reader),
    installDatabases(f.lock, f.target, '0.74.0', f.reader)]);
  assert.equal(attempts[0].status, 'fulfilled'); assert.equal(attempts[1].status, 'rejected');
  assert.equal(attempts[1].reason.code, 'EEXIST');
  assert.deepEqual(fs.readFileSync(path.join(f.target, 'java-db', 'metadata.json')), f.sources.java.metadata);
});

function isolatedCli(t, f) {
  const isolated = path.join(f.root, 'cli');
  for (const directory of ['scripts', 'docker', 'bin']) fs.mkdirSync(path.join(isolated, directory), { recursive: true });
  fs.copyFileSync(new URL('../trivy-database-lock.mjs', import.meta.url), path.join(isolated, 'scripts/trivy-database-lock.mjs'));
  const versions = { buildArgs: { TRIVY_VERSION: '0.74.0' }, trivyDatabases: f.inputs };
  fs.writeFileSync(path.join(isolated, 'versions.json'), JSON.stringify(versions));
  fs.writeFileSync(path.join(isolated, 'docker/trivy-databases.lock.json'), JSON.stringify(f.lock));
  // A sentinel executable fails immediately if production CLI reaches its real
  // registry boundary. No transport injection into the CLI is used.
  const access = path.join(isolated, 'network-access');
  fs.writeFileSync(path.join(isolated, 'bin/curl'), '#!/bin/sh\nprintf reached > "$TRIVY_TEST_NETWORK_ACCESS"\nexit 97\n', { mode: 0o755 });
  const run = scanner => spawnSync(process.execPath,
    [path.join(isolated, 'scripts/trivy-database-lock.mjs'), '--install', f.target, scanner],
    { encoding: 'utf8', env: { ...process.env, PATH: path.join(isolated, 'bin'), TRIVY_TEST_NETWORK_ACCESS: access } });
  return { isolated, versions, run, access };
}

for (const drift of ['authored', 'generated']) {
  test(`TD02: actual CLI rejects ${drift} database lock drift before registry access`, async t => {
    const f = await fixture(t), cli = isolatedCli(t, f);
    if (drift === 'authored') {
      cli.versions.trivyDatabases.java.files['metadata.json'].size++;
      fs.writeFileSync(path.join(cli.isolated, 'versions.json'), JSON.stringify(cli.versions));
    } else {
      const changed = clone(f.lock); changed.databases.java.files['metadata.json'].size++;
      fs.writeFileSync(path.join(cli.isolated, 'docker/trivy-databases.lock.json'), JSON.stringify(changed));
    }
    const result = cli.run('0.74.0');
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /TRIVY_DB_AUTHORING_DRIFT/u);
    assert.equal(fs.existsSync(cli.access), false); assert.equal(fs.existsSync(f.target), false);
  });
}

test('TD13: actual CLI checks installed scanner against the consistent authored lock', async t => {
  const f = await fixture(t), cli = isolatedCli(t, f);
  const result = cli.run('0.73.0');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /TRIVY_DB_SCANNER_VERSION_MISMATCH/u);
  assert.equal(fs.existsSync(cli.access), false); assert.equal(fs.existsSync(f.target), false);
  // Positive control for the sentinel: the same CLI with the matching scanner
  // reaches the actual registry boundary, proving its absence above is meaningful.
  const matching = cli.run('0.74.0');
  assert.equal(matching.status, 1); assert.equal(fs.readFileSync(cli.access, 'utf8'), 'reached');
  assert.equal(fs.existsSync(f.target), false);
});

test('TD11: production Dockerfile wires authored inputs and installer; obsolete refresh paths are absent', () => {
  const read = name => fs.readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
  const dockerfile = read('docker/Dockerfile.buster-runtime');
  for (const file of ['versions.json', 'docker/trivy-databases.lock.json', 'scripts/trivy-database-lock.mjs']) {
    assert.ok(dockerfile.includes(`COPY ${file} /app/${file}\n`), `missing production input ${file}`);
  }
  assert.ok(dockerfile.includes('RUN node /app/scripts/trivy-database-lock.mjs --install /home/builder/.cache/trivy "$(trivy --version | sed -n \'s/^Version: //p\')"'));
  for (const source of [dockerfile, read('.github/workflows/build-images.yaml'), read('.github/workflows/role-images.yaml')]) {
    assert.doesNotMatch(source, /TRIVY_DATABASE_REFRESH|--download-db-only|--download-java-db-only/u);
  }
  // This is a source-wiring check, not evidence that a Docker image was built.
});
