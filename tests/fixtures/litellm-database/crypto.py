"""Exercise the unchanged pinned LiteLLM crypto module; no module replacements."""
import base64
import hashlib
import json
import sys
from pathlib import Path

from litellm.proxy.common_utils import encrypt_decrypt_utils as original

provenance = json.loads(Path(__file__).with_name('provenance.json').read_text())
assert hashlib.sha256(Path(original.__file__).read_bytes()).hexdigest() == provenance['cryptoModuleSha256']
request = json.load(sys.stdin)
if request['operation'] == 'encrypt':
    result = {
        'legacy': base64.urlsafe_b64encode(original.encrypt_value(request['plaintext'], request['key'])).decode(),
        'aes': original._encrypt_aes_gcm(request['plaintext'], request['key']),
    }
else:
    result = {}
    for name in ['legacy', 'aes']:
        try:
            value = request['ciphertext'][name]
            plaintext = (original.decrypt_value(base64.urlsafe_b64decode(value), request['key']) if name == 'legacy'
                         else original._decrypt_aes_gcm(value, request['key']))
            result[name] = plaintext == request['plaintext']
        except Exception:
            result[name] = False
print(json.dumps(result))
