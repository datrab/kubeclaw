"""Resolve immutable documentation observations, never configuration inputs.

Preserve refs in the matrix; resolve on inspection/validation without duplicating
large payloads. All bytes, RFC6901 targets and reconstructed objects are checked.
"""
import hashlib
import json
import re
from pathlib import Path

class ObservationReferences:
    def __init__(self, repository):
        self.repository = Path(repository).resolve()
        self.allowed = (self.repository/'docs/review/evidence/config-acceptance/runtime').resolve()
        self.artifacts = {}
        self.reference_count = 0

    @staticmethod
    def pointer(document, pointer):
        if pointer == '':
            return document
        if not isinstance(pointer,str) or not pointer.startswith('/'):
            raise ValueError('REFERENCE_POINTER_INVALID')
        for encoded in pointer[1:].split('/'):
            if re.search(r'~(?![01])',encoded):
                raise ValueError('REFERENCE_POINTER_ESCAPE_INVALID')
            token = encoded.replace('~1','/').replace('~0','~')
            if isinstance(document,list):
                if not re.fullmatch(r'0|[1-9][0-9]*',token) or int(token)>=len(document):
                    raise ValueError('REFERENCE_POINTER_ABSENT')
                document = document[int(token)]
            elif isinstance(document,dict) and token in document:
                document = document[token]
            else:
                raise ValueError('REFERENCE_POINTER_ABSENT')
        return document

    def resolve(self, value, stack=()):
        if isinstance(value,list):
            return [self.resolve(item,stack) for item in value]
        if not isinstance(value,dict):
            return value
        if value.get('kind') != 'immutable-observation-reference':
            return {key:self.resolve(item,stack) for key,item in value.items()}
        expected = {'kind','artifactPath','rfc6901Pointer','artifactSha256','valueSha256'}
        if set(value)!=expected:
            raise ValueError('REFERENCE_SHAPE_INVALID')
        relative = Path(value['artifactPath'])
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('REFERENCE_PATH_ESCAPE')
        path = (self.repository/relative).resolve()
        if not path.is_relative_to(self.allowed):
            raise ValueError('REFERENCE_PATH_ESCAPE')
        key = (str(path),value['rfc6901Pointer'])
        if key in stack:
            raise ValueError('REFERENCE_CYCLE')
        if not path.is_file():
            raise ValueError('REFERENCE_ARTIFACT_ABSENT')
        if path not in self.artifacts:
            raw = path.read_bytes()
            self.artifacts[path] = (hashlib.sha256(raw).hexdigest(),json.loads(raw))
        digest, document = self.artifacts[path]
        if digest != value['artifactSha256']:
            raise ValueError('REFERENCE_ARTIFACT_DRIFT')
        observed = self.pointer(document,value['rfc6901Pointer'])
        # Detect recursive references before their impossible self-content hash
        # can obscure the cycle with a secondary digest diagnostic.
        resolved = self.resolve(observed,stack+(key,))
        encoded = json.dumps(observed,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
        if hashlib.sha256(encoded).hexdigest()!=value['valueSha256']:
            raise ValueError('REFERENCE_WRONG_VALUE')
        self.reference_count += 1
        return resolved

    def summary(self):
        return {'referenceOccurrencesValidated':self.reference_count,
            'artifacts':[{'path':str(path.relative_to(self.repository)),'sha256':digest}
                for path,(digest,_) in sorted(self.artifacts.items())],
            'limits':'Document observation integrity only; no runtime/config interpretation or semantic acceptance'}
