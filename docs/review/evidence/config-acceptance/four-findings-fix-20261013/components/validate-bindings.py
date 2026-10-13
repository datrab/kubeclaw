"""C0 document-integrity checks; no runtime/Helm/semantic acceptance claim.
Expected memberships come from immutable canonical sources, never the candidate.
"""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
import subprocess

COMMIT = "21bf51bc2075abec1191fdc091952492b6cb484e"
BASE = "docs/review/evidence/config-acceptance/components/"
SCHEMA = "skills/common/plugin-runtime/foundation/config/swarm-components.schema.json"
TEMPLATE = "charts/kubeclaw/templates/_swarm-config.tpl"
ROOT = Path.cwd()
CACHE = {}


def require(value, message):
    if not value:
        raise ValueError("CANONICAL_BINDING:" + message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def frozen(path):
    if path not in CACHE:
        raw = subprocess.check_output(["git", "show", COMMIT + ":" + path])
        current = ROOT / path
        actual = str(current.readlink()).encode() if current.is_symlink() else current.read_bytes()
        require(raw == actual, "canonical source drift: " + path)
        CACHE[path] = raw
    return CACHE[path]


def load(path):
    return json.loads(frozen(path))


def ptr(value, pointer):
    require(pointer.startswith("/"), "invalid pointer")
    for key in pointer.split("/")[1:]:
        key = key.replace("~1", "/").replace("~0", "~")
        value = value[int(key)] if isinstance(value, list) else value[key]
    return value


def identity(ref, path, pointer=None):
    require(ref["path"] == path and ref["commit"] == COMMIT, "reference path/commit drift")
    require(ref["sha256"] == sha(frozen(path)), "reference digest drift: " + path)
    blob = subprocess.check_output(["git", "rev-parse", COMMIT + ":" + path], text=True).strip()
    require(ref["gitBlob"] == blob, "reference blob drift")
    if pointer is not None:
        require(ref["rfc6901Pointer"] == pointer, "exact reference pointer drift: " + pointer)


def walk(schema, start, fields):
    path, node, trail, chain = start, ptr(schema, start), [], []
    for field in [*fields, None]:
        trail.append(path)
        while "$ref" in node:
            chain.append(node["$ref"])
            path = node["$ref"].removeprefix("#")
            trail.append(path)
            node = ptr(schema, path)
        if field is not None:
            node = node["properties"][field]
            path += "/properties/" + field
    return path, node, trail, chain


def canonical():
    schema = load(SCHEMA)
    rows = load(BASE + "semantic-fragment.json")["rows"]
    require(len({r["id"] for r in rows}) == len(rows), "duplicate canonical row")
    members = []
    for index, row in enumerate(rows):
        if not row["source"]["field"].startswith("/settings/") or not row["schema"]["rootDefinition"]:
            continue
        fields = row["source"]["field"].removeprefix("/settings/").split("/")
        leaf, domain, trail, chain = walk(schema, row["schema"]["rootDefinition"].removeprefix("#"), fields)
        alternative = None
        if row["owner"] == "buster-engine" and fields[0] in ("preparation", "admission"):
            section = fields[0]
            apath, adomain, atrail, _ = walk(schema, "/$defs/buster-" + section, fields[1:])
            require(adomain == domain, "named API scalar domain differs")
            alternative = (section, apath, atrail, 207 if section == "preparation" else 190)
        members.append(dict(row=row, index=index, leaf=leaf, domain=domain, trail=trail, chain=chain, alternative=alternative))
    return schema, members


def template_members(members):
    # These selectors reflect the exact frozen template loops/relations, not JSON records.
    def group(owner, prefix):
        return [m for m in members if m["row"]["owner"] == owner and m["row"]["source"]["field"].startswith("/settings/" + prefix)]
    def exact(owner, fields):
        return [m for m in members if m["row"]["owner"] == owner and m["row"]["source"]["field"] in ["/settings/" + f for f in fields]]
    core = group("worker-core", "localRuntime/")
    studio = exact("prism-studio", ["port", "controlTimeoutMs"])
    supervisor = group("prism-worker", "supervisor/")
    return {
        52: core, 54: core, 91: group("buster-engine", "execution/"),
        99: exact("buster-engine", ["execution/provider/terminationGraceMs", "execution/provider/terminationTimeoutMs"]),
        103: exact("buster-engine", ["execution/reports/memoryBytes", "execution/reports/runtimeMemoryReserveBytes", "execution/reports/maximumSourceBytes", "execution/reports/maximumAggregateResultBytes"]),
        117: group("buster-engine", "admission/") + group("buster-engine", "dependencyReadiness/"),
        130: [m for m in group("buster-engine", "preparation/") if "/resourcePolicy/" not in m["row"]["source"]["field"]],
        147: studio, 150: studio, 195: supervisor, 197: supervisor,
        211: exact("prism-worker", ["ingress/maximumActiveRequests", "ingress/maximumProbeRequests", "ingress/maximumConnections"]),
        217: exact("buster-engine", ["preparation/" + f for f in ["maximumArchiveBytes", "maximumRequestBytes", "maximumHeaderBytes", "maximumMetadataBytes", "maximumInputBytes", "maximumJournalBytes", "maximumResultBytes", "maximumOutputBytes"]]),
        218: exact("buster-engine", ["preparation/closeTimeoutMs", "preparation/drainTimeoutMs"]),
        225: [], 260: [m for m in group("buster-engine", "clusterInvokers/") if m["domain"].get("type") in ("integer", "number")],
    }


def expected_coordinates(batch, members):
    project = load(BASE + "checkpoint6606-canonical-questions/source-marker-canonical-projection.json")["candidates"]
    backlog = set(load(BASE + "checkpoint6606-canonical-questions/remaining-backlog.json")["remainingExactSourceLinkCandidateIds"])
    source = TEMPLATE if batch == "01" else SCHEMA
    selected = [c for c in project if c["source"] == source and c["id"] in backlog]
    expected = {}
    rules = template_members(members)
    coords = load(BASE + "source-candidates-bce3f075/source-json-coordinates.json")["coordinates"] if batch == "02" else []
    for coordinate in selected:
        line = coordinate["line"]
        require(frozen(source).decode().splitlines()[line - 1] == coordinate["exactText"], "canonical coordinate line drift")
        if batch == "01":
            expected[coordinate["id"]] = (coordinate, rules[line], None)
        else:
            matched = [c for c in coords if c["path"] == source and c["line"] == line and c["pointer"].endswith("/maximum")]
            require(len(matched) == 1, "schema coordinate resolution ambiguity")
            pointer = matched[0]["pointer"]
            owner = pointer.rsplit("/", 1)[0]
            applicable = [m for m in members if owner in m["trail"] or (m["alternative"] and owner in m["alternative"][2])]
            require(applicable, "canonical coordinate has no members")
            expected[coordinate["id"]] = (coordinate, applicable, pointer)
    require(len(expected) == (16 if batch == "01" else 105), "canonical coordinate coverage drift")
    return expected


def validate_member(member, expected, batch, profiles):
    row = expected["row"]
    require(member["settingId"] == row["id"] and member["owner"] == row["owner"], "setting/owner drift")
    fieldkey, rowkey, profilekey = ("selectedField", "sourceRow", "completeABProfile") if batch == "01" else ("field", "row", "completeAB")
    require(member[fieldkey] == row["source"]["field"] and member["reader"] == row["reader"], "field/reader drift")
    require(member["caseIds"] == row["caseIds"] and bool(member["caseIds"]), "case links drift")
    identity(member[rowkey], BASE + "semantic-fragment.json", "/rows/" + str(expected["index"]))
    cid = "CMP-C1-EFFECT-" + row["id"].removeprefix("CMP-")
    require(cid in row["caseIds"], "expected EFFECT case absent")
    identity(member[profilekey], BASE + "refined-case-profiles.json", "/" + cid)
    profile = profiles[cid]
    delta = profile["delta"]
    require(delta["owner"] == row["owner"] and delta["field"] == row["source"]["field"], "profile delta owner/field drift")
    values = [ptr(profile[p][row["owner"]], row["source"]["field"]) for p in ("A", "B")]
    require(values == [delta["A"], delta["B"]] and values[0] != values[1], "profile selected A/B values drift")
    for p in ("A", "B"):
        require(profile[p][row["owner"]]["owner"] == row["owner"] and profile[p][row["owner"]]["schemaVersion"] == "swarm-component.v1", "profile owner/schema identity drift")
    if batch == "01":
        identity(member["schema"], SCHEMA, expected["leaf"])
        require(member["schema"]["resolvedCurrentScalarDomain"] == expected["domain"] and member["schema"]["localRefChain"] == expected["chain"], "schema domain/ref chain drift")
        require(member["activationAndMigration"] == {"activation": row["activationScope"], "migration": row["migrationAction"]}, "activation/migration drift")
    else:
        require(member["schemaPathsTraversed"] == expected["trail"] and member["effectiveScalarPointer"] == expected["leaf"] and member["currentResolvedLeafSchema"] == expected["domain"], "schema traversal/leaf drift")
        alt = expected["alternative"]
        if alt:
            section, path, trail, line = alt
            actual = member["namedAPIAlternativeSchemaEntry"]
            require(actual["definition"] == "buster-" + section and actual["schemaPathsTraversed"] == trail and actual["effectiveScalarPointer"] == path and actual["fullResolvedLeafEqualityVerified"] is True, "named API bridge drift")
            identity(actual["reader"], "skills/common/plugin-runtime/foundation/config/swarm.ts")
            identity(actual["compiler"], "skills/common/plugin-runtime/foundation/config/swarm-bundle.ts")
            require(actual["reader"]["line"] == line and "validateComponentSettings('buster-" + section + "'" in frozen(actual["reader"]["path"]).decode().splitlines()[line - 1], "named API caller drift")
        else:
            require("namedAPIAlternativeSchemaEntry" not in member, "unrelated named API bridge")


def validate(candidate, batch):
    require(candidate["baselineCommit"] == COMMIT, "baseline identity drift")
    schema, members = canonical()
    expected = expected_coordinates(batch, members)
    profiles = load(BASE + "refined-case-profiles.json")
    records = candidate["records"]
    require(Counter(r["candidateId"] for r in records) == Counter(expected.keys()), "coordinate set/multiplicity drift")
    total = 0
    for record in records:
        coordinate, required_members, pointer = expected[record["candidateId"]]
        ids = [m["row"]["id"] for m in required_members]
        actual_ids = [m["settingId"] for m in record["members"]]
        require(Counter(actual_ids) == Counter(ids) and actual_ids == ids, "canonical member set/order/multiplicity drift: " + record["candidateId"])
        require(record["memberCount"] == len(ids), "member count drift")
        require(record["noNewSettingAuthor"] is True, "duplicate author proposal")
        source = record["source"]
        identity(source, coordinate["source"], pointer)
        require(source["line"] == coordinate["line"] and source["exactText"] == coordinate["exactText"], "source coordinate text drift")
        if batch == "02":
            require(source["currentMaximum"] == ptr(schema, pointer), "maximum drift")
        elif coordinate["line"] == 225:
            require(record["class"] == "nonsetting-forbidden-legacy-writer", "legacy input fabricated as setting")
        for actual, required in zip(record["members"], required_members):
            validate_member(actual, required, batch, profiles)
        total += len(ids)
    # Maintain the historical committed-input identity checks, including link bytes.
    refs = json.loads((ROOT / (BASE + "checkpoint21bf-source-links-" + batch + "/committed-input-references.json")).read_text())["refs"]
    for ref in refs:
        identity(ref, ref["path"])
        if ref.get("gitEntryKind") == "symlink":
            require(sha((ROOT / ref["path"]).read_bytes()) == ref["effectiveContentSha256"], "symlink effective content drift")
    return {"result": "passed-document-integrity-only", "batch": batch, "coordinates": len(expected), "memberOccurrences": total, "scope": "C0 conservation/profile traceability only; no semantic/runtime/Helm/F-MUT acceptance"}


def run(batch):
    parser = argparse.ArgumentParser(description=__doc__)
    filename = "source-coordinate-definitions.json" if batch == "01" else "schema-coordinate-definitions.json"
    parser.add_argument("--input", type=Path, default=ROOT / (BASE + "checkpoint21bf-source-links-" + batch + "/" + filename))
    parser.add_argument("--output", type=Path, help="Optional NEW evidence output; historical evidence is not overwritten")
    args = parser.parse_args()
    result = validate(json.loads(args.input.read_text()), batch)
    result["inputSHA256"] = sha(args.input.read_bytes())
    text = json.dumps(result, indent=2) + "\n"
    if args.output:
        require(not args.output.exists(), "refusing to overwrite prior evidence output")
        args.output.write_text(text)
    print(text, end="")
