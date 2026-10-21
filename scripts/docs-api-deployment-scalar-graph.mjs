import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// UNADOPTED source trust proposal. Full source/consumer review and owning
// mutations remain required before integration. No Node role is released.
const reviewedGraph = {
  "scripts/deploy.sh": "97c1e39bf9cec6c1d5d8e11198af90ed04efd15a6077f2bbac1129c2ea0741e2",
  "scripts/bundle-values-field.mjs": "b8a920cbce4fbd538b310bdffd9c7b4ef324bb5bb59c7732459c66048f64d0b0",
  "scripts/buster-resource-overlay.mjs": "178b5a326434ef80b45fb1ecc1587610d8db704e667e74e796fe7767f6bf5304",
  "scripts/bundle-override-values.mjs": "81fcc460046007538475e5ac02048f9855674d1dc70556fba2ddf4ac5587d51a",
  "node_modules/js-yaml/package.json": "82b932c87c5da7901c6a8f984698c57912570146fffd3156dcdc96a6c210d847",
  "node_modules/js-yaml/dist/js-yaml.mjs": "33e98d04719e7a7fc8e0433803ad4b26a6f72d4545d279a5b053d45bd7871c7a",
  "package.json": "d19ba8b9082ebaab00ee2008e688dd4808cc3882141b10bbdda8cce8b50c3d6a"
};
const reviewedSinks = [
  {
    "owner": "append_code_bundle_override_file",
    "sink": {
      "line": 365,
      "command": "node",
      "args": [
        "$REPO_DIR/scripts/bundle-override-values.mjs",
        "$archive_url",
        "$expected_commit",
        "$contract_version",
        "$auth_secret",
        "$auth_key"
      ]
    },
    "sourceLine": "  node \"$REPO_DIR/scripts/bundle-override-values.mjs\" \"$archive_url\" \"$expected_commit\" \"$contract_version\" \"$auth_secret\" \"$auth_key\" >>\"$output_path\" || return 1"
  },
  {
    "owner": "yaml_trim_scalar",
    "sink": {
      "line": 369,
      "command": "awk",
      "args": [
        "\n    {\n      sub(/^[[:space:]]+/, \"\", $0)\n      sub(/[[:space:]]+$/, \"\", $0)\n      gsub(/^\"|\"$/, \"\", $0)\n      gsub(/^'|'$/, \"\", $0)\n      print\n    }\n  "
      ]
    },
    "sourceLine": "  awk '"
  },
  {
    "owner": "yaml_get_section_key",
    "sink": {
      "line": 385,
      "command": "awk",
      "args": [
        "-v",
        "section=$section",
        "-v",
        "key=$key",
        "\n    $0 ~ (\"^\" section \":[[:space:]]*$\") {\n      in_section = 1\n      next\n    }\n\n    in_section && $0 ~ /^[^[:space:]]/ {\n      in_section = 0\n    }\n\n    in_section && $0 ~ (\"^[[:space:]]{2}\" key \":[[:space:]]*\") {\n      value = $0\n      sub(\"^[[:space:]]{2}\" key \":[[:space:]]*\", \"\", value)\n      print value\n      exit\n    }\n  ",
        "$file"
      ]
    },
    "sourceLine": "  awk -v section=\"$section\" -v key=\"$key\" '"
  },
  {
    "owner": "yaml_get_nested_section_key",
    "sink": {
      "line": 410,
      "command": "awk",
      "args": [
        "-v",
        "section=$section",
        "-v",
        "subsection=$subsection",
        "-v",
        "key=$key",
        "\n    $0 ~ (\"^\" section \":[[:space:]]*$\") {\n      in_section = 1\n      in_subsection = 0\n      next\n    }\n\n    in_section && $0 ~ /^[^[:space:]]/ {\n      in_section = 0\n      in_subsection = 0\n    }\n\n    in_section && $0 ~ (\"^[[:space:]]{2}\" subsection \":[[:space:]]*$\") {\n      in_subsection = 1\n      next\n    }\n\n    in_section && in_subsection && $0 ~ /^[[:space:]]{2}[A-Za-z0-9_-]+:[[:space:]]*$/ && $0 !~ (\"^[[:space:]]{2}\" subsection \":[[:space:]]*$\") {\n      in_subsection = 0\n    }\n\n    in_section && in_subsection && $0 ~ (\"^[[:space:]]{4}\" key \":[[:space:]]*\") {\n      value = $0\n      sub(\"^[[:space:]]{4}\" key \":[[:space:]]*\", \"\", value)\n      print value\n      exit\n    }\n  ",
        "$file"
      ]
    },
    "sourceLine": "  awk -v section=\"$section\" -v subsection=\"$subsection\" -v key=\"$key\" '"
  },
  {
    "owner": "bundle_values_field",
    "sink": {
      "line": 538,
      "command": "node",
      "args": [
        "$REPO_DIR/scripts/bundle-values-field.mjs",
        "$1",
        "$2",
        "$3",
        "${4:-}"
      ]
    },
    "sourceLine": "  node \"$REPO_DIR/scripts/bundle-values-field.mjs\" \"$1\" \"$2\" \"$3\" \"${4:-}\""
  },
  {
    "owner": "prism_image_overrides",
    "sink": {
      "line": 1581,
      "command": "printf",
      "args": [
        "%s\\n",
        "--set-string",
        "images.${kind}.repository=${!repository}"
      ]
    },
    "sourceLine": "    [[ -z ${!repository:-} ]] || printf '%s\\n' --set-string \"images.${kind}.repository=${!repository}\""
  },
  {
    "owner": "prism_image_overrides",
    "sink": {
      "line": 1590,
      "command": "printf",
      "args": [
        "%s\\n",
        "--set-string",
        "images.${kind}.digest=${selected_digest}"
      ]
    },
    "sourceLine": "    printf '%s\\n' --set-string \"images.${kind}.digest=${selected_digest}\""
  },
  {
    "owner": "prism_image_overrides",
    "sink": {
      "line": 1591,
      "command": "printf",
      "args": [
        "%s\\n",
        "--set-string",
        "images.${kind}.pullPolicy=IfNotPresent"
      ]
    },
    "sourceLine": "    printf '%s\\n' --set-string \"images.${kind}.pullPolicy=IfNotPresent\""
  }
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function absent(file) {
  try { fs.lstatSync(file); return false; }
  catch (error) { if (error.code === 'ENOENT') return true; return false; }
}
export function qualifiedDeploymentYamlScalarGraph(root, source, bytes, sink) {
  if (source !== 'scripts/deploy.sh' || typeof bytes !== 'string' || hash(bytes) !== reviewedGraph[source]) return null;
  // A nearer package scope can enable package self-reference, and a nearer
  // node_modules can shadow root js-yaml. Reject either, including dangling
  // aliases. The root package scope and exact import export map are pinned.
  if (!absent(path.join(root, 'scripts/package.json')) ||
      !absent(path.join(root, 'scripts/node_modules/js-yaml'))) return null;
  const dependencies = {};
  for (const [name, expected] of Object.entries(reviewedGraph)) {
    const file = path.resolve(root, name);
    try {
      if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) return null;
      const actual = hash(fs.readFileSync(file));
      if (actual !== expected) return null;
      dependencies[name] = actual;
    } catch (error) { if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) return null; throw error; }
  }
  if (!sink || typeof sink !== 'object') return null;
  const occurrence = reviewedSinks.find(({sink: expected, sourceLine}) =>
    bytes.split('\n')[expected.line - 1] === sourceLine &&
    JSON.stringify(Object.keys(sink).sort()) === JSON.stringify(Object.keys(expected).sort()) &&
    Object.keys(expected).every(key => JSON.stringify(sink[key]) === JSON.stringify(expected[key])));
  if (!occurrence) return null;
  return {
    role: 'selected-configuration-stream',
    contract: 'exact-reviewed-deployment-helper-input-and-typed-consumer-graph',
    owner: occurrence.owner,
    dependencies,
    absenceDependencies: ['scripts/package.json', 'scripts/node_modules/js-yaml'],
    nodeOutputRolesQualified: false,
    scope: 'only this exact deploy source graph and exact original scanner descriptor; not arbitrary helper stdout or unrelated callers',
  };
}
