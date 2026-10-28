#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  generatedEnd,
  generatedNotice,
  renderCli,
  renderSecrets,
  renderWorkflowTable,
  table,
} from './docs-generate-core.mjs';
import { yamlFieldPathTokens } from './yaml-field-path.mjs';
import { renderApiResourceReference, renderRejectedApiOutputProfiles, upstreamApiReference } from './docs-api-reference.mjs';
import { generateSdkReference } from './docs-sdk-reference.mjs';
import { readVerifiedRetainedLanguageBundle } from './lib/docs-retained-language-bundle.mjs';
import { loadRetainedConfigurationSnapshot, assertRetainedPageDestinations, writeRetainedPage } from './lib/docs-retained-source.mjs';
import { semanticEvidenceLinks, retainedSemanticNotice } from './lib/docs-retained-semantic-evidence.mjs';
import { renderRetainedConfigurationReferences } from './lib/docs-retained-configuration-renderer.mjs';
import { helmSnapshotSummary, environmentConsumerGuidance } from './lib/docs-configuration-reference-guidance.mjs';
import { editorialOwners } from './lib/docs-configuration-editorial-language.mjs';
import { renderProductPipeline } from './docs-product-pipeline-reference.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
};
const invocationRoot = process.cwd();
const root = path.resolve(option('--root', invocationRoot));
const checkOnly = argv.includes('--check');
const only = option('--only', null);
if (argv.includes('--only') && !['workflows', 'plugin-configuration', 'retained-configuration-language', 'endpoints'].includes(only)) {
  throw new Error('--only supports workflows, plugin-configuration, retained-configuration-language or endpoints');
}
if (only && argv.includes('--update-source-revision')) {
  throw new Error('bounded generation must not update the shared source revision lock');
}
const retainedLanguageBundlePath = option('--retained-language-bundle', null);
let retainedSemanticMode = false;
if ((only === 'retained-configuration-language') !== Boolean(retainedLanguageBundlePath)) {
  throw new Error('--retained-language-bundle is required only for --only retained-configuration-language');
}
const allowDetachedSourceRoot = argv.includes('--allow-detached-source-root');
const updateSourceRevision = argv.includes('--update-source-revision');
const sourceRevisionLockPath = path.join(root, 'docs/generated/inventory/documentation-source-revision.json');
const lockedSourceRevision = fs.existsSync(sourceRevisionLockPath)
  ? JSON.parse(fs.readFileSync(sourceRevisionLockPath, 'utf8')).revision
  : null;
const sourceRevision = option('--revision', lockedSourceRevision ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: invocationRoot, encoding: 'utf8' }).trim());
if (!/^[0-9a-f]{40}$/u.test(sourceRevision)) {
  throw new Error(`documentation source revision must be a full Git commit SHA: ${sourceRevision}`);
}
try {
  execFileSync('git', ['cat-file', '-e', `${sourceRevision}^{commit}`], { cwd: invocationRoot, stdio: 'ignore' });
} catch {
  throw new Error(`documentation source revision does not exist locally: ${sourceRevision}`);
}
const gitRoot = path.resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: invocationRoot,
  encoding: 'utf8',
}).trim());
if (root !== gitRoot && (!allowDetachedSourceRoot || process.env.KUBECLAW_DOCS_ISOLATED_MUTATION !== '1')) {
  throw new Error('documentation source root is outside the checked Git worktree; a detached mutation fixture must opt in explicitly');
}
if (updateSourceRevision) {
  if (checkOnly) throw new Error('--update-source-revision cannot be combined with --check');
  if (root !== gitRoot) throw new Error('--update-source-revision requires the checked Git worktree');
  fs.writeFileSync(sourceRevisionLockPath, `${JSON.stringify({
    revision: sourceRevision,
    purpose: 'Pins generated reader evidence to the commit that contains all cited source and documentation authorities. Update this lock only after a source commit and before the separate generated-reference commit.',
  }, null, 2)}\n`);
}
// Completion records describe a review of source bytes; they are not product
// or generator inputs. Keeping them in freshness would force a new pin after
// every acceptance update. Neither input reads nor public citations may turn
// these excluded records into an authority (guards below).
function isCompletionRecord(sourcePath) {
  const relative = path.relative(root, path.resolve(root, sourcePath)).split(path.sep).join('/');
  return relative === 'docs/blueprint/documentation-completion-matrix.json'
    || (relative.startsWith('docs/blueprint/acceptance-evidence/') && relative.endsWith('.json'));
}

if (root === gitRoot) {
  const generatedPrefixes = ['docs/generated/', 'docs/site/'];
  const changed = execFileSync('git', ['diff', '--name-only', sourceRevision, '--', '.'], {
    cwd: gitRoot,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean)
    .filter((sourcePath) => !generatedPrefixes.some((prefix) => sourcePath.startsWith(prefix)) && !isCompletionRecord(sourcePath));
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: gitRoot,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean)
    .filter((sourcePath) => !generatedPrefixes.some((prefix) => sourcePath.startsWith(prefix)) && !isCompletionRecord(sourcePath));
  const mismatches = [...new Set([...changed, ...untracked])].sort();
  if (mismatches.length) {
    throw new Error(`documentation source revision does not match the current source tree: ${mismatches.slice(0, 20).join(', ')}`);
  }
}
const maximumSourceLinkLines = 60;

function sourceLineCount(sourcePath) {
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  if (!source) return 0;
  const lines = source.split('\n').length;
  return source.endsWith('\n') ? lines - 1 : lines;
}

function pinnedSourceUrl(sourcePath, startLine, endLine = startLine) {
  if (isCompletionRecord(sourcePath)) throw new Error(`completion record is not a documentation source authority: ${sourcePath}`);
  const start = Math.max(1, startLine);
  const end = Math.max(start, Math.min(endLine, start + maximumSourceLinkLines - 1));
  return `https://github.com/datrab/kubeclaw/blob/${sourceRevision}/${sourcePath}#L${start}-L${end}`;
}

function sourceRangeLinks(sourcePath, startLine = 1, endLine = null) {
  const filePath = sourcePath.split('#')[0];
  if (sourcePath.includes('#')) {
    const line = evidenceLine(filePath);
    return `<a href="${pinnedSourceUrl(filePath, line, line)}"><code>L${line}-L${line}</code></a>`;
  }
  const lastLine = endLine ?? sourceLineCount(filePath);
  const links = [];
  for (let start = startLine; start <= lastLine; start += maximumSourceLinkLines) {
    const end = Math.min(lastLine, start + maximumSourceLinkLines - 1);
    links.push(`<a href="${pinnedSourceUrl(filePath, start, end)}"><code>L${start}-L${end}</code></a>`);
  }
  return links.join('\n');
}

function evidenceLine(sourcePath) {
  const lines = fs.readFileSync(path.join(root, sourcePath), 'utf8').split('\n');
  const candidates = sourcePath.endsWith('package.json')
    ? [/"name"\s*:/]
    : [/"configSchema"\s*:/, /"configurationSchema"\s*:/, /"schemas?"\s*:/];
  const index = lines.findIndex((line) => candidates.some((candidate) => candidate.test(line)));
  return index < 0 ? 1 : index + 1;
}

