"""Evidence-only exact-scope review resolution; never production authorization.

Conservation excludes only a top-level review-decoration reference. Original
source bodies/history, results, requirements and all other properties remain
part of the digest. Trust comes from externally established, pinned independent
deliveries, not any boolean/signature claim in an authored file.
"""
import hashlib
import json
import re
from pathlib import Path

from review_deliveries import REGISTERED_INDEPENDENT_DELIVERIES

SHA = re.compile(r'^[a-f0-9]{64}$')
REF_KEYS = {'receiptPath', 'receiptSha256', 'revisionSha256', 'kind', 'id'}
KINDS = {'setting', 'case', 'requirement', 'supplemental', 'definition-observation',
         'native-package', 'native-map', 'coordinate', 'candidate', 'source'}


def definition_body(value, decoration='reviewerConfirmation'):
    return {key: item for key, item in value.items() if key != decoration}


def definition_sha(value, decoration='reviewerConfirmation'):
    data = json.dumps(definition_body(value, decoration), sort_keys=True,
                      separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(data.encode('utf8')).hexdigest()


def canonical_sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                    ensure_ascii=False, allow_nan=False).encode()).hexdigest()


class ReviewReceipts:
    def __init__(self, root, registrations=None):
        self.root = Path(root).resolve()
        self.registrations = tuple(REGISTERED_INDEPENDENT_DELIVERIES
                                   if registrations is None else registrations)
        self.catalog = {}
        self.loaded = {}
        self.revisions = {}
        self.pins = {}

    def observe(self, kind, identifier, value, decoration='reviewerConfirmation'):
        if kind not in KINDS or not isinstance(identifier, str) or not identifier:
            raise ValueError('REVIEW_SCOPE_ID_INVALID')
        key = (kind, identifier)
        digest = definition_sha(value, decoration)
        if key in self.catalog and self.catalog[key] != digest:
            raise ValueError('REVIEW_SCOPE_DUPLICATE:' + str(key))
        self.catalog[key] = digest
        self.revisions.clear()

    def _pinned(self, path, expected):
        if not isinstance(path, str) or not isinstance(expected, str) or not SHA.fullmatch(expected):
            raise ValueError('REVIEW_PIN_INVALID')
        if Path(path).is_absolute() or '..' in Path(path).parts:
            raise ValueError('REVIEW_PATH_INVALID')
        file = (self.root / path).resolve()
        if not file.is_relative_to(self.root) or not file.is_file():
            raise ValueError('REVIEW_PATH_INVALID')
        data = file.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError('REVIEW_PIN_DRIFT:' + path)
        # Retain the named reference, not merely its old resolved target.
        # A file or parent-directory symlink can otherwise be retargeted while
        # the old target still passes its content check.
        pin = (str(file), expected)
        if path in self.pins and self.pins[path] != pin:
            raise ValueError('REVIEW_PIN_CHANGED:' + path)
        self.pins[path] = pin
        return data

    def assert_no_drift(self):
        # Acceptance is valid only after this end-of-check verification. The
        # catalog is a single parsed immutable definition revision; a new
        # revision uses a new verifier/catalog, never mutates a cached sibling.
        for path, (original_target, expected) in self.pins.items():
            current = (self.root / path).resolve()
            if (not current.is_relative_to(self.root) or not current.is_file()
                    or str(current) != original_target
                    or hashlib.sha256(current.read_bytes()).hexdigest() != expected):
                raise ValueError('REVIEW_INPUT_CHANGED:' + path)

    def _receipt(self, reference):
        matches = [entry for entry in self.registrations
                   if entry['receiptPath'] == reference['receiptPath']
                   and entry['receiptSha256'] == reference['receiptSha256']]
        if len(matches) != 1:
            raise ValueError('REVIEW_DELIVERY_NOT_REGISTERED')
        pin = matches[0]
        key = (pin['receiptPath'], pin['receiptSha256'])
        if key not in self.loaded:
            receipt = json.loads(self._pinned(*key))
            self._pinned(pin['reportPath'], pin['reportSha256'])
            delivery = json.loads(self._pinned(pin['deliveryPath'], pin['deliverySha256']))
            if (receipt['schemaVersion'] != 'config-definition-review.v1'
                    or receipt['reviewerTask'] != pin['reviewerTask']
                    or receipt['reportPath'] != pin['reportPath']
                    or receipt['reportSha256'] != pin['reportSha256']
                    or delivery['reviewerTask'] != pin['reviewerTask']
                    or delivery['receiptPath'] != pin['receiptPath']
                    or delivery['receiptSha256'] != pin['receiptSha256']
                    or delivery['outcome'] != 'accepted-definition-scope'
                    or receipt['verdict'] != 'accepted-definition-scope'
                    or receipt['unresolvedMaterialFindings'] != []):
                raise ValueError('REVIEW_SCOPE_NOT_ACCEPTED')
            manifest = json.loads(self._pinned(receipt['inputManifestPath'], receipt['inputManifestSha256']))
            if not manifest['files'] or len({v['path'] for v in manifest['files']}) != len(manifest['files']):
                raise ValueError('REVIEW_INPUT_SET_INVALID')
            for file in manifest['files']:
                self._pinned(file['path'], file['sha256'])
            scope = receipt['scope']
            if (not isinstance(scope, list) or any(
                    not isinstance(entry, dict)
                    or set(entry) != {'kind', 'id', 'bodySha256'}
                    or entry['kind'] not in KINDS
                    or not isinstance(entry['id'], str) or not entry['id']
                    or not isinstance(entry['bodySha256'], str)
                    or not SHA.fullmatch(entry['bodySha256']) for entry in scope)):
                raise ValueError('REVIEW_SCOPE_INVALID')
            keys = [(entry['kind'], entry['id']) for entry in scope]
            if not scope or len(set(keys)) != len(keys) or canonical_sha(scope) != receipt['revisionSha256']:
                raise ValueError('REVIEW_REVISION_INVALID')
            self.loaded[key] = receipt
        return self.loaded[key]

    def confirmed(self, kind, identifier, value, decoration='reviewerConfirmation'):
        reference = value.get(decoration)
        if not isinstance(reference, dict) or set(reference) != REF_KEYS:
            return False
        if (reference['kind'], reference['id']) != (kind, identifier):
            return False
        try:
            receipt = self._receipt(reference)
            if reference['revisionSha256'] != receipt['revisionSha256']:
                return False
            requirement_context = [{'id': identifier, 'bodySha256': digest}
                                   for (scope_kind, identifier), digest in self.catalog.items()
                                   if scope_kind == 'requirement']
            requirement_context.sort(key=lambda entry: entry['id'])
            if (not requirement_context or canonical_sha(requirement_context)
                    != receipt['requirementContextSha256']):
                return False
            scope = receipt['scope']
            # Check the whole named revision, not just the queried item. A stale
            # sibling invalidates this receipt; unrelated scopes do not widen it.
            revision_key = (reference['receiptPath'], reference['receiptSha256'])
            if revision_key not in self.revisions:
                self.revisions[revision_key] = all(
                    self.catalog.get((entry['kind'], entry['id'])) == entry['bodySha256']
                    for entry in scope)
            if not self.revisions[revision_key]:
                return False
            included = next((entry for entry in scope
                             if (entry['kind'], entry['id']) == (kind, identifier)), None)
            return included is not None and definition_sha(value, decoration) == included['bodySha256']
        except (OSError, ValueError, KeyError, TypeError, StopIteration):
            return False

    def draft_or_confirmed(self, kind, identifier, value, decoration='reviewerConfirmation'):
        return value.get(decoration) is None or self.confirmed(kind, identifier, value, decoration)

    def conserved(self, kind, identifier, actual, expected):
        return (canonical_sha(definition_body(actual)) == canonical_sha(definition_body(expected))
                and self.draft_or_confirmed(kind, identifier, actual))
