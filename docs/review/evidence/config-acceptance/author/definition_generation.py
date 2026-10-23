"""C0 active catalog integrity boundary, not semantic or runtime acceptance.

Default baseline authority is immutable. Synthetic controls may inject a
private baseline registration into this library, never via checker arguments.
Semantic closure and whole-generation provenance are intentionally not yet
implemented: strict acceptance fails closed rather than accepting shape proof.
"""
from definition_baseline import DefinitionBaseline, strict_json
import hashlib
from pathlib import Path
from observation_references import ObservationReferences
from review_receipts import ReviewReceipts, canonical_sha, definition_body

SCHEMA_PATH = 'docs/review/evidence/config-acceptance/c0-completion-20261013/active-definition-generation-01/generation.schema.json'
SCHEMA_SHA = 'b4661a4f33a72ce3bf2574d509466b5c13b99cffb29d79dd57470a4c7f46a277'
ROOT_REF_KEYS = {'path', 'sha256', 'schemaVersion', 'contentSha256'}


class DefinitionRoots:
    """Pin named root inputs before parsing, including explicit checker paths."""
    def __init__(self, root):
        self.root = Path(root).absolute()
        self.pins = ReviewReceipts(root)
        self.documents = {}
        self._parsed_digests = {}

    def read(self, label, path):
        path = Path(path)
        logical = path if path.is_absolute() else self.root/path
        try:
            relative = str(logical.relative_to(self.root))
        except ValueError as error:
            raise ValueError('DEFINITION_ROOT_PATH_OUTSIDE_CHECKOUT') from error
        expected = hashlib.sha256(logical.read_bytes()).hexdigest()
        document = strict_json(self.pins._pinned(relative, expected))
        if label in self.documents:
            raise ValueError('DEFINITION_ROOT_ALREADY_READ')
        self.documents[label] = document
        # Keep a value identity independently of the mutable object returned
        # to the caller. Comparing two aliases of that object proves nothing.
        self._parsed_digests[label] = canonical_sha(document)
        return document

    def matches(self, label, document):
        return label in self._parsed_digests and canonical_sha(document) == self._parsed_digests[label]

    def assert_no_drift(self):
        self.pins.assert_no_drift()


def generation_sha(value):
    projection = {k: v for k, v in value.items()
                  if k not in {'contentSha256', 'reviewerConfirmation'}}
    projection['records'] = [definition_body(v) for v in value['records']]
    return canonical_sha(projection)