function readJson(relPath) {
  if (isCompletionRecord(relPath)) throw new Error(`completion record is not a documentation generator input: ${relPath}`);
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

function literalText(value) {
  // Schema and configuration strings are data, not authored Markdown. Encode
  // Markdown punctuation as well as HTML characters so regexes, backticks and
  // pipes survive both the table renderer and repository link inspection.
  return String(value).replace(/[&<>"'\\`\[\]*_|~]/gu,
    (character) => `&#${character.codePointAt(0)};`).replaceAll('\n', '<br>');
}

function literalCode(value) {
  return `<code>${literalText(value)}</code>`;
}

function selectedValue(value) {
  return value === '' ? `${literalCode('""')} (empty string)` : literalCode(String(value));
}

function stableWriteMap() {
  // This explicit historical datatype does not replace current acquisition or
  // current API/producer qualification. Authenticate the entire bundle first.
  if (only === 'retained-configuration-language') {
    const bundle = readVerifiedRetainedLanguageBundle({ root, filename: path.resolve(retainedLanguageBundlePath) });
    if (bundle.editorialRevision !== sourceRevision) {
      throw new Error('retained language editorial revision must match --revision');
    }
    const snapshot = loadRetainedConfigurationSnapshot({ root,
      artifactRevision: bundle.artifactRevision, sourceRevision: bundle.sourceRevision });
    retainedSemanticMode = Boolean(bundle.semanticOwnerRevision);
    const semanticContext = retainedSemanticMode ? { revision: bundle.semanticOwnerRevision,
      inputs: bundle.semanticInputs, evidence: bundle.meaningEvidence } : null;
    const outputs = renderRetainedConfigurationReferences({ ...bundle.inventories,
      secrets: bundle.inventories.secretSetup,
      readSourceText: snapshot.readSourceText, sourceRevision: bundle.sourceRevision,
      artifactRevision: bundle.artifactRevision, editorialRevision: bundle.editorialRevision,
      banner: true, editorialSourcePath: 'scripts/lib/docs-configuration-editorial-language.mjs',
      semanticContext });
    if (semanticContext) {
      const historicalLink = (sourcePath, line) => '[`' + sourcePath + (line ? ':' + line : '')
        + '`](https://github.com/datrab/kubeclaw/blob/' + bundle.sourceRevision + '/' + sourcePath
        + '#L' + (line ?? 1) + '-L' + (line ?? 1) + ')';
      const meaningEvidence = secret => {
        const bindings = bundle.meaningEvidence.secrets.filter(binding => Object.entries(binding.identity)
          .every(([key, value]) => JSON.stringify(secret[key] ?? null) === JSON.stringify(value)));
        if (!bindings.length) return '';
        if (bindings.length !== 1) throw new Error('RETAINED_SECRET_MEANING_EVIDENCE_AMBIGUOUS');
        return '<br>Current meaning evidence: ' + semanticEvidenceLinks(semanticContext, bindings[0].sources);
      };
      outputs.set('docs/site/reference/secrets.md', renderSecrets(bundle.inventories.secretSetup,
        bundle.inventories.runtimeInputs, historicalLink, { artifactRevision: bundle.artifactRevision,
          sourceRevision: bundle.sourceRevision, semanticOwnerRevision: bundle.semanticOwnerRevision,
          notice: '> Retained historical view. This page does not acquire current Secret data.\n\n'
            + retainedSemanticNotice(semanticContext), meaningEvidence }));
    }
    return outputs;
  }

  // A schema-only correction has its own complete publication boundary. Keep
  // unrelated API, SDK and values inventories out of this explicitly selected route.
  if (only === 'plugin-configuration') return new Map([
    ['docs/site/reference/plugin-configuration.md', renderPluginConfiguration(
      readJson('docs/generated/inventory/configuration-schemas.json'))],
  ]);
  // Keep bounded workflow publication independent of unrelated SDK inventories.
  if (only === 'workflows') return new Map([
    ['docs/site/reference/workflows.md', renderWorkflows(readJson('docs/generated/inventory/workflows.json'))],
  ]);
  // Publish the existing endpoint renderer without acquiring or rewriting
  // unrelated SDK, configuration or retained historical references.
  if (only === 'endpoints') return new Map([
    ['docs/site/reference/endpoints.md', renderEndpoints(readJson('docs/generated/inventory/platform-surfaces.json'))],
  ]);
  const deploy = readJson('docs/generated/inventory/deploy-script.json');
  const secrets = readJson('docs/generated/inventory/secret-setup.json');
  const configurationValues = readJson('docs/generated/inventory/configuration-values.json');
  const runtimeInputs = readJson('docs/generated/inventory/configuration-runtime-inputs.json');
  const configurationSchemas = readJson('docs/generated/inventory/configuration-schemas.json');
  const platformSurfaces = readJson('docs/generated/inventory/platform-surfaces.json');
  const workflows = readJson('docs/generated/inventory/workflows.json');
  const sdkReference = generateSdkReference({ root, revision: sourceRevision });

  return new Map([
    ['docs/generated/inventory/sdk-reference.json', `${JSON.stringify(sdkReference.inventory, null, 2)}\n`],
    ['docs/site/reference/sdk-exports.md', sdkReference.generatedMarkdown],
    ['docs/site/reference/cli.md', renderCli(deploy, runtimeInputs, (sourcePath, line) => `[\`${sourcePath}:${line}\`](${pinnedSourceUrl(sourcePath, line, line)})`)],
    ['docs/site/reference/secrets.md', renderSecrets(secrets, runtimeInputs, (sourcePath, line) => `[\`${sourcePath}${line ? `:${line}` : ''}\`](${pinnedSourceUrl(sourcePath, line ?? 1, line ?? 1)})`)],
    ['docs/site/reference/helm-values.md', renderHelmValues(configurationValues, configurationSchemas)],
    ['docs/site/reference/environment-variables.md', renderEnvironment(deploy, secrets, runtimeInputs)],
    ['docs/site/reference/plugin-configuration.md', renderPluginConfiguration(configurationSchemas, runtimeInputs)],
    ['docs/site/reference/endpoints.md', renderEndpoints(platformSurfaces)],
    ['docs/site/reference/verification-commands.md', renderVerification(deploy)],
    ['docs/site/reference/workflows.md', renderWorkflows(workflows)],
  ]);
}

function renderPluginConfiguration(configurationSchemas, runtimeInputs) {
  const statusDefinitions = {
    'qualified-runtime-authority': 'A field-specific explanation and its implementation evidence are recorded. Read the row for omission, empty-value and failure behavior; this label does not mean a live run passed.',
    'schema-and-runtime-authority': 'The accepted shape comes from the schema, and the row identifies the runtime consumer. The schema alone does not prove that a default is applied.',
    'structural-container': 'This row describes schema structure. Child fields and collection rules determine the accepted configuration; the label does not establish a runtime default.',
    'schema-meaning-blocker': 'The accepted shape is known, but the field meaning or consumer evidence is incomplete. Do not use the row as a completed operator contract.',
    'runtime-meaning-blocker': 'The current implementation is not sufficient evidence for a complete field contract. Use the stated safe boundary and required follow-up.',
  };
  const observedStatuses = [...new Set(configurationSchemas.files.flatMap((file) => file.fields.map((field) => field.meaning.status)))].sort();
  for (const status of observedStatuses) {
    if (!statusDefinitions[status]) throw new Error(`Configuration meaning status has no reader definition: ${status}`);
  }
  const statusLegend = table(['Meaning status', 'What the evidence establishes'], observedStatuses.map((status) => [`\`${status}\``, statusDefinitions[status]]));
  const displayValue = (value) => value === '<none>' || typeof value === 'string'
    ? String(value)
    : JSON.stringify(value);
  const evidenceLink = (sourcePath) => {
    const filePath = sourcePath.split('#')[0];
    const line = evidenceLine(filePath);
    return `[\`${sourcePath}\`](${pinnedSourceUrl(filePath, line, line)})`;
  };
  const meaningEvidenceLink = (source) => {
    const match = /^(.*):(\d+)$/u.exec(source);
    if (!match) return evidenceLink(source);
    return `[\`${source}\`](${pinnedSourceUrl(match[1], Number(match[2]), Number(match[2]))})`;
  };
  const schemaMeaning = (field) => {
    // Schema regexes contain Markdown-looking `[label](target)` fragments.
    // Escape brackets in generated prose so they render as literal contract
    // syntax while real source links, appended below, remain discoverable.
    const literalMeaning = field.meaning.text.replaceAll('[', '\\[').replaceAll(']', '\\]');
    const additionalEvidence = (field.meaning.additionalImplementationEvidence ?? []).map(meaningEvidenceLink);
    const base = `${literalMeaning}<br>Status: \`${field.meaning.status}\`<br>Evidence: ${[meaningEvidenceLink(field.meaning.evidence), ...additionalEvidence].join(', ')}`;
    if (!/blocker/u.test(field.meaning.status)) return base;
    return `${base}<br>Not a completed operator option. Authority owner: ${field.meaning.blockerOwner}. Completion requires qualified full-path meaning and runtime-consumer evidence.`;
  };
  const sections = configurationSchemas.files.map((file) => `<details>\n<summary><code>${file.path}</code> — ${file.fields.length} recursive schema facts</summary>\n\nSource evidence:\n\n${sourceRangeLinks(file.path)}\n\n${table(
    ['Field', 'Meaning', 'Type', 'Required', 'Schema default', 'Constraints and branches', 'Owner and consumer evidence'],
    file.fields.map((field) => [
      `\`${field.path}\``,
      schemaMeaning(field),
      `\`${field.type}\``,
      field.required ? 'yes' : 'no',
      selectedValue(displayValue(field.default)),
      [
        ...field.constraints.map((constraint) => literalCode(`${constraint.name}=${JSON.stringify(constraint.value)}`)),
        ...field.branches.map((branch) => `branch \`${branch}\``),
      ].join('<br>') || 'none declared',
      `Owner: \`${field.ownerRole}\` (${evidenceLink(field.ownerEvidence)})<br>Consumers: ${field.consumers.map((consumer) => consumer === 'unknown' ? 'unknown' : evidenceLink(consumer)).join(', ')}`,
    ]),
  )}\n\n</details>`).join('\n\n');
  const swarm = configurationSchemas.swarm;
  const swarmContainerMeaning = (field) => {
    const meaning = field.meaning;
    const text = field.path === '$' && swarm.path === 'charts/kubeclaw/files/config/swarm.config.json'
      ? 'JSON document root. The chart embeds the complete file. The init path parses and writes JSON. The structural inventory entry does not prove whole-object loader requiredness or accepted fields.'
      : meaning.text;
    const description = `${literalText(text)}<br>Inventory meaning status: ${literalText(meaning.status)}`;
    if (!/blocker/u.test(meaning.status)) return description;
    if (!meaning.blockerOwner || !meaning.closureCondition) throw new Error(`swarm collection blocker lacks owner or closure: ${field.path}`);
    return `${description}<br>Not a completed operator option. Authority owner: ${literalText(meaning.blockerOwner)}.<br>Closure condition: ${literalText(meaning.closureCondition).replace(/charts\/[A-Za-z0-9./#$-]+/gu, coordinate => `<code>${coordinate}</code>`)}<br>Stop before you use unknown keys. Do not assume that the loader accepts empty, omitted or null input.`;
  };
  const swarmTable = swarm ? table(['Field', 'Type and value', 'Required and constraint authority', 'Owner and consumers', 'Precedence and proof', 'Impact, failure, and closure'], swarm.fields.map((field) => {
    const wrapper = field.required === 'not-applicable-container';
    const requirement = wrapper
      ? `Recorded inventory marker: ${literalText(field.required)}. This classifies the structural inventory entry, not runtime applicability or whole-object requiredness.<br>${field.constraints.join('<br>') || 'No additional constraint is recorded here. This does not prove that the runtime loader has no whole-object constraints.'}`
      : `${field.required}: ${field.requiredReason}<br>${field.constraints.join('<br>') || 'none for structural container'}`;
    const failure = `${field.changeImpact}<br>Failure: ${field.failureMeaning}${field.closureCondition ? `<br>Not a completed operator option. Authority owner: ${field.blockerOwner}; a versioned field contract is required.` : ''}`;
    return [
      `\`${field.path}\``, `\`${field.type}\`<br>${selectedValue(field.value)}`, requirement,
      `Source: \`${field.ownerComponent}\` (${field.ownerEvidence})<br>Runtime: ${field.runtimeOwner}<br>${field.consumers.map((consumer) => `\`${consumer.path}:${consumer.line}\` (${consumer.kind})`).join('<br>')}`,
      `${field.precedence.join(' → ')}<br>${field.effectiveValueProof}`,
      wrapper ? `${failure}<br>${swarmContainerMeaning(field)}` : failure,
    ];
  })) : 'No compact swarm configuration source was discovered.';
  return `# Plugin And Platform Configuration Schemas

Status: generated reference
Audience: operator, plugin maintainer, developer
Owner: configuration source owners listed for each schema
Evidence: docs/generated/inventory/configuration-schemas.json; scripts/docs-configuration-inventory.mjs
Applies to: every plugin-registered configuration schema, pipeline-platform.v2, and the compact swarm configuration
Last verified: generated from the current source inventory

## Purpose

Use this page to find the exact field contract before you change plugin or platform configuration. The generator follows every \`configSchema\` registration in plugin manifests. It does not assume that a file named \`config.schema.json\` is the complete set.

${generatedNotice(['docs/generated/inventory/configuration-schemas.json'])}
## How To Read Field Evidence

${statusLegend}

The **Schema default** column reports the schema declaration. It is not a universal runtime default. Test-provider configuration can resolve schema defaults before validation; stage, adapter and observer registration validates supplied values without that resolution. A consumer can apply its own fallback. Read the field's implementation evidence before relying on omission or an empty value.

Authority: [registration validation](${pinnedSourceUrl('skills/common/plugin-runtime/foundation/registry/configuration.ts', 42, 78)}) and [provider default resolution](${pinnedSourceUrl('skills/common/plugin-runtime/foundation/registry/configuration.ts', 102, 120)}). These rules apply to configuration validation before execution.

## Registered Schemas

${sections}

## Compact Swarm Configuration

${swarmTable}

The compact swarm file has no bound field schema in the current source. The chart embeds it in a ConfigMap and the init path materializes it for the OpenClaw gateway. Leaf rows therefore identify the external loader contract and its closure condition. Do not infer validation rules that the loader does not publish.

A structural inventory marker does not prove whole-object requiredness, accepted keys or runtime constraints. The \`$.overrides\` collection contract remains open with the owner and closure condition in its row. Until the owner qualifies that contract, stop before you use unknown keys. Do not assume that the loader accepts empty, omitted or null input.

Consumer coordinates in the table come from recorded inventory metadata. They are not a new verification of current line positions.

Current source evidence: [ConfigMap embedding](${pinnedSourceUrl('charts/kubeclaw/templates/configmap-swarm-config.yaml', 10, 15)}), [JSON parsing](${pinnedSourceUrl('charts/kubeclaw/templates/deployment.yaml', 699, 704)}), [JSON writing](${pinnedSourceUrl('charts/kubeclaw/templates/deployment.yaml', 745, 746)}) and [runtime mount](${pinnedSourceUrl('charts/kubeclaw/templates/deployment.yaml', 1486, 1487)}). These source statements prove materialization and mounting only. They do not prove a whole-object loader contract or live acceptance.

${generatedEnd()}
## How To Use This Reference

1. Find the schema registered by the provider, observer, adapter, or engine that reads the configuration.
2. Check required fields, branches, limits, and defaults before you edit the authored value.
3. Follow the consumer evidence to confirm how the runtime interprets the field.
4. Run \`npm run docs:drift:config:check\` after a schema or consumer changes.

## Inventory Limits

- A schema proves accepted shape and declared defaults. It does not prove that each runtime branch uses each accepted field.
- A manifest or package path proves source ownership. It does not identify an organizational owner when the repository does not declare one.
- An unknown consumer remains an explicit gap. Inspect the implementation before changing that field.

## Generated From

- \`../generated/inventory/configuration-schemas.json\`
- \`../../scripts/docs-configuration-inventory.mjs\`
- \`../../scripts/docs-generate.mjs\`
`;
}

function renderEndpoints(platformSurfaces) {
  const sourceLink = (item) => item.line
    ? `[\`${item.source}:${item.line}\`](${pinnedSourceUrl(item.source, item.line, item.line)})`
    : `\`${item.source}\``;
  const exposures = platformSurfaces.networkExposures ?? [];
  const networkResourceIds = new Set(platformSurfaces.resources.filter((item) => item.value.startsWith('Service/') || item.value.startsWith('Ingress/')).map((item) => item.value));
  const exposureResourceIds = new Set(exposures.map((item) => `${item.kind}/${item.namespace}/${item.name}`));
  for (const resourceId of networkResourceIds) {
    if (!exposureResourceIds.has(resourceId)) throw new Error(`endpoint reference omits network resource ${resourceId}`);
  }
  return `# Endpoint And Connection Reference

Status: generated reference
Audience: operator, security operator, developer
Owner: the source component listed for each route or connection
Evidence: docs/generated/inventory/platform-surfaces.json; scripts/docs-platform-surface-inventory.mjs
Applies to: discovered inbound routes and outbound network calls in shipped runtime sources
Last verified: generated from revision \`${sourceRevision}\`

## Purpose

Use this page to identify which component accepts or starts a network request. An endpoint is an inbound route. An outbound connection is a call that a KubeClaw component starts. Keeping these directions separate prevents an operator from opening the wrong boundary.

${generatedNotice(['docs/generated/inventory/platform-surfaces.json'])}
## Inbound Endpoints

${table(['Method and path', 'Role or class', 'Activation and exclusions', 'Implementation authority'], platformSurfaces.endpoints.map((endpoint) => [
  `\`${endpoint.value}\``,
  [endpoint.routeRole, endpoint.classification, endpoint.pathKind].filter(Boolean).map((value) => `\`${value}\``).join('<br>') || 'not classified',
  `${endpoint.activationState}: ${endpoint.activationCondition}${endpoint.exclusions?.length ? `<br>Excludes: ${endpoint.exclusions.map((item) => `\`${item.kind}:${item.path}\``).join(', ')}` : ''}`,
  sourceLink(endpoint),
]))}

