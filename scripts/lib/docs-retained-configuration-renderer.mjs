// Versioned retained 6fa renderer: static pure copy, not the current inventory schema.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {yamlFieldPathTokens} from './docs-retained-yaml-field-path.mjs';
export function table(headers, rows) {
  const escape = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

export function generatedNotice(sources) {
  return [
    '<!-- BEGIN GENERATED: source-backed reference -->',
    '',
    `Generated from: ${sources.map((source) => `\`${source}\``).join(', ')}`,
    '',
  ].join('\n');
}

export function generatedEnd() {
  return '\n\n<!-- END GENERATED -->\n';
}


export function renderRetainedConfigurationReferences({runtimeInputs,configurationValues,configurationSchemas,deploy,secrets,readSourceText,sourceRevision,editorialRevision=null,artifactRevision,banner=false,editorialSourcePath=null}) {
 assert.equal(typeof readSourceText,'function');
 assert.match(sourceRevision,/^[0-9a-f]{40}$/u);
 assert.equal(sourceRevision,'6fa4830a48244d29655104a5be58957d5fa87d2f','UNSUPPORTED_RETAINED_RENDERER_SOURCE_VERSION');
 assert.equal(artifactRevision,'145da1d0b30fb3b636c4b03fb3d3252819ee2bf5','UNSUPPORTED_RETAINED_RENDERER_ARTIFACT_VERSION');
 const maximumSourceLinkLines=60;
function sourceLineCount(sourcePath) {
  const source = readSourceText(sourcePath);
  if (!source) return 0;
  const lines = source.split('\n').length;
  return source.endsWith('\n') ? lines - 1 : lines;
}

function pinnedSourceUrl(sourcePath, startLine, endLine = startLine) {
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
  const lines = readSourceText(sourcePath).split('\n');
  const candidates = sourcePath.endsWith('package.json')
    ? [/"name"\s*:/]
    : [/"configSchema"\s*:/, /"configurationSchema"\s*:/, /"schemas?"\s*:/];
  const index = lines.findIndex((line) => candidates.some((candidate) => candidate.test(line)));
  return index < 0 ? 1 : index + 1;
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

function renderHelmValues(configurationValues, configurationSchemas) {
  const valueFiles = configurationValues.files;
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
  const readerMeaning = (field) => {
    const meaning = literalText(field.meaning.text);
    const collection = field.meaning.apiCollectionAuthority
      ? `<br>[Exact API collection contract](#${collectionSchemaAnchor(field.meaning.apiCollectionAuthority)})`
      : '';
    if (field.meaning.status === 'inactive-profile') return `${meaning}<br>This file is not selected by a checked-in deployment path.`;
    if (/blocker/u.test(field.meaning.status)) return `${meaning}${collection}<br>This field is not ready for operator use because its receiving behavior is not yet proved.<br>Owner: ${field.blockerOwner}. Required before use: ${field.closureCondition}<br>Source evidence: ${meaningEvidence(field.meaning.evidence)}`;
    const authority = field.meaning.apiAuthority ? `<br>Behavior authority: ${field.meaning.apiAuthority}` : '';
    const semantic = field.meaning.semanticContractEvidence;
    const semanticAuthority = semantic
      ? `<br>Semantic contract: ${sourceLink(semantic.path, semantic.line, `${semantic.path}:${semantic.line}-${semantic.endLine}`, semantic.endLine)}`
      : '';
    return `${meaning}${collection}${authority}<br>Source evidence: ${meaningEvidence(field.meaning.evidence)}${semanticAuthority}`;
  };
  const schemaContractText = (node) => {
    if (!node) return 'This field has no contract at this boundary.';
    const { description, observedSchemaKeywords, schemaReferenceChain, referencedContract, ...constraints } = node;
    return `${description === undefined ? 'The schema supplies no description for this node.' : literalText(description)}<br>Constraints and alternatives: ${literalCode(JSON.stringify(constraints))}<br>Keywords at this boundary: ${literalCode(JSON.stringify(observedSchemaKeywords))}${schemaReferenceChain ? `<br>Reference: ${literalCode(JSON.stringify(schemaReferenceChain))}<br>Referenced definition: ${schemaContractText(referencedContract)}` : ''}`;
  };
  const apiCollectionSections = [...apiCollectionSchemas.values()].sort((left, right) => collectionSchemaKey(left.schema).localeCompare(collectionSchemaKey(right.schema))).map(({ schema, fields }) => {
    const children = [...Object.entries(schema.children).map(([name, node]) => [`Child \`${name}\``, schemaContractText(node)]),
      ...Object.entries(schema.itemChildren).map(([name, node]) => [`Item child \`${name}\``, schemaContractText(node)])];
    const parents = schema.parentContracts.map((parent) => [`Parent \`${parent.path || '<API object>'}\``, schemaContractText(parent)]);
    return `<a id="${collectionSchemaAnchor(schema)}"></a>\n\n### ${schema.kind}: ${schema.resolvedPath === '' ? 'API object root' : literalCode(schema.resolvedPath)}\n\nAuthority: ${schema.authority}. Content SHA-256: \`${schema.authoritySha256}\`. API: \`${schema.apiVersion}/${schema.kind}\`.\n\nThis section preserves the exact pinned schema descriptions. It describes accepted shape and the stated API behavior. Read the linked field row for the selected input, actual apply or loader receiver, operational consequence, and controller limit. A missing schema default does not prove that the controller inserts no default. A patch annotation does not select the client's apply mode.\n\n${table(['Boundary', 'Exact schema contract'], [
      ['Field', schemaContractText(schema.contract)], ['List item', schemaContractText(schema.item)],
      ['Map value', schemaContractText(schema.mapValue)], ...children, ...parents,
    ])}\n\nField sources:\n\n${fields.map((field) => `- ${sourceLink(field.source, field.line)} — document ${field.document}, \`${field.path}\`.`).join('\n')}\n`;
  }).join('\n');
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
      `${readerMeaning(field)}${literalKeyOverride(field, file.sourceClass)}`,
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

This page lists every current scalar, list, and map in chart defaults, checked-in overlays, GitOps values and manifests, release values, and infrastructure manifests. Open a file section to inspect its nested fields. The inventory redacts credentials, identities, and access lists. A redacted value remains configurable, but this page never publishes its content.

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
  ['Inactive profile leaves', configurationValues.totals.inactiveProfileLeaves, 'No checked-in active binding proves runtime effect.'],
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

## Kubernetes API Collection Contracts

Each field row links to its own kind and schema path below. These contracts include the direct children, list items, map values, parent requirements, alternatives and API patch annotations from the pinned schema. The operational explanation and the actual receiving path remain in the field row.

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

${generatedNotice(['docs/generated/inventory/configuration-runtime-inputs.json'])}
## Surface Coverage

${table(['Class', 'Count', 'Meaning'], [
  ['All discovered names', runtimeInputs.totals.environmentVariables, 'Unique names read from process input or injected by checked-in Kubernetes YAML.'],
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


 const outputs=new Map([
 ['docs/site/reference/helm-values.md',renderHelmValues(configurationValues,configurationSchemas)],
 ['docs/site/reference/environment-variables.md',renderEnvironment(deploy,secrets,runtimeInputs)],
 ]);
 if(banner){
  assert.match(editorialRevision??'',/^[0-9a-f]{40}$/u);
  if(editorialSourcePath!==null)assert.match(editorialSourcePath,/^scripts\/[A-Za-z0-9_./-]+\.mjs$/u);
  const editorialOwner=editorialSourcePath===null?'`'+editorialRevision+'`':'[`'+editorialSourcePath+'` at `'+editorialRevision+'`](https://github.com/datrab/kubeclaw/blob/'+editorialRevision+'/'+editorialSourcePath+')';
  const provenance=`> Retained historical view. Artifact: \`${artifactRevision}\`; source facts and original evidence: \`${sourceRevision}\`. Editorial language owner: ${editorialOwner}. This view does not perform current discovery, runtime validation, or API-role qualification. Inherited metadata and current-inventory statements below describe only the retained snapshot.\n\n`;
  for(const [key,value] of outputs){const headingEnd=value.indexOf('\n\n')+2;outputs.set(key,value.slice(0,headingEnd)+provenance+value.slice(headingEnd));}
 }
 return outputs;
}
