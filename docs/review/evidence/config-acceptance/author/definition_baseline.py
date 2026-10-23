"""Immutable C0 original catalog loader, not active or runtime acceptance.

The pin names the exact original-revision publisher output, not an authored
manifest supplied by CLI. ReviewReceipts supplies logical path/end-drift checks.
"""
import gzip
import hashlib
import json
import math

from observation_references import ObservationReferences
from review_receipts import ReviewReceipts, canonical_sha

REGISTERED_BASELINES = ({
    'path': 'docs/review/evidence/config-acceptance/c0-completion-20261013/active-definition-generation-01/baseline/manifest.json',
    'sha256': '8a275715808a213d34708cf74ebb740665052e6645467806148ced1028194280',
    'sourceRevision': '0bcaf85d192d031814554c590b1bfca5b3ba81dd',
},)

def strict_json(data):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError('DEFINITION_JSON_DUPLICATE_KEY:' + key)
            value[key] = item
        return value
    def nonfinite(value):
        raise ValueError('DEFINITION_JSON_NONFINITE:' + value)
    def finite_float(value):
        number = float(value)
        if not math.isfinite(number):
            return nonfinite(value)
        return number
    return json.loads(data, object_pairs_hook=unique, parse_constant=nonfinite, parse_float=finite_float)

class DefinitionBaseline:
    def __init__(self, root, reference, registrations=None):
        if set(reference) != {'path','sha256'}:
            raise ValueError('DEFINITION_BASELINE_REF_INVALID')
        registrations = REGISTERED_BASELINES if registrations is None else registrations
        matches = [v for v in registrations if all(v[k] == reference[k] for k in reference)]
        if len(matches) != 1:
            raise ValueError('DEFINITION_BASELINE_NOT_REGISTERED')
        self.pins = ReviewReceipts(root)
        self.manifest = strict_json(self.pins._pinned(reference['path'], reference['sha256']))
        if (self.manifest['schemaVersion'] != 'config-definition-baseline-manifest.v1'
                or self.manifest['sourceRevision'] != matches[0]['sourceRevision']):
            raise ValueError('DEFINITION_BASELINE_REVISION_INVALID')
        self.documents = {}
        for item in self.manifest['inputs']:
            if (item['gitRevision'] != self.manifest['sourceRevision']
                    or item['encoding'] != 'gzip' or item['originalPath'] in self.documents):
                raise ValueError('DEFINITION_BASELINE_INPUT_INVALID')
            packed = self.pins._pinned(item['objectPath'], item['objectSha256'])
            if len(packed) != item['objectBytes']:
                raise ValueError('DEFINITION_BASELINE_PACKED_SIZE_INVALID')
            raw = gzip.decompress(packed)
            if (len(raw) != item['uncompressedBytes']
                    or hashlib.sha256(raw).hexdigest() != item['uncompressedSha256']):
                raise ValueError('DEFINITION_BASELINE_ORIGINAL_DRIFT')
            self.documents[item['originalPath']] = (item['uncompressedSha256'], strict_json(raw))
        catalog_ref = self.manifest['catalogRef']
        catalog = strict_json(self.pins._pinned(catalog_ref['path'],catalog_ref['sha256']))
        records = catalog['records']
        if (catalog['schemaVersion'] != 'config-definition-baseline-catalog.v1'
                or catalog['sourceRevision'] != self.manifest['sourceRevision']
                or canonical_sha(records) != catalog['catalogSha256']
                or catalog['catalogSha256'] != self.manifest['catalogSha256']):
            raise ValueError('DEFINITION_BASELINE_CATALOG_INVALID')
        self.records = {}
        self.bodies = {}
        occurrences = 0
        keys = []
        for record in records:
            key = (record['kind'],record['id'])
            if key in self.records or not record['occurrences']:
                raise ValueError('DEFINITION_BASELINE_ID_INVALID')
            self.records[key] = record
            keys.append(key)
            for occurrence in record['occurrences']:
                digest, document = self.documents[occurrence['originalPath']]
                if digest != occurrence['uncompressedSha256']:
                    raise ValueError('DEFINITION_BASELINE_OCCURRENCE_INPUT_INVALID')
                body = ObservationReferences.pointer(document,occurrence['pointer'])
                if canonical_sha(body) != record['bodySha256']:
                    raise ValueError('DEFINITION_BASELINE_BODY_DRIFT')
                self.bodies[key] = body
                occurrences += 1
        if (keys != sorted(keys) or len(keys) != self.manifest['catalogUniqueIds']
                or occurrences != self.manifest['catalogOccurrences']):
            raise ValueError('DEFINITION_BASELINE_COMPLETENESS_INVALID')

    def assert_no_drift(self):
        self.pins.assert_no_drift()