## Services, Ports, And Ingress

These rows describe rendered declarations, not live reachability. If a Service
omits \`targetPort\`, the Kubernetes API defaults it to the numeric Service
\`port\`; the row preserves that omission beside the effective default. Named
targets remain names resolved against the selected workload's container ports.
See the [pinned Service defaulting implementation](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/apis/core/v1/defaults.go#L125-L134).

${table(['Resource', 'Exposure', 'Port or backend', 'Activation', 'Implementation authority'], exposures.map((exposure) => [
  `\`${exposure.kind}/${exposure.namespace}/${exposure.name}\``,
  exposure.kind === 'Service'
    ? `type=\`${exposure.serviceType}\`<br>clusterIP=\`${exposure.clusterIP}\``
    : exposure.routeKind === 'default-backend'
      ? `class=\`${exposure.ingressClassName ?? '<default>'}\`<br>route=\`default backend\`<br>host/path=\`not applicable\``
      : `class=\`${exposure.ingressClassName ?? '<default>'}\`<br>route=\`${exposure.routeKind}\`<br>host=\`${exposure.host ?? '<none>'}\`<br>path=\`${exposure.path ?? '<none>'}\``,
  exposure.kind === 'Service'
    ? `\`${exposure.protocol} ${exposure.portName ?? '<unnamed>'}:${exposure.port ?? '<none>'} -> ${exposure.targetPort ?? exposure.port ?? '<none>'}\`${exposure.targetPort == null && exposure.port != null ? '<br>targetPort omitted; API default equals port' : ''}${exposure.nodePort ? `<br>nodePort=\`${exposure.nodePort}\`` : ''}`
    : `service=\`${exposure.backendService ?? '<none>'}:${exposure.backendPort ?? '<none>'}\`${exposure.tlsHosts?.length ? `<br>TLS hosts: ${exposure.tlsHosts.map((host) => `\`${host}\``).join(', ')}` : ''}`,
  `${exposure.activationState}: ${exposure.activationCondition ?? 'selected rendered profile'}`,
  sourceLink(exposure),
]))}

