import assert from 'node:assert/strict';
import { apiProductSelection, assertProductApiContexts, productMetadataReferences, productApiReceiverRecords } from './docs-api-product-scope.mjs';
import { createHash } from 'node:crypto';
import { apiResourceFieldBoundaries, apiSchemaUpstreamReference, isProductOwnedApi } from './docs-api-schema-authorities.mjs';
import { discoverRejectedApiOutputProfiles } from './docs-api-output-discovery.mjs';

export function renderRejectedApiOutputProfiles(profiles,sourceLink,sourceRoot) {
  assert(Array.isArray(profiles),'API_REFERENCE_REJECTED_PROFILE_INVENTORY_MISSING');
  assert.deepEqual(profiles,discoverRejectedApiOutputProfiles(sourceRoot),'API_REFERENCE_REJECTED_PROFILE_DRIFT');
  if(!profiles.length)return '';
  return '## Illustrative Values That Require Preparation\n\n'+profiles.map(profile=>
    `${sourceLink(profile.profile,1)} is an illustrative input. Its unchanged standalone render stops with ${code(profile.observedError.split('\n')[0])}. No resource is emitted.\n\n${text(profile.safeStop)} ${text(profile.preparationCriterion)} Owner: ${text(profile.owner)}. Follow [configuration preparation](../${profile.canonicalProcedure.replace(/^docs\/site\//u,'')}).\n`).join('\n');
}
import { apiReceiverCoverage, assertApiReceiverCoverage } from './docs-api-receiver-coverage.mjs';
import { implicitKubernetesObjectMetaReferences as canonicalMetadataReferences } from './docs-kubernetes-metadata-receiver-contracts.mjs';

