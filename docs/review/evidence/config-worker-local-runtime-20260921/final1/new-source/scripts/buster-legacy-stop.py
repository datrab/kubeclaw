#!/usr/bin/env python3
"""External root maintenance producer. Never run against a host as a unit test."""
import argparse
import fcntl
import json
import os
from pathlib import Path
from buster_legacy_stop_policy import encode, read_policy, require, trusted_path
from buster_legacy_stop_runtime import capture
from buster_legacy_stop_transaction import STATE_ROOT, begin, resume
from buster_legacy_stop_files import ensure_directory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['capture', 'seal', 'resume'])
    parser.add_argument('--policy', required=True)
    parser.add_argument('--capture')
    parser.add_argument('--transaction')
    args = parser.parse_args()
    try:
        require(os.geteuid() == 0, 'HOST_ROOT_REQUIRED')
        policy = read_policy(args.policy)
        if args.action == 'capture':
            require(args.capture is None and args.transaction is None, 'ARGUMENTS')
            print(encode(capture(policy)).decode())
            return
        ensure_directory(STATE_ROOT.parent)
        ensure_directory(STATE_ROOT)
        lock = STATE_ROOT / '.producer-lock'
        fd = os.open(lock, os.O_RDONLY | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
        try:
            require(os.fstat(fd).st_nlink == 1, 'PRODUCER_LOCK_INVALID')
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if args.action == 'seal':
                require(args.capture is not None and args.transaction is None, 'ARGUMENTS')
                file = trusted_path(args.capture)
                require(file.stat().st_size <= policy['limits']['maximumReceiptBytes'], 'CAPTURE_QUOTA')
                receipt = begin(policy, json.loads(file.read_text()))
            else:
                require(args.transaction is not None and args.capture is None, 'ARGUMENTS')
                receipt = resume(args.transaction, policy)
            print(encode(receipt).decode())
        finally:
            os.close(fd)
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, f'{type(error).__name__}: {error}\n')


if __name__ == '__main__':
    main()