## Outbound Connections

${table(['Method and target', 'Caller', 'Provider or base', 'Activation', 'Implementation authority'], platformSurfaces.outboundConnections.map((connection) => [
  `\`${connection.value}\``,
  `\`${connection.caller}\``,
  [connection.classification, connection.providerFamily, connection.providerClassification, connection.base].filter(Boolean).map((value) => `\`${value}\``).join('<br>') || 'not classified',
  `${connection.activationState}: ${connection.activationCondition}`,
  sourceLink(connection),
]))}
${generatedEnd()}
## Trust, Health, And Failure Meaning

- A route record proves that the shipped source registers or handles the path. It does not prove public reachability. Service, ingress, network policy, identity, and authorization settings determine reachability and access.
- A health or readiness route reports only the checks implemented at its linked source. It does not prove that a complete user workflow succeeds.
- An outbound record proves a possible call site and its activation condition. It does not prove that DNS, credentials, policy, or the remote service are available.
- The generated inventory does not infer undocumented authentication or retry behavior. Follow the implementation link and the relevant operational procedure before you expose, retry, or disable a connection.

## Checks

\`npm run docs:drift:endpoint:check\` detects endpoint and outbound-connection drift. The platform mutation suite proves that changed route and dependency facts cannot keep the generated reference green.

## Generated From

- \`../generated/inventory/platform-surfaces.json\`
- \`../../scripts/docs-platform-surface-inventory.mjs\`
- \`../../scripts/docs-generate.mjs\`
`;
}

