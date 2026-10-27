#!/usr/bin/env python3
"""Extract checksum-pinned official native PG packages; never run maintainer scripts."""
import argparse
import hashlib
import json
import gzip
from pathlib import Path
import subprocess
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--destination', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
pins = json.loads((root / 'tests/fixtures/postgresql-native/packages.json').read_text())
assert pins['schemaVersion'] == 'kubeclaw-postgresql-native-package-pins.v1'
assert pins['repository'] == 'https://apt.postgresql.org/pub/repos/apt/'
destination = Path(args.destination).absolute()
assert not destination.exists(), 'use a new owned destination; never overwrite a prepared runtime'
destination.mkdir(parents=True, mode=0o755)
# Preserve the signed release/index snapshot so exact package provenance remains
# independently verifiable even after the upstream repository rotates versions.
fixture = root / 'tests/fixtures/postgresql-native'
index = pins['signedIndex']
for name, expected in index['files'].items():
    assert name in ['InRelease', 'Packages.gz', 'pgdg.gpg']
    assert hashlib.sha256((fixture / name).read_bytes()).hexdigest() == expected
verified_path = destination / 'verified-Release'
verified = subprocess.run(['gpgv', '--status-fd=1', '--output', str(verified_path), '--keyring',
                          str(fixture / index['keyring']), str(fixture / index['release'])],
                         check=True, capture_output=True, text=True)
assert any(line.startswith('[GNUPG:] VALIDSIG ' + pins['signedIndexKeyFingerprint'] + ' ')
           for line in verified.stdout.splitlines()), 'signed index signer mismatch'
release = verified_path.read_text()
sha_section = release.split('SHA256:\n', 1)[1].split('\nSHA512:', 1)[0]
entries = [line.split() for line in sha_section.splitlines() if len(line.split()) == 3]
selected = [entry for entry in entries if entry[2] == index['packagesPath']]
assert len(selected) == 1
compressed = (fixture / index['packages']).read_bytes()
assert len(compressed) == int(selected[0][1])
assert hashlib.sha256(compressed).hexdigest() == selected[0][0]
records = []
for paragraph in gzip.decompress(compressed).decode().split('\n\n'):
    fields = dict(line.split(': ', 1) for line in paragraph.splitlines()
                  if ': ' in line and not line.startswith(' '))
    if fields.get('Architecture') == 'amd64':
        records.append((fields, hashlib.sha256(paragraph.encode()).hexdigest()))
for package in pins['packages']:
    matches = [record for record, stanza_sha256 in records
               if stanza_sha256 == package['signedStanzaSha256']
               and all(record.get(key) == value for key, value in package.items()
                       if key != 'signedStanzaSha256')]
    assert len(matches) == 1, 'package pins differ from genuine signed repository entry'
for package in pins['packages']:
    relative = Path(package['Filename'])
    assert not relative.is_absolute() and '..' not in relative.parts
    request = urllib.request.Request(pins['repository'] + relative.as_posix(),
                                     headers={'User-Agent': 'KubeClaw native documentation fixture'})
    with urllib.request.urlopen(request, timeout=45) as response:
        body = response.read(int(package['Size']) + 1)
    assert len(body) == int(package['Size'])
    assert hashlib.sha256(body).hexdigest() == package['SHA256'], 'native package content differs from authenticated pin'
    archive = destination / relative.name
    archive.write_bytes(body)
    subprocess.run(['dpkg-deb', '-x', str(archive), str(destination / 'root')], check=True)
print(json.dumps({'version': pins['version'], 'extractedPackages': len(pins['packages']),
                  'binaryDirectory': str(destination / 'root/usr/lib/postgresql/18/bin'),
                  'maintainerScriptsExecuted': False}))
