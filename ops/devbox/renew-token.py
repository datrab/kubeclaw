#!/usr/bin/python3
"""Refresh only the observer token, atomically; keep the previous token on failure."""
import base64
import json
import os
import subprocess
import tempfile
import time

result = subprocess.run(['/usr/bin/ssh', '-F', '/etc/kubeclaw-ops/ssh_config', '-T', 'kubeclaw-token'],
                        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        timeout=25, check=False, env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8'})
if result.returncode:
    raise SystemExit('Observer token renewal failed; previous token retained. Check SSH and API availability.')
token = result.stdout.decode('ascii').strip()
try:
    if len(token) > 32768 or any(c.isspace() for c in token):
        raise ValueError()
    payload = token.split('.')[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
    if claims['sub'] != 'system:serviceaccount:kubeclaw-ops:external-ops' or claims['exp'] < time.time() + 7200:
        raise ValueError()
except (ValueError, KeyError, IndexError, UnicodeError):
    raise SystemExit('Observer token has unexpected identity or insufficient lifetime; previous token retained.') from None
# Claim parsing is a sanity check; the API verifies the token signature.
directory = '/var/lib/kubeclaw-ops'
fd, name = tempfile.mkstemp(prefix='.token-', dir=directory)
try:
    with os.fdopen(fd, 'w') as stream:
        stream.write(token + '\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(name, directory + '/kubernetes-token')
finally:
    if os.path.exists(name):
        os.unlink(name)
print('Observer token renewed; expires in approximately %d seconds' % (claims['exp'] - time.time()))