function renderHelmValues(configurationValues, configurationSchemas) {
  const valueFiles = configurationValues.files;
  const rejectedApiProfiles = renderRejectedApiOutputProfiles(configurationValues.rejectedApiOutputProfiles,(source,line)=>`[${literalText(source)}](${pinnedSourceUrl(source,line,line)})`,root);
  const apiResourceSections = renderApiResourceReference(configurationValues.apiResources,
    (source, line) => `[${literalText(source)}](${pinnedSourceUrl(source, line, line)})`, configurationValues.apiMetadataReferences, root);
  const collectionSchemaKey = (schema) => JSON.stringify([schema.authority, schema.authoritySha256, schema.apiVersion, schema.kind, schema.resolvedPath]);
  const collectionSchemaAnchor = (schema) => `api-collection-${createHash('sha256').update(collectionSchemaKey(schema)).digest('hex').slice(0, 16)}`;
  const collectionSchemaContract = ({ fieldPath, ...schema }) => JSON.stringify(schema);
  const apiCollectionSchemas = new Map();
  for (const file of valueFiles) for (const document of file.documents) for (const field of document.fields) {
    const schema = field.meaning.apiCollectionAuthority;
    if (!schema) continue;
    const key = collectionSchemaKey(schema);
    const existing = apiCollectionSchemas.get(key);
    if (existing && collectionSchemaContract(existing.schema) !== collectionSchemaContract(schema)) throw new Error(`API collection schema identity collision: ${key}`);
    const entry = existing ?? { schema, fields: [] };
    entry.fields.push({ source: file.path, document: document.index, path: field.path, line: field.sourceLine });
    apiCollectionSchemas.set(key, entry);
  }
  const sourceLink = (sourcePath, line = 1, label = `${sourcePath}:${line}`, endLine = line) => '[`' + label + '`](' + pinnedSourceUrl(sourcePath, line, endLine) + ')';
  const meaningEvidence = (evidence) => {
    const [source, ...details] = evidence.split('; ');
    const match = /^(.*):(\d+)$/u.exec(source);
    const linked = match ? sourceLink(match[1], Number(match[2]), source) : sourceLink(source, 1, source);
    return details.length > 0 ? `${linked}; ${details.join('; ')}` : linked;
  };
  const readerMeaning = (field, sourceClass) => {
    const meaning = literalText(field.meaning.text);
    const collection = field.meaning.apiCollectionAuthority
      ? `<br>[Exact API collection contract](#${collectionSchemaAnchor(field.meaning.apiCollectionAuthority)})`
      : '';
    if (sourceClass === 'helm-example' && field.required === 'not-applicable-unused'
      && ['inactive-profile', 'unused-field'].includes(field.meaning.status)) {
      const historical = field.meaning.status === 'inactive-profile'
        ? 'The recorded inactive-profile marker is limited here to this unused leaf. It does not prove that the complete file is unselected.<br>' : '';
      return `${historical}${literalText(editorialOwners.unusedHelmExampleLeaf)}<br>Owner: ${literalText(field.meaning.blockerOwner)}. Required before use: ${literalText(field.meaning.closureCondition)}<br>Recorded source evidence: ${meaningEvidence(field.meaning.evidence)}`;
    }
    if (field.meaning.status === 'inactive-profile') return `${meaning}<br>This file is not selected by a checked-in deployment path.`;
    if (/blocker/u.test(field.meaning.status)) return `${meaning}${collection}<br>This field is not ready for operator use because its receiving behavior is not yet proved.<br>Owner: ${field.blockerOwner}. Required before use: ${field.closureCondition}<br>Source evidence: ${meaningEvidence(field.meaning.evidence)}`;
    const authority = field.meaning.apiAuthority ? `<br>Behavior authority: ${field.meaning.apiAuthority}` : '';
    const semantic = field.meaning.semanticContractEvidence;
    const semanticAuthority = semantic
      ? `<br>Semantic contract: ${sourceLink(semantic.path, semantic.line, `${semantic.path}:${semantic.line}-${semantic.endLine}`, semantic.endLine)}`
      : '';
    return `${meaning}${collection}${authority}<br>Source evidence: ${meaningEvidence(field.meaning.evidence)}${semanticAuthority}`;
  };
  const apiCollectionSections = [...apiCollectionSchemas.values()].sort((left, right) => collectionSchemaKey(left.schema).localeCompare(collectionSchemaKey(right.schema))).map(({ schema, fields }) =>
    `<a id="${collectionSchemaAnchor(schema)}"></a>\n\n### ${schema.kind}: ${schema.resolvedPath === '' ? 'API object root' : literalCode(schema.resolvedPath)}\n\nAuthority: ${literalText(schema.authority)}. Content SHA-256: \`${schema.authoritySha256}\`. API: \`${schema.apiVersion}/${schema.kind}\`.\n\n[General field definitions, collection constraints and unused alternatives](${upstreamApiReference(schema.apiVersion, schema.kind)}). The full mechanical contract remains in the configuration inventory. Read the linked field row for the selected input, actual receiver, operational consequence and controller limit. A missing schema default does not prove that the controller inserts no default. A patch annotation does not select the client's apply mode.\n\nField sources:\n\n${fields.map((field) => `- ${sourceLink(field.source, field.line)} — document ${field.document}, \`${field.path}\`.`).join('\n')}\n`
  ).join('\n');
  const consumerText = (field) => field.consumers.map((consumer) => {
    if (consumer === 'unknown') return 'Unknown';
    const location = consumer.path ? sourceLink(consumer.path, consumer.line ?? 1) : '`unresolved source`';
    const condition = consumer.condition ? `<br>Condition: ${literalCode(consumer.condition)}` : '';
    const defaults = consumer.defaultProof ? `<br>Default selection: ${consumer.defaultProof}` : '';
    const receiver = consumer.receiver ? `<br>Receiver: ${consumer.receiver}` : '';
    return `${location}${consumer.authority ? `<br>${consumer.authority}` : ''}${receiver}${condition}${defaults}`;
  }).join('<br>');
  const selectedValueType = (field) => {
    const labels = {
      'authored-override': 'checked-in override',
      'chart-default': 'chart default',
      'authored-manifest': 'checked-in manifest value',
      'authored-embedded-payload': 'checked-in application payload',
      'unbound-authored-value': 'inactive checked-in value',
      'unused-chart-default': 'chart value with no active receiver',
    };
    return labels[field.defaultKind] ?? field.defaultKind.replaceAll('-', ' ');
  };
  const requiredState = (field) => {
    const labels = {
      required: 'Required by the selected receiver',
      conditional: 'Required when the linked condition selects it',
      optional: 'Optional for the selected receiver',
      'external-schema': 'Defined by the named external schema',
      'embedded-payload-contract': 'Defined by the named application reader',
      'source-loader-contract': 'Defined by the checked-in loader',
      'not-applicable-unused': 'Not used by a checked-in deployment path',
    };
    return labels[field.required] ?? field.required.replaceAll('-', ' ');
  };
  const literalKeyOverride = (field, sourceClass) => {
    const tokens = yamlFieldPathTokens(field.path);
    const literalKeys = tokens.filter((token) => typeof token === 'string' && token.includes('.'));
    if (!literalKeys.length) return '';
    const helmOverrideSource = ['gitops-values', 'helm-example', 'helm-overlay', 'helm-values', 'release-values'].includes(sourceClass);
    if (!helmOverrideSource) {
      return `<br>Literal YAML map key: ${literalKeys.map((key) => `\`${key}\``).join(', ')}. The bracket-quoted segment identifies one key; it does not identify nested maps.`;
    }
    const helmKey = (key) => key.replace(/[\\.,=\[\]]/gu, '\\$&');
    const helmPath = tokens.map((token, index) => typeof token === 'number'
      ? `[${token}]`
      : `${index === 0 ? '' : '.'}${helmKey(token)}`).join('');
    return `<br>Literal YAML map key: ${literalKeys.map((key) => `\`${key}\``).join(', ')}. Keep the quoted bracket segment as one key. Prefer a values file. For a Helm CLI override, escape the key's dot, for example \`--set '${helmPath}=<value>'\`.`;
  };
  const novaValueFields = valueFiles.find((file) => file.path === 'my-values/nova-values.yaml')?.documents
    .flatMap((document) => document.fields) ?? [];
  for (const capability of ['runtime.dispatch', 'test.plan.execute']) {
    const quoted = `.capabilities["${capability}"]`;
    if (!novaValueFields.some((field) => field.path.includes(quoted))) {
      throw new Error(`literal dotted capability key ${capability} is missing bracket-quoted publication notation`);
    }
    const flattened = `.capabilities.${capability}.`;
    if (novaValueFields.some((field) => field.path.includes(flattened))) {
      throw new Error(`literal dotted capability key ${capability} was flattened into nested publication segments`);
    }
  }
  const fieldSections = valueFiles.map((file) => {
    const fields = file.documents.flatMap((document) => document.fields)
      .filter((field) => field.path !== '$');
    const links = sourceRangeLinks(file.path);
    return `<details>\n<summary><code>${file.path}</code> — ${fields.length} discovered fields, including lists and maps</summary>\n\nSource evidence:\n\n${links}\n\n${table(['Field', 'Behavior', 'Type and selected value', 'Required state and limits', 'Source and runtime owner', 'Receiving source', 'Precedence and effective value', 'Change impact and failure'], fields.map((field) => [
      `\`${field.path}\``,
      `${readerMeaning(field, file.sourceClass)}${literalKeyOverride(field, file.sourceClass)}`,
      `\`${field.type}\`<br>${selectedValue(field.value)}<br>${selectedValueType(field)}`,
      `${requiredState(field)}: ${field.requiredReason}<br>${field.constraints.length ? field.constraints.map(literalText).join('<br>') : 'No additional repository constraint.'}`,
      `Source: ${field.ownerComponent} (\`${field.ownerEvidence}\`)<br>Runtime: ${field.runtimeOwner}`,
      consumerText(field),
      `${field.precedence.join(' → ')}<br>Proof: ${field.effectiveValueProof}`,
      `${field.changeImpact}<br>Failure: ${field.failureMeaning}`,
    ]))}\n\n</details>`;
  }).join('\n\n');
  const deployedConfigSections = (configurationSchemas.deployedPayloads ?? []).map((payload) => {
    const chain = payload.consumers
      .map((consumer) => `- ${sourceLink(consumer.path, consumer.line)} — ${consumer.authority}.`)
      .join('\n');
    const selection = (payload.selectionProof ?? [])
      .map((proof) => `- ${sourceLink(proof.path, proof.line)} — ${proof.authority}.`)
      .join('\n');
    const unboundReader = (payload.unboundReaderEvidence ?? [])
      .map((proof) => `- ${sourceLink(proof.path, proof.line)} — ${proof.authority}.`)
      .join('\n');
    const fields = payload.fields.length
      ? table(['Field', 'Type', 'Selected checked-in value'], payload.fields.map((field) => [
        `\`${field.path}\``, `\`${field.type}\``, selectedValue(field.value),
      ]))
      : 'This file is executable or tool-specific configuration rather than a YAML or JSON data tree. The inventory pins the complete file bytes and does not invent field behavior.';
    return `<details>\n<summary><code>${payload.path}</code> — ${payload.parseMode === 'recursive-yaml' || payload.parseMode === 'recursive-json' ? `${payload.leafFields} recursive fields` : 'complete opaque file'}</summary>\n\nSource: ${sourceLink(payload.path)}\n\nProved delivery steps:\n\n${chain}\n\nSource selection and retention:\n\n${payload.selectionPrecedence}\n\n${selection}\n\nRuntime reader boundary:\n\n${payload.readerBoundary}${unboundReader ? `\n\nRelated evidence that does not close the boundary:\n\n${unboundReader}` : ''}\n\n${fields}\n\n</details>`;
  }).join('\n\n');
  const undeployedConfigSections = (configurationSchemas.undeployedPayloads ?? []).map((payload) => {
    const references = payload.references
      .map((reference) => `${sourceLink(reference.path, reference.line)}<br>${reference.authority}.`)
      .join('<br>→<br>\n');
    const fields = payload.fields.length
      ? table(['Field', 'Type', 'Selected checked-in value'], payload.fields.map((field) => [
        `\`${field.path}\``, `\`${field.type}\``, selectedValue(field.value),
      ]))
      : 'This file is executable or tool-specific configuration rather than a YAML or JSON data tree.';
    return `<details>\n<summary><code>${payload.path}</code> — ${payload.parseMode === 'recursive-yaml' || payload.parseMode === 'recursive-json' ? `${payload.leafFields} recursive fields` : 'complete opaque file'}</summary>\n\nSource: ${sourceLink(payload.path)}\n\nChecked-in reference and failure boundary:\n\n${references}\n\n${payload.deliveryGap}\n\n${fields}\n\n</details>`;
  }).join('\n\n');
  return `# Helm, GitOps, And Infrastructure Configuration

Status: generated reference
Audience: reference reader, operator
Owner: platform-operations
Evidence: docs/generated/inventory/configuration-values.json; scripts/docs-configuration-inventory.mjs; scripts/docs-generate.mjs
Applies to: checked-in Helm, GitOps, release, and infrastructure YAML configuration
Last verified: generated from current inventory

## Summary

${helmSnapshotSummary}

${generatedNotice(['docs/generated/inventory/configuration-values.json'])}
## Coverage

${table(['Class', 'Count', 'Meaning'], [
  ['All discovered YAML leaves', configurationValues.totals.leafFields, 'Recursive scalar discovery scope.'],
  ['Nonroot lists and maps', configurationValues.totals.collectionFields, 'Whole-collection contracts or explicitly grouped nested field contracts.'],
  ['Empty lists and maps', configurationValues.totals.emptyCollectionFields, 'Empty collections retain their own schema, merge and receiving behavior.'],
  ['Kubernetes and Argo API fields', configurationValues.totals.kubernetesApiObjectLeaves, 'Versioned API admission and the named controller own these object fields.'],
  ['Operational Kubernetes and Argo fields', configurationValues.totals.kubernetesOperationalLeaves, 'Ports, images, replicas, source revisions, destinations, references, storage, policy, and other fields that change operation.'],
  ['Structural Kubernetes and Argo fields', configurationValues.totals.kubernetesStructuralLeaves, 'API identity and object structure that do not form a separate KubeClaw runtime option.'],
  ['Active operator configuration leaves', configurationValues.totals.activeOperatorConfigurationLeaves, 'Local chart, external chart, payload, or loader configuration after API-object fields and inactive profiles are separated.'],
  ['Fields without a complete behavior contract', configurationValues.totals.activeMeaningBlockers, 'These fields are not ready for operator use until the receiving behavior and failure result are proved.'],
  ['Opaque payloads without a proved reader', configurationValues.totals.embeddedPayloadContractsNeedingConsumerProof, 'Kubernetes stores these ConfigMap or Secret values, but the application reader must define their meaning.'],
  ['Recorded inactive-profile leaf markers', configurationValues.totals.inactiveProfileLeaves, 'This count records stored leaf classifications. A field-level unused marker does not prove that all other fields in its file are inactive.'],
])}
## Discovered Value Sources

${table(['File', 'Class', 'Documents', 'Recursive fields'], valueFiles.map((file) => [
  `\`${file.path}\``,
  `\`${file.sourceClass}\``,
  file.documents.length,
  file.documents.reduce((sum, document) => sum + document.fields.length, 0),
]))}

