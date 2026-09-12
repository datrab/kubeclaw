#!/usr/bin/env python3
"""Delete only frozen, unchanged branch tips already reachable from remote main."""
import argparse
import json
from pathlib import Path
import subprocess


def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='perform leased, atomic remote deletion')
    args = parser.parse_args()
    root = Path(git('rev-parse', '--show-toplevel'))
    inventory = json.loads((root / 'docs/review/branch-cleanup-20260912/branches.json').read_text())
    expected = {b['name']: b['sha'] for b in inventory if b['name'] != 'main'}
    require(len(expected) == 261, 'Unexpected frozen inventory')
    allowed = {'https://github.com/datrab/kubeclaw.git', 'https://github.com/datrab/kubeclaw',
               'git@github.com:datrab/kubeclaw.git', 'ssh://git@github.com/datrab/kubeclaw.git'}
    require(git('remote', 'get-url', 'origin') in allowed, 'origin must be datrab/kubeclaw')
    require(git('remote', 'get-url', '--push', 'origin') in allowed, 'push origin must be datrab/kubeclaw')

    def verify():
        git('fetch', '--no-tags', 'origin', 'refs/heads/main')
        main_sha = git('rev-parse', 'FETCH_HEAD')
        refs = {}
        for line in git('ls-remote', '--heads', 'origin').splitlines():
            sha, ref = line.split()
            refs[ref.removeprefix('refs/heads/')] = sha
        require(refs.get('main') == main_sha, 'main moved during verification; rerun')
        for name, sha in expected.items():
            require(name not in refs or refs[name] == sha, f'Branch changed since audit: {name}')
            result = subprocess.run(['git', 'merge-base', '--is-ancestor', sha, main_sha], capture_output=True)
            require(result.returncode == 0, f'Tip not reachable from main: {name}; use a complete fetch, never a shallow clone')
        return sorted(name for name in expected if name in refs), main_sha

    pending, main_sha = verify()
    print(json.dumps({'mode': 'apply' if args.apply else 'dry-run', 'main': main_sha,
                      'eligible': len(pending), 'alreadyAbsent': len(expected) - len(pending),
                      'branches': pending}), flush=True)
    if not args.apply:
        return
    deleted = 0
    while pending:
        # Recheck main and every frozen ref before each transaction. Explicit leases
        # also reject branch changes between this check and the server-side push.
        pending, main_sha = verify()
        batch = pending[:40]
        if not batch:
            break
        leases = [f'--force-with-lease=refs/heads/{name}:{expected[name]}' for name in batch]
        deletions = [f':refs/heads/{name}' for name in batch]
        subprocess.run(['git', 'push', '--atomic', *leases, 'origin', *deletions], check=True)
        deleted += len(batch)
        print(json.dumps({'deletedThisRun': deleted, 'batch': batch}), flush=True)
    pending, main_sha = verify()
    print(json.dumps({'complete': not pending, 'deletedThisRun': deleted, 'main': main_sha}), flush=True)


if __name__ == '__main__':
    main()