class DefinitionGeneration:
    def __init__(self, root, reference, baseline_registrations=None):
        if not isinstance(reference, dict) or set(reference) != ROOT_REF_KEYS:
            raise ValueError('DEFINITION_GENERATION_ROOT_REF_INVALID')
        self.pins = ReviewReceipts(root)
        self.document = strict_json(self.pins._pinned(reference['path'], reference['sha256']))
        # Import only for an active generation; historical checker operation
        # does not acquire a new dependency or silently skip schema validation.
        from jsonschema import Draft202012Validator
        schema = strict_json(self.pins._pinned(SCHEMA_PATH, SCHEMA_SHA))
        Draft202012Validator.check_schema(schema)
        try:
            Draft202012Validator(schema).validate(self.document)
        except Exception as error:
            from jsonschema.exceptions import ValidationError
            if not isinstance(error, ValidationError):
                raise
            raise ValueError('DEFINITION_GENERATION_SHAPE_INVALID:' + str(error.json_path)) from error
        value = self.document
        if (reference['schemaVersion'] != value['schemaVersion']
                or reference['contentSha256'] != value['contentSha256']
                or generation_sha(value) != value['contentSha256']):
            raise ValueError('DEFINITION_GENERATION_REVISION_INVALID')
        self.baseline = DefinitionBaseline(root, value['baselineManifestRef'], baseline_registrations)
        if value['baselineCatalogSha256'] != self.baseline.manifest['catalogSha256']:
            raise ValueError('DEFINITION_GENERATION_BASELINE_CONTEXT_INVALID')
        manifest_ref = value['inputManifestRef']
        manifest = strict_json(self.pins._pinned(manifest_ref['path'], manifest_ref['sha256']))
        if (not isinstance(manifest, dict) or set(manifest) != {'schemaVersion', 'files'}
                or manifest['schemaVersion'] != 'config-active-definition-inputs.v1'
                or not isinstance(manifest['files'], list) or not manifest['files']):
            raise ValueError('DEFINITION_GENERATION_INPUT_SET_INVALID')
        self.inputs = {}
        self.input_bytes = {}
        self.input_documents = {}
        for entry in manifest['files']:
            if (not isinstance(entry, dict) or set(entry) != {'path', 'sha256'}
                    or entry['path'] in self.inputs):
                raise ValueError('DEFINITION_GENERATION_INPUT_SET_INVALID')
            self.inputs[entry['path']] = entry['sha256']
            self.input_bytes[entry['path']] = self.pins._pinned(entry['path'], entry['sha256'])
        # Self/mutual hash cycles cannot supply a usable final content identity.
        if reference['path'] in self.inputs or manifest_ref['path'] in self.inputs:
            raise ValueError('DEFINITION_GENERATION_REFERENCE_CYCLE')
        self.records = {}
        self.bodies = {}
        keys = [(r['kind'], r['id']) for r in value['records']]
        if len(set(keys)) != len(keys) or keys != sorted(keys):
            raise ValueError('DEFINITION_GENERATION_ID_ORDER_INVALID')
        if not set(self.baseline.records).issubset(keys):
            raise ValueError('DEFINITION_GENERATION_ORIGINAL_ID_MISSING')
        for record in value['records']:
            key = (record['kind'], record['id'])
            original = self.baseline.records.get(key)
            origin, change = record['origin'], record['change']
            if original is not None:
                if origin != {'tag': 'baseline', 'bodySha256': original['bodySha256']}:
                    raise ValueError('DEFINITION_GENERATION_ORIGIN_DRIFT:' + str(key))
                if change['kind'] == 'discovered':
                    raise ValueError('DEFINITION_GENERATION_CHANGE_ORIGIN_INVALID')
            elif origin['tag'] != 'discovered' or change['kind'] != 'discovered':
                raise ValueError('DEFINITION_GENERATION_DISCOVERY_ORIGIN_INVALID')
            body = self.resolve_body(record['activeBodyRef'])
            if not isinstance(body, dict):
                raise ValueError('DEFINITION_GENERATION_BODY_NOT_OBJECT')
            if original is not None:
                unchanged = canonical_sha(body) == original['bodySha256']
                if unchanged != (change['kind'] == 'unchanged'):
                    raise ValueError('DEFINITION_GENERATION_CHANGE_BODY_INVALID')
                if record['kind'] == 'requirement' and not unchanged:
                    raise ValueError('DEFINITION_GENERATION_REQUIREMENT_CHANGED')
                original_body = self.baseline.bodies[key]
                original_cases = self.original_cases(record['kind'], record['id'], original_body)
                if set(change['preservedOriginalCaseIds']) != original_cases:
                    raise ValueError('DEFINITION_GENERATION_ORIGINAL_CASE_SET_INVALID:' + str(key))
                if not unchanged and not change['refinementEvidenceRefs']:
                    raise ValueError('DEFINITION_GENERATION_REFINEMENT_EVIDENCE_MISSING')
            for ref in change['refinementEvidenceRefs']:
                self.resolve_body(ref)
            if origin['tag'] == 'discovered':
                for ref in origin['sourceEvidenceRefs']:
                    self.resolve_body(ref)
            self.records[key], self.bodies[key] = record, body
        requirement_context = [{'id': identifier, 'bodySha256': canonical_sha(body)}
                               for (kind, identifier), body in self.bodies.items() if kind == 'requirement']
        if canonical_sha(requirement_context) != value['requirementContextSha256']:
            raise ValueError('DEFINITION_GENERATION_REQUIREMENT_CONTEXT_INVALID')
        for key, record in self.records.items():
            origin = record['origin']
            if origin['tag'] == 'discovered':
                self.require_links(origin['requirementIds'], 'requirement', key)
            body = self.bodies[key]
            for field, kind in [('requirementIds', 'requirement'), ('caseIds', 'case'), ('settingIds', 'setting')]:
                if field in body:
                    self.require_links(body[field], kind, key)
        self.assert_no_drift()

    @staticmethod
    def original_cases(kind, identifier, body):
        cases = {identifier} if kind == 'case' else set()
        for field in ('caseIds', 'cases'):
            values = body.get(field, [])
            if isinstance(values, list) and all(isinstance(v, str) for v in values):
                cases.update(values)
        return cases

    def require_links(self, values, kind, owner):
        if (not isinstance(values, list) or any(not isinstance(v, str) for v in values)
                or len(set(values)) != len(values)
                or any((kind, v) not in self.records for v in values)):
            raise ValueError('DEFINITION_GENERATION_DANGLING_LINK:' + str(owner))

    def resolve_body(self, ref):
        if self.inputs.get(ref['path']) != ref['sha256']:
            raise ValueError('DEFINITION_GENERATION_BODY_NOT_IN_INPUT_SET')
        if ref['path'] not in self.input_documents:
            self.input_documents[ref['path']] = strict_json(self.input_bytes[ref['path']])
        document = self.input_documents[ref['path']]
        body = ObservationReferences.pointer(document, ref['pointer'])
        if canonical_sha(body) != ref['bodySha256']:
            raise ValueError('DEFINITION_GENERATION_BODY_DRIFT')
        return body

    def assert_no_drift(self):
        self.pins.assert_no_drift()
        self.baseline.assert_no_drift()
        if hasattr(self, 'root_documents'):
            self.root_documents.assert_no_drift()

    def require_acceptance(self):
        self.validate_cases()
        # Cases alone cannot establish field/source/gap/native or provenance
        # closure. Strict mode stays closed for those unimplemented gates.
        raise ValueError('DEFINITION_GENERATION_SEMANTIC_ACCEPTANCE_NOT_IMPLEMENTED')

    def validate_cases(self):
        from definition_cases import validate_case
        originals = {key[1]: self.baseline.bodies.get(key)
                     for key in self.bodies if key[0] == 'case'}
        for key, body in self.bodies.items():
            if key[0] == 'case':
                record = self.records[key]
                # Discovered history is null, not a fabricated original case.
                # Origin source/requirements were separately checked at load;
                # source meaning and authentic provenance remain other gates.
                if record['origin']['tag'] == 'discovered' and not set(
                        record['origin']['requirementIds']).issubset(body.get('requirementIds', [])):
                    raise ValueError('DEFINITION_CASE_DISCOVERY_REQUIREMENTS_LOST')
                validate_case(body, originals[key[1]], self.bodies, self.pins, originals)
        self.assert_no_drift()