## Recursive Value Reference

Each field row separates the checked-in source from the runtime receiver. It follows local Helm templates, Argo CD value-file bindings, and Kubernetes resource authorities. An external chart or Kubernetes API owns validation when its schema is outside this repository. A field with no active deployment binding is identified as inactive instead of being presented as an effective option.

${fieldSections}

${rejectedApiProfiles}

## Product API Field Reference

This reference separates JSON decoding, API rules and the component that uses each field. Read the operation and related conditions before changing a value. List items and map values have their own field entries; their empty and null behavior can differ from the enclosing collection.

${apiResourceSections}

## Kubernetes API Collection Contracts

Each field row links to its own kind and schema path below. These entries identify the pinned schema and link to general upstream constraints. The complete mechanical contracts remain in the inventory. The selected operational explanation and receiving path remain in the field row.

${apiCollectionSections}

## Deployed Configuration Payloads

The chart embeds each file below in the swarm ConfigMap and the init process materializes it in runtime configuration. YAML and JSON files are expanded to every leaf. Executable JavaScript and HCL files remain complete, digest-pinned files because treating their syntax as ordinary key/value data would invent semantics. A payload without a checked-in reader is identified as tool- or image-owned.

${deployedConfigSections}

## Checked-In Configuration Without Chart Delivery

The files below exist in the chart source and another checked-in configuration references them. The current chart does not embed or copy them into runtime configuration. They are not working operator options. The reference and loader boundary explain the resulting failure without claiming an unsupported delivery path.

${undeployedConfigSections || 'No checked-in configuration payload is missing a chart delivery path.'}
${generatedEnd()}
## Used by

- [Install and Bootstrap](../use/install.md)
- [Maintain and Upgrade](../use/maintenance.md)
- [Secrets Reference](secrets.md)

## Runtime Meaning

| Value group | Runtime effect | Expected proof |
| --- | --- | --- |
| image and pull secrets | selects agent and sidecar images, tags, pull policy, and GHCR pull Secret | rendered Deployments include expected image refs and \`imagePullSecrets\` |
| auth/provider/Discord/Stitch/LiteLLM | selects direct values or existing Secret name/key references | rendered env refs point to expected Secret keys and generated secrets reference lists those keys |
| persistence | creates workspace/config PVCs for gateway and plugin-runtime state | rendered PVCs and security contexts match production values |
| service and extra ports | exposes gateway/bridge ClusterIP ports plus explicit extra NodePorts | rendered Services contain only documented ports |
| buster namespace broker | adds lease CRD/RBAC/controller and controller env vars | Buster render includes CRD, lease client RBAC, controller Deployment, and namespace fence docs |
| probes, startup doctor, and dependency checks | configures gateway, Redis, and LiteLLM health checks; \`gateway.startupDoctor\` runs \`openclaw doctor --fix\` as a blocking state update while the gateway is stopped | rendered init container, env vars, and smoke commands exercise the health and doctor surfaces |

## Failure Signals

- A top-level value appears in this page but has no rendered effect: add deployment truth coverage or remove the stale value.
- Rendered Secret refs do not match \`my-values/setup-secrets.sh\`: update values, helper, inventory, and docs together.
- Buster values disable sandbox/broker behavior unexpectedly: inspect \`my-values/buster-values.yaml\` before changing chart templates.
- A live pod keeps old config after values change: remember the init container preserves persisted config unless override flags request replacement.

## Generated from

- \`../generated/inventory/configuration-values.json\`
- \`../../scripts/docs-configuration-inventory.mjs\`
- \`../../scripts/docs-generate.mjs\`
`;
}