const text = value => String(value).replace(/[&<>"'\\`\[\]*_|~]/gu,
  character => `&#${character.codePointAt(0)};`).replaceAll('\n', '<br>');
const code = value => `<code>${text(value)}</code>`;
const identity = row => JSON.stringify([row.apiVersion, row.kind, row.fieldPath]);
const anchor = row => `api-field-${createHash('sha256').update(identity(row)).digest('hex').slice(0, 20)}`;

function renderReceiverContract(receiver, key, fieldPath) {
  const prose = [receiver.purpose, receiver.receiver, receiver.operationScope,
    receiver.omitted, receiver.nullValue, receiver.emptyValue, receiver.invalidValue,
    receiver.changeImpact, ...(receiver.crossFieldConditions ?? []),
    ...(receiver.qualificationLimits ?? []), ...(receiver.cases ?? []).flatMap(item =>
      [item.name, item.condition, item.sourceOutcome]),
    ...(receiver.evidence ?? []).map(item => item.claim)];
  // Explicit authoring obligations belong in internal evidence, never in
  // the product reference. Real product limits remain publishable prose.
  assert(!prose.some(value => /OPEN (?:DOCUMENTATION|SHARED METADATA) PROOF|Available-source documentation gap|unclosed source-proof obligation|open source-audit obligation/iu.test(String(value))),
    `API_REFERENCE_UNRESOLVED_PROOF: ${key} ${fieldPath}`);
  for (const name of ['purpose', 'receiver', 'operationScope', 'omitted', 'nullValue', 'emptyValue', 'invalidValue', 'changeImpact']) {
    assert(typeof receiver[name] === 'string' && receiver[name].trim(),
      `API_REFERENCE_RECEIVER_INCOMPLETE: ${key} ${fieldPath} ${name}`);
  }
  for (const name of ['crossFieldConditions', 'cases', 'evidence', 'qualificationLimits']) {
    assert(Array.isArray(receiver[name]), `API_REFERENCE_RECEIVER_INCOMPLETE: ${key} ${fieldPath} ${name}`);
  }
  assert(receiver.cases.length && receiver.evidence.length,
    `API_REFERENCE_RECEIVER_INCOMPLETE: ${key} ${fieldPath} cases/evidence`);
  const cases = receiver.cases.map(item => {
    for (const name of ['name', 'condition', 'sourceOutcome']) assert(typeof item[name] === 'string' && item[name].trim(),
      `API_REFERENCE_CASE_INCOMPLETE: ${key} ${fieldPath} ${name}`);
    return `- **${text(item.name)}:** ${text(item.condition)} Expected from the cited source: ${text(item.sourceOutcome)}`;
  }).join('\n');
  const evidence = receiver.evidence.map(item => {
    const range = item.url?.match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[a-f0-9]{40}\/[^#]+#L([1-9][0-9]*)(?:-L([1-9][0-9]*))?$/u);
    assert(range && Number(range[2] ?? range[1]) >= Number(range[1])
      && typeof item.claim === 'string' && item.claim.trim(),
      `API_REFERENCE_EVIDENCE_INCOMPLETE: ${key} ${fieldPath}`);
    return `- [${text(item.claim)}](${item.url})`;
  }).join('\n');
  const readerReferences = (receiver.readerReferences ?? []).map(item => {
    assert(typeof item.label === 'string' && item.label.trim()
      && /^[a-z0-9-]+\.md#[a-z0-9-]+$/u.test(item.target),
    `API_REFERENCE_READER_LINK_INVALID: ${key} ${fieldPath}`);
    return `- [${text(item.label)}](${item.target})`;
  }).join('\n');
  return `${text(receiver.purpose)}\n\n` +
    `**Receiver:** ${text(receiver.receiver)}\n\n**Operation:** ${text(receiver.operationScope)}\n\n` +
    `**Omitted:** ${text(receiver.omitted)}\n\n**JSON null:** ${text(receiver.nullValue)}\n\n` +
    `**Explicit empty value:** ${text(receiver.emptyValue)}\n\n**Invalid value:** ${text(receiver.invalidValue)}\n\n` +
    `**Change effect:** ${text(receiver.changeImpact)}\n\n` +
    (receiver.crossFieldConditions.length ? `**Related conditions:**\n\n${receiver.crossFieldConditions.map(item => `- ${text(item)}`).join('\n')}\n\n` : '') +
    `**Examples and expected outcomes:**\n\n${cases}\n\n` +
    (receiver.qualificationLimits.length ? `**Scope and limits:**\n\n${receiver.qualificationLimits.map(item => `- ${text(item)}`).join('\n')}\n\n` : '') +
    `**Implementation sources:**\n\n${evidence}\n\n` +
    (readerReferences ? `**Related procedures and explanations:**\n\n${readerReferences}\n\n` : '');
}

export function upstreamApiReference(apiVersion, kind) {
  return apiSchemaUpstreamReference(apiVersion, kind);
}

const metadataAnchor = referenceId => `api-metadata-${createHash('sha256').update(referenceId).digest('hex').slice(0, 20)}`;

export function validateImplicitMetadataReferences(resources, references = []) {
  assert(Array.isArray(references), 'API_REFERENCE_METADATA_INVENTORY_MISSING');
  const expected = productMetadataReferences(resources);
  const seen = new Set();
  for (const reference of references) {
    assert(!seen.has(reference.referenceId), `API_REFERENCE_METADATA_DUPLICATE: ${reference.referenceId}`);
    seen.add(reference.referenceId);
    const authority = expected.find(item => item.referenceId === reference.referenceId);
    assert(authority, `API_REFERENCE_METADATA_EXTRA: ${reference.referenceId}`);
    assert.deepEqual(reference, authority, `API_REFERENCE_METADATA_DRIFT: ${reference.referenceId}`);
  }
  for (const reference of expected) assert(seen.has(reference.referenceId),
    `API_REFERENCE_METADATA_MISSING: ${reference.referenceId}`);
  return expected;
}

export function renderImplicitMetadataReference(reference) {
    const fields = reference.contracts.map(receiver =>
      `#### ${code(receiver.fieldPath)}\n\n` + renderReceiverContract(receiver, reference.referenceId, receiver.fieldPath)).join('\n\n');
    return `<a id="${metadataAnchor(reference.referenceId)}"></a>\n\n` +
      `### Standard metadata for ${text(reference.kind)} (${code(reference.apiVersion)})\n\n` +
      `These standard Kubernetes metadata fields apply to this ${text(reference.scope.toLowerCase())} resource. ` +
      `The custom-resource schema exposes metadata as one object; these fields are described separately from its enumerated schema paths.\n\n${fields}`;
}

export function renderImplicitMetadataReferences(resources, references = []) {
  return validateImplicitMetadataReferences(resources,references).map(renderImplicitMetadataReference).join('\n\n');
}

// Publication must not turn maintenance inventories with missing receivers
// into an apparently complete reference. Compare against the actual authority,
// not only the inventory's claimed totals or missing-path list.
export function renderApiResourceReference(resources, sourceLink, metadataReferences = [], sourceRoot = process.cwd()) {
  assert(Array.isArray(resources) && resources.length,
    'API_REFERENCE_INVENTORY_MISSING');
  if (resources.some(item => item.productSelection)) {
    assert(resources.every(item => item.productSelection), 'API_PRODUCT_MIXED_SCOPE');
    assertProductApiContexts(resources, sourceRoot);
  }
  for (const resource of resources.filter(item => item.productSelection)) {
    const actual = apiProductSelection(resource.apiVersion, resource.kind, resource.sourceContexts,
      productApiReceiverRecords(resource.apiVersion,resource.kind), sourceRoot);
    assert.deepEqual(resource.productSelection, actual, `API_PRODUCT_SELECTION_DRIFT: ${resource.apiVersion}/${resource.kind}`);
  }
  validateImplicitMetadataReferences(resources, metadataReferences);
  const referenceMap = new Map(metadataReferences.map(reference => [reference.referenceId, reference]));
  const seenResources = new Set();
  const resourceSections = resources.map(resource => {
    const key = `${resource.apiVersion}/${resource.kind}`;
    assert(!seenResources.has(key), `API_REFERENCE_RESOURCE_DUPLICATE: ${key}`);
    seenResources.add(key);
    const authority = apiResourceFieldBoundaries(resource.apiVersion, resource.kind)
      .filter(row => !resource.productSelection || resource.productSelection.fieldPaths.includes(row.fieldPath));
    assert(Array.isArray(resource.rows), `API_REFERENCE_ROWS_MISSING: ${key}`);
    const rows = new Map();
    for (const row of resource.rows) {
      assert(!rows.has(row.fieldPath), `API_REFERENCE_PATH_DUPLICATE: ${key} ${row.fieldPath}`);
      rows.set(row.fieldPath, row);
    }
    assert.equal(rows.size, authority.length, `API_REFERENCE_BOUNDARY_COUNT: ${key}`);
    for (const expected of authority) {
      const row = rows.get(expected.fieldPath);
      assert(row, `API_REFERENCE_BOUNDARY_MISSING: ${key} ${expected.fieldPath}`);
      assert.equal(identity(row), identity(expected), `API_REFERENCE_IDENTITY_DRIFT: ${key} ${expected.fieldPath}`);
      assert.equal(row.authoritySha256, expected.authoritySha256,
        `API_REFERENCE_AUTHORITY_DRIFT: ${key} ${expected.fieldPath}`);
      assert.deepEqual(row.contract, expected.contract,
        `API_REFERENCE_SCHEMA_DRIFT: ${key} ${expected.fieldPath}`);
      assert(row.receiverContract, `API_REFERENCE_RECEIVER_MISSING: ${key} ${expected.fieldPath}`);
    }
    assert(Array.isArray(resource.extra) && !resource.extra.length,
      `API_REFERENCE_EXTRA_RECEIVERS: ${key}`);
    const joined = apiReceiverCoverage(resource.apiVersion, resource.kind,
      resource.productSelection ? productApiReceiverRecords(resource.apiVersion,resource.kind,resource.productSelection.fieldPaths) : resource.rows.map(row => row.receiverContract), resource.productSelection ?? null);
    assertApiReceiverCoverage(joined);
    for (const row of joined.rows) assert.deepEqual(rows.get(row.fieldPath).receiverContract,
      row.receiverContract, `API_REFERENCE_RECEIVER_IDENTITY_DRIFT: ${key} ${row.fieldPath}`);
    const sections = authority.map(expected => {
      const row = rows.get(expected.fieldPath);
      const receiver = row.receiverContract;
      let relatedReference = '';
      const descriptor = canonicalMetadataReferences.find(reference => reference.apiVersion === resource.apiVersion && reference.kind === resource.kind);
      if (descriptor && referenceMap.has(descriptor.referenceId) && row.fieldPath === '$.metadata') {
        assert.equal(receiver.canonicalReferenceId, descriptor.referenceId,
          `API_REFERENCE_METADATA_LINK_MISSING: ${key}`);
        assert(referenceMap.has(receiver.canonicalReferenceId), `API_REFERENCE_METADATA_TARGET_MISSING: ${key}`);
        relatedReference = `**Standard metadata fields:** [Create, update, ownership and deletion](#${metadataAnchor(descriptor.referenceId)}).\n\n`;
      }
      return `<a id="${anchor(row)}"></a>\n\n#### ${code(row.fieldPath)}\n\n` +
        (resource.productSelection ? `**Applicability:** ${text(JSON.stringify(resource.productSelection.applicability[row.fieldPath]))}\n\n` : '') +
        relatedReference + renderReceiverContract(receiver, key, row.fieldPath) +
        `<details>\n<summary>Pinned API schema constraints</summary>\n\n` +
        `Authority: ${text(row.authority)}. Content SHA-256: ${code(row.authoritySha256)}.\n\n` +
        (resource.productSelection && !isProductOwnedApi(resource.apiVersion,resource.kind) ? `[General field definitions and unused alternatives](${upstreamApiReference(resource.apiVersion, resource.kind)}).\n\n</details>` : `<pre><code>${text(JSON.stringify(row.contract, null, 2)).replaceAll('<br>', '\n')}</code></pre>\n\n</details>`);
    }).join('\n\n');
    const unsupported=(resource.productSelection?.authoredUnknownFields??[]).map(field=>{
      assert.equal(field.schemaAuthority,null,`API_REFERENCE_UNKNOWN_SCHEMA_FABRICATED: ${key} ${field.fieldPath}`);
      assert.equal(field.authorityRole,'authored-outside-served-schema',`API_REFERENCE_UNKNOWN_AUTHORITY_DRIFT: ${key} ${field.fieldPath}`);
      const gap=field.receiverContract.implementationGap;
      for(const name of ['owner','blockedStep','safeStop','acceptanceCondition'])assert(typeof gap?.[name]==='string'&&gap[name].trim(),`API_REFERENCE_UNKNOWN_IMPLEMENTATION_BOUNDARY_MISSING: ${key} ${field.fieldPath} ${name}`);
      return `<a id="${anchor({apiVersion:resource.apiVersion,kind:resource.kind,fieldPath:field.fieldPath})}"></a>\n\n#### ${code(field.fieldPath)} — unsupported authored input\n\n`+
        'This producer authors the field outside the declared served schema. It has no served schema property or controller capability contract.\n\n'+
        `**Authored value:** ${code(JSON.stringify(field.authoredValue))}.\n\n`+renderReceiverContract(field.receiverContract,key,field.fieldPath)+
        `\n\n**Unavailable operation:** ${text(gap.blockedStep)}. **Owner:** ${text(gap.owner)}.\n\n${text(gap.safeStop)}\n\n**Condition for support:** ${text(gap.acceptanceCondition)}\n\n`+
        '[Prism lease admission and recovery](../use/prism-studio.md#prism-test-lease-admission-and-recovery).';
    }).join('\n\n');
    const upstream = upstreamApiReference(resource.apiVersion, resource.kind);
    const authorityLink=!/^https?:\/\//u.test(upstream)?sourceLink(upstream,1):`[Pinned upstream schema or chart CRD authority](${upstream})`;
    const contexts = (resource.sourceContexts ?? []).map(context =>
      `- ${sourceLink(context.path, 1)}; YAML document ${text(context.document)}.`).join('\n');
    return `### ${text(resource.kind)} (${code(resource.apiVersion)})\n\n` +
      (resource.productSelection ? `These fields describe checked-in resource choices and relevant omissions under present objects. General upstream alternatives remain available through the pinned schema authority shown for each field. Cluster applicability: ${text(resource.productSelection.limits.join(' '))} ` : `These fields cover the full pinned API schema, including options absent from the checked-in manifests. `) +
      `Expected outcomes below come from implementation sources. They do not report a live API request or deployment test.\n\n` +
      `${authorityLink}.\n\n` +
      `Checked-in resource inputs:\n\n${contexts}\n\n${sections}${unsupported?`\n\n${unsupported}`:''}`;
  }).join('\n\n');
  return [resourceSections, renderImplicitMetadataReferences(resources, metadataReferences)].filter(Boolean).join('\n\n');
}
