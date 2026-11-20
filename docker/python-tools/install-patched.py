"""Install hash-verified locked wheels with our explicit Semgrep packaging fix.

The official wheel remains the hashed source. Rebuild its metadata only, replace
its unsafe exact MCP pin, and identify the resulting distribution as a local
security build. The normal offline pip resolver and pip check validate the full
closure; no dependency checks or scanner findings are suppressed.
"""
import base64
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile


def patch_semgrep(wheel, replacement):
    source_hash = hashlib.sha256(wheel.read_bytes()).hexdigest()
    with zipfile.ZipFile(wheel) as archive:
        files = {name: archive.read(name) for name in archive.namelist()}
        attributes = {item.filename: item.external_attr for item in archive.infolist()}
    metadata_path, = [name for name in files if name.endswith('.dist-info/METADATA')]
    metadata = files[metadata_path].decode()
    version, = re.findall(r'^Version: ([^\n]+)$', metadata, re.M)
    expected = 'Requires-Dist: mcp==1.29.0\n'
    if metadata.count(expected) != 1 or '+kubeclaw' in version:
        raise ValueError('Semgrep metadata changed: review/remove the downstream security patch')
    patched_version = version + '+kubeclaw.1'
    metadata = metadata.replace(expected, f'Requires-Dist: {replacement}\n').replace(
        f'Version: {version}\n', f'Version: {patched_version}\n', 1)
    old_info = metadata_path.rsplit('/', 1)[0]
    new_info = old_info.replace(version, patched_version)
    files[metadata_path] = metadata.encode()
    files = {name.replace(old_info + '/', new_info + '/'): data
             for name, data in files.items() if name != old_info + '/RECORD'}
    files[new_info + '/kubeclaw-security-patch.json'] = (json.dumps({
        'sourceWheel': wheel.name, 'sourceSha256': source_hash,
        'originalRequirement': 'mcp==1.29.0', 'patchedRequirement': replacement,
        'advisory': 'GHSA-qx49-fqc8-xw99'}, sort_keys=True) + '\n').encode()
    record = io.StringIO(newline='')
    writer = csv.writer(record, lineterminator='\n')
    for name, data in sorted(files.items()):
        checksum = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b'=').decode()
        writer.writerow([name, 'sha256=' + checksum, len(data)])
    writer.writerow([new_info + '/RECORD', '', ''])
    files[new_info + '/RECORD'] = record.getvalue().encode()
    parts = wheel.name.split('-')
    parts[1] = patched_version
    destination = wheel.with_name('-'.join(parts))
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            original_name = name.replace(new_info + '/', old_info + '/')
            info.external_attr = attributes.get(original_name, 0o644 << 16)
            archive.writestr(info, data)
    wheel.unlink()
    return destination


def main():
    lock = Path(sys.argv[1]).resolve()
    flags = sys.argv[2:]
    if flags not in ([], ['--break-system-packages']):
        raise ValueError('Unsupported installer flags')
    overrides = [line.strip() for line in Path(__file__).with_name('security-overrides.txt')
                 .read_text().splitlines() if line.strip() and not line.startswith('#')]
    if overrides != ['mcp==1.30.0']:
        raise ValueError('Review the security patch before changing its dependency')
    pip = [sys.executable, '-m', 'pip']
    with tempfile.TemporaryDirectory(prefix='kubeclaw-verified-wheels-') as directory:
        # --no-deps is confined to downloading the already complete lock. Every
        # input wheel must pass its committed hash before any patch/install.
        subprocess.run(pip + ['download', '--no-cache-dir', '--no-deps', '--require-hashes',
                              '--only-binary=:all:', '-r', str(lock), '-d', directory], check=True)
        wheel, = Path(directory).glob('semgrep-*.whl')
        patch_semgrep(wheel, overrides[0])
        subprocess.run(pip + ['install', '--no-index', '--no-cache-dir', *flags,
                              *map(str, sorted(Path(directory).glob('*.whl')))], check=True)
        subprocess.run(pip + ['check'], check=True)


if __name__ == '__main__':
    main()