function renderEnvironment(deploy, secrets, runtimeInputs) {
  const combined = new Map();
  for (const item of [...deploy.environment, ...secrets.environment]) {
    if (!combined.has(item.name)) {
      combined.set(item.name, {
        name: item.name,
        description: item.description,
        deployDefault: deploy.defaults[item.name] ?? '',
        secretDefault: secrets.defaults[item.name] ?? '',
      });
    }
  }
  const descriptions = combined;
  const rows = runtimeInputs.environment;
  const configuredReceivers = runtimeInputs.configuredEnvironmentReceivers ?? [];
  const configuredReceiverEvidence = (item) => (item.evidence ?? []).map((e) => `[\`${e.path}:${e.line}\`](${pinnedSourceUrl(e.path, e.line, e.endLine)})`).join('<br>');
  const publishableValue = (value) => typeof value === 'string' && /docs\/(?:deployment|operations|operators|reference)\//.test(value)
    ? '<source diagnostic contains a non-published path>'
    : value;
  const groupedConsumers = (item) => {
    const groups = new Map();
    for (const consumer of item.consumers) {
      const key = `${consumer.path}:${consumer.access}`;
      const group = groups.get(key) ?? { ...consumer, lines: [] };
      group.lines.push(consumer.line);
      groups.set(key, group);
    }
    return [...groups.values()].map((group) => {
      const line = Math.min(...group.lines);
      return `[\`${group.path}:${line}\`](${pinnedSourceUrl(group.path, line, line)}) (${group.access}; ${group.lines.length} occurrence${group.lines.length === 1 ? '' : 's'})`;
    }).join('<br>');
  };
  const evidenceLink = (evidence) => {
    const match = /^(.*):(\d+)$/u.exec(evidence);
    return match ? `[\`${evidence}\`](${pinnedSourceUrl(match[1], Number(match[2]), Number(match[2]))})` : evidence;
  };
  const groupedPrecedence = (item) => [...new Map(item.precedence.map((step) => {
    const key = `${step.order}:${step.source}:${step.condition}:${step.value ?? ''}`;
    return [key, step];
  })).values()].map((step) => `${step.order}. ${step.source}: ${step.condition}${step.value === undefined ? '' : `; \`${publishableValue(step.value)}\``} (${evidenceLink(step.evidence)})`).join('<br>');
  const environmentMeaning = (item) => {
    const authored = descriptions.get(item.name)?.description;
    const authority = `${authored ? `${authored}<br>` : ''}${item.meaning}<br>Impact: ${item.changeImpact}<br>Failure: ${item.failureMeaning}<br>Source: ${evidenceLink(item.meaningEvidence)}`;
    if (!/blocker/u.test(item.meaningStatus)) return authority;
    return `${authority}<br>Not a completed operator option. Authority owner: ${item.blockerOwner}. Completion requires an exact reader contract for purpose, accepted form, default/required rule, impact, and failure symptom.`;
  };
  const consumerContracts = (item) => item.consumerContracts?.length
    ? item.consumerContracts.map((contract) => {
      const authorities = [{ path: contract.path, line: contract.line, endLine: contract.line }, ...(contract.evidence ?? [])]
        .filter((authority, index, all) => all.findIndex((candidate) => candidate.path === authority.path
          && candidate.line === authority.line && candidate.endLine === authority.endLine) === index)
        .map((authority) => `[\`${authority.path}:${authority.line}${authority.endLine === authority.line ? '' : `-${authority.endLine}`}\`](${pinnedSourceUrl(authority.path, authority.line, authority.endLine)})`)
        .join('<br>');
      return `${authorities}<br>Purpose: ${contract.purpose}<br>Accepted: ${contract.acceptedForm}<br>Default: ${contract.defaultBehavior}<br>Empty: ${contract.emptyBehavior}<br>Invalid: ${contract.invalidBehavior}<br>Required: ${contract.required}<br>Precedence: ${contract.precedence}<br>Impact: ${contract.impact}<br>Failure: ${contract.failure}`;
    }).join('<br><br>')
    : 'One name-level contract applies to all listed consumers, or the variable is a classified transport boundary.';
  const directSettingGuidance = (item) => item.surface === 'maintainer-verification-input'
    ? 'Set only for the listed development tool invocation. This input does not configure a running product service.'
    : item.setDirectly ? 'Set at the owning process boundary.'
    : item.direction.startsWith('internal shell assignment') ? 'Internal implementation detail; no operator or external setting exists.'
      : 'Do not set directly; use the listed producer or external authority.';

  return `# Environment Variables

Status: generated reference
Audience: reference reader, operator
Owner: platform-operations
Evidence: docs/generated/inventory/configuration-runtime-inputs.json; scripts/docs-configuration-inventory.mjs; scripts/docs-generate.mjs
Applies to: checked-in runtime, deployment, chart, GitOps, and skill sources
Last verified: generated from current inventory

## Summary

This page lists environment variables that the checked-in sources read or inject. It includes deployment helpers, Kubernetes templates, skills, tools, and image entrypoints. It also includes inputs to development tools. A source reference proves that a file uses the name. It does not prove that every deployment sets the variable.

The Surface column identifies the receiving process. A \`maintainer-verification-input\` controls a development tool, such as its input directory. Set it only when you run that tool. It does not configure a running product service. The consumer-specific contract identifies the tool, its accepted values, and its errors.

${environmentConsumerGuidance}

${generatedNotice(['docs/generated/inventory/configuration-runtime-inputs.json'])}
## Surface Coverage

${table(['Class', 'Count', 'Meaning'], [
  ['All discovered names', runtimeInputs.totals.environmentVariables, 'Unique names read from process input or injected by checked-in Kubernetes YAML.'],
  ['Configuration-selected names', configuredReceivers.length, 'Supported receiving sites whose environment variable name is selected by a configuration field, rather than fixed in source.'],
  ['Operator-authored inputs', runtimeInputs.totals.operatorAuthoredEnvironmentInputs, 'A checked-in operator command reads this input directly.'],
  ['Injection-only names', runtimeInputs.totals.injectionOnlyEnvironmentVariables, 'A checked-in manifest produces the variable, but no checked-in receiving reader proves its behavior.'],
  ['Development-tool inputs', rows.filter((item) => item.surface === 'maintainer-verification-input').length, 'Inputs to the named development tools. These names remain in the complete reference but do not configure running product services.'],
])}
## Variables

${table(['Name', 'Surface and direct setting', 'Purpose, impact, and failure', 'Accepted form', 'Default, empty, invalid, and precedence', 'Sensitivity class', 'Required and source precedence', 'Consumer-specific contract', 'Consumers'], rows.map((item) => [
  `\`${item.name}\``,
  `\`${item.surface}\`<br>${item.direction}<br>${directSettingGuidance(item)}`,
  environmentMeaning(item),
  item.acceptedForm,
  `Default: ${item.defaultBehavior}<br>Empty: ${item.emptyBehavior}<br>Invalid: ${item.invalidBehavior}<br>Winner: ${item.precedenceExplanation}`,
  item.sensitivityClass === 'secret-value' ? `secret value; ${item.sensitivityReasons.join('; ')}; values are not published`
    : item.sensitivityClass === 'secret-file-path' ? `Secret-file path; ${item.sensitivityReasons.join('; ')}`
      : item.sensitivityClass === 'public-verification-file-path' ? `public verification-file path; ${item.sensitivityReasons.join('; ')}`
      : item.sensitivityClass === 'public-verification-material' ? `public verification material; ${item.sensitivityReasons.join('; ')}`
        : item.sensitivityClass === 'identity-reference' ? `identity reference; ${item.sensitivityReasons.join('; ')}`
        : /^(?:secret-(?:setup-control|key-name-reference|object-name-reference|object-name-list|authority-reference)|rbac-role-reference)$/u.test(item.sensitivityClass) ? `public \`${item.sensitivityClass}\`; ${item.sensitivityReasons.join('; ')}`
          : item.sensitivityClass === 'public-authority-reference' ? `public authority reference; ${item.sensitivityReasons.join('; ')}`
        : 'ordinary value; no sensitive name or Secret provenance detected',
  `${item.required}<br>${groupedPrecedence(item)}`,
  consumerContracts(item),
  groupedConsumers(item),
]))}
${configuredReceivers.length ? `## Configuration-Selected Variable Names

Some runtime configuration fields select an environment variable name. These names are not a fixed list. Set the named variable in the actual receiving process and follow the configuration field's conditions. The example names on the linked configuration page are examples, not the only supported names.

${table(['Configuration field and source', 'Purpose and condition', 'Accepted form', 'Default, empty, invalid, and precedence', 'Impact and failure'], configuredReceivers.map((item) => [
  `\`${item.configurationField}\` in [\`${item.function}\`](${pinnedSourceUrl(item.path, item.line, item.line)})<br>[Runtime configuration](${path.posix.relative('reference', item.canonicalPage)})<br>${configuredReceiverEvidence(item)}`,
  `${item.purpose}<br>Required: ${item.required}<br>Condition: ${item.condition}`,
  item.acceptedForm,
  `Default: ${item.defaultBehavior}<br>Empty: ${item.emptyBehavior}<br>Invalid: ${item.invalidBehavior}<br>Precedence: ${item.precedence}`,
  `Impact: ${item.impact}<br>Failure: ${item.failure}`,
]))}
` : ''}
${generatedEnd()}
## Ownership And Runtime Boundaries

| Variable group | Owner | Runtime effect | Verification |
| --- | --- | --- | --- |
| Namespace and workspace prompt | \`scripts/deploy.sh\`; \`my-values/setup-secrets.sh\` | selects the Kubernetes namespace and optionally records \`my-values/.workspace-namespace\` for local operator convenience | \`./scripts/deploy.sh status\`; generated inventory check |
| Component switches | \`scripts/deploy.sh\`; \`my-values/setup-secrets.sh\` | controls optional PostgreSQL, LiteLLM, and Tailscale setup paths; \`ALLOW_PARTIAL_INFRA\` changes rollout failures from fail-closed to warning | deployment truth plus live rollout status |
| Secret setup controls | \`my-values/setup-secrets.sh\` | chooses interactive/noninteractive/auto resolution, overwrite behavior, source namespace copies, and Tailscale OAuth bootstrap | \`kubectl -n "$NAMESPACE" get secret ...\`; \`kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" get secret operator-oauth\` |
| Code bundle selection | \`scripts/deploy.sh\` | derives GitHub release bundle URLs from repository + commit unless explicit archive URLs are provided | \`NOVA_CODE_BUNDLE_EXPECTED_COMMIT=<sha> ./scripts/deploy.sh code nova\`; \`BUSTER_CODE_BUNDLE_EXPECTED_COMMIT=<sha> ./scripts/deploy.sh code buster\` |

## Failure Modes

- Invalid boolean-like values can skip expected component paths or keep optional setup enabled; use the exact values listed in this table.
- Noninteractive secret setup warns when a required source is unavailable instead of inventing credentials.
- \`ALLOW_PARTIAL_INFRA=true\` is for troubleshooting only; the default infra path should fail closed on required rollout failures.
- Code deploy requires the expected commit for each targeted agent. Private repositories also require a bundle auth Secret for GitHub release assets.

## Checks

\`\`\`bash
npm run docs:inventory:check
npm run docs:inventory:config:check
npm run docs:drift:config:mutations
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
\`\`\`

## Generated from

- \`../generated/inventory/configuration-runtime-inputs.json\`
- \`../../scripts/docs-configuration-inventory.mjs\`
- \`../../scripts/docs-generate.mjs\`
`;
}