def load_paired_generation(root, inventory, matrix, root_documents=None, **kwargs):
    left, right = inventory.get('activeDefinitionGenerationRef'), matrix.get('activeDefinitionGenerationRef')
    if left is None and right is None:
        if 'activeDefinitionGenerationRef' in inventory or 'activeDefinitionGenerationRef' in matrix:
            raise ValueError('DEFINITION_GENERATION_NULL_ROOT_REFERENCE')
        return None
    if left is None or right is None or left != right:
        raise ValueError('DEFINITION_GENERATION_ROOT_REFERENCES_DIFFER')
    if root_documents is None:
        root_documents = DefinitionRoots(root)
        root_documents.read('inventory', 'docs/review/remediation/config-semantic-inventory.json')
        root_documents.read('matrix', 'docs/review/remediation/config-acceptance-matrix.json')
    for label, document in [('inventory', inventory), ('matrix', matrix)]:
        if not root_documents.matches(label, document):
            raise ValueError('DEFINITION_GENERATION_PARSED_ROOT_DRIFT')
    root_documents.assert_no_drift()
    loaded = DefinitionGeneration(root, left, **kwargs)
    loaded.root_documents = root_documents
    # Original root projections remain exact historical data. No broad removal
    # of nested review/business/status fields or merging with active bodies.
    for path, document in [('docs/review/remediation/config-semantic-inventory.json', inventory),
                           ('docs/review/remediation/config-acceptance-matrix.json', matrix)]:
        original = loaded.baseline.documents[path][1]
        projection = {k: v for k, v in document.items() if k != 'activeDefinitionGenerationRef'}
        if canonical_sha(projection) != canonical_sha(original):
            raise ValueError('DEFINITION_GENERATION_ROOT_HISTORY_DRIFT:' + path)
    loaded.assert_no_drift()
    return loaded