function renderVerification(deploy) {
  const commands = deploy.commands.filter((command) => /smoke|status|image|code/.test(command.invocation));
  return `# Verification Commands

Status: generated reference
Audience: operator, developer
Owner: platform-maintainers
Evidence: docs/generated/inventory/deploy-script.json; scripts/docs-generate.mjs
Applies to: local and deployment verification
Last verified: generated from current inventory

## Summary

This page lists deployment verification commands plus source-backed local checks.

${generatedNotice(deploy.generatedFrom)}
## Deployment Verification Commands

${table(['Command', 'Description'], commands.map((command) => [
  `\`${command.invocation}\``,
  command.description,
]))}
${generatedEnd()}
## Command Effects And Authority

The deployment commands above are not all read-only verification. Run them from
the repository root with the intended Kubernetes context and namespace selected.
The platform maintainer owns this deployment route; use the [CLI reference](cli.md)
and [operator procedure](../use/operate.md) for prerequisites and recovery.

| Command family | Effect and required authority | Expected observation and stop boundary |
| --- | --- | --- |
| \`image\`, \`image <name>\` | Mutates the selected agent deployment through \`cmd_image\` → \`deploy_agent\` in image mode. Requires deployment write authority, not only permission to inspect pods. | Applies selected image/runtime values and waits for deployment health. A failure can follow partial mutation; inspect the selected release before recovery. Do not run as a read-only check. |
| \`nova-production-preflights <image>\` | Runs live production-suite preflights after source-cutover checks. Requires the individual preflights' cluster, execution and external-service authority; can create workloads, images and receipts. | Each required proof must succeed. Stop on failure; do not equate partial results with whole-suite acceptance or retry unknown external effects blindly. |
| \`smoke\`, \`smoke-agent <name>\` | Inspects deployed workloads, waits for readiness and executes gateway/health/file checks inside containers. Requires cluster read and pod-exec authority. \`smoke\` also checks Prism when enabled. | Successful checks establish only the tested pod/health boundary, not a full pipeline run. Diagnose a failed check before changing deployments. |
| \`status\` | Reads resource status; includes Prism status when enabled. Requires resource-read authority in the selected namespaces. | Displays observed resources, not functional pipeline acceptance. Missing or unhealthy resources require diagnosis, not an automatic redeploy. |

These effects follow the dispatch and \`cmd_image\`, \`cmd_smoke_agent\`, \`cmd_smoke\`,
\`cmd_status\` and \`cmd_nova_production_preflights\` implementations in
[scripts/deploy.sh](../../../scripts/deploy.sh). No command here has been executed
against a live deployment as part of this documentation correction.

## Local Documentation And Deployment Checks

\`\`\`bash
npm run verify:plugin-system-v2
npm run typecheck:skills
npm run docs:inventory:check
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
\`\`\`

## Claim-To-Test Map

| Claim class | Source or verifier |
| --- | --- |
| Documentation inventory and generated references are current | \`npm run docs:inventory:check\`; \`npm run docs:generate:check\`; \`node scripts/docs-check.mjs\` |
| Core, package, capability, lifecycle, recovery, isolation, and malicious-package checks pass | \`npm run verify:plugin-system-v2\` |
| Deployment manifests, NetworkPolicies, service exposure, PVCs, config mounts, and sandbox surfaces match source | \`node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"\` |
| Documentation surface links and generated docs expectations stay valid | \`npm run docs:check\` |
| Restart, recovery, retry, crash, and resume behavior remain source-backed | \`node tests/verification/contracts/check-plugin-system-v2-phase7.mjs\`; \`node tests/verification/contracts/check-plugin-system-v2-resume.mjs\` |
| The complete real model-backed workflow works | \`node tests/verification/e2e/run-real-pipeline-e2e.mjs --mode full\` |
| Proposed doc edits have no whitespace errors | \`git diff --check\` |
| Referenced source paths/config keys exist | Use a targeted \`test -e\`/ \`rg -q\` sanity check for newly cited paths and keys before closing the docs pass. |

## Generated from

- \`../generated/inventory/deploy-script.json\`
- \`../../scripts/docs-generate.mjs\`
`;
}

function renderWorkflows(workflows) {
  const pipeline = renderProductPipeline(root);
  const pipelineSources = [...new Set([
    'skills/common/plugin-runtime/sdk/src/generated/contracts.ts',
    ...[...pipeline.matchAll(/^### (.+\.ts)$/gmu)].map(match => match[1]),
  ])];
  return `# Workflow Inventory

Status: generated reference
Audience: maintainer, developer
Owner: platform-maintainers
Evidence: docs/generated/inventory/workflows.json; scripts/docs-generate.mjs
Applies to: repository automation
Last verified: generated from current inventory

## Summary

This page lists product GitHub Actions workflows, their triggers, path filters, jobs, schedules, and command/action references. When deployment, images, tests, skills, plugins or CI behavior change, use this inventory.

${generatedNotice(workflows.generatedFrom)}
## Workflows

${renderWorkflowTable(workflows)}
${pipeline}

## Product pipeline source revision

The documentation generator derives the product pipeline declarations above from revision \`${sourceRevision}\`. These links identify their source bytes. They do not prove runtime execution or complete workflow-family coverage.

${pipelineSources.map(source => `### Source: ${source}\n\n${sourceRangeLinks(source)}`).join('\n\n')}

${generatedEnd()}
## Drift Guardrails

| Guardrail | Protected surface | Failure signal |
| --- | --- | --- |
| \`npm run docs:check:generated\` | generated inventory and generated reference pages | stale \`docs/generated/inventory/*.json\` or stale generated reference Markdown |
| \`npm run docs:check:refs\` | local Markdown links and cited repository paths | missing doc, script, workflow, chart, config, test, skill, plugin, or root file path |
| \`npm run docs:check:coverage\` | documentation topic-map consistency | missing active docs referenced by the topic map or vague topic-map weakness language |
| \`git diff --check\` | whitespace hygiene in changed files | trailing whitespace or conflict-marker-like whitespace errors |

## Maintenance Notes

- After workflow files change, regenerate this page with \`npm run docs:inventory && npm run docs:generate\`.
- Keep workflow path filters broad enough to find documented runtime drift. If the coverage adds a small amount of CI time, keep the coverage.
- If a workflow command changes, update the human docs only when the changed command affects a documented operator/developer procedure.

## Generated from

- \`../generated/inventory/workflows.json\`
- \`../../scripts/docs-generate.mjs\`
`;
}

const outputs = stableWriteMap();
const stale = [];
if (only === 'retained-configuration-language') assertRetainedPageDestinations(root, [...outputs.keys()], { semantic: retainedSemanticMode });

for (const [relPath, expected] of outputs) {
  const absPath = path.join(root, relPath);
  if (checkOnly) {
    const actual = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : null;
    if (actual !== expected) stale.push(relPath);
  } else {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    if (only === 'retained-configuration-language') writeRetainedPage(absPath, expected);
    else fs.writeFileSync(absPath, expected);
    console.log(`wrote ${relPath}`);
  }
}

if (checkOnly) {
  if (stale.length) {
    console.error('Generated reference docs are stale. Run: npm run docs:generate');
    for (const file of stale) console.error(`stale: ${file}`);
    process.exit(1);
  }
  console.log('generated reference docs are current');
}
