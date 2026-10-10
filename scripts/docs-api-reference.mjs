import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { apiResourceFieldBoundaries } from './docs-api-schema-authorities.mjs';
import { apiReceiverCoverage, assertApiReceiverCoverage } from './docs-api-receiver-coverage.mjs';

const text = value => String(value).replace(/[&<>"'\\`\[\]*_|~]/gu,
  character => `&#${character.codePointAt(0)};`).replaceAll('\n', '<br>');
const code = value => `<code>${text(value)}</code>`;
const identity = row => JSON.stringify([row.apiVersion, row.kind, row.fieldPath]);
const anchor = row => `api-field-${createHash('sha256').update(identity(row)).digest('hex').slice(0, 20)}`;

// Publication must not turn maintenance inventories with missing receivers
// into an apparently complete reference. Compare against the actual authority,
// not only the inventory's claimed totals or missing-path list.
export function renderApiResourceReference(resources, sourceLink) {
  assert(Array.isArray(resources) && resources.length,
    'API_REFERENCE_INVENTORY_MISSING');
  const seenResources = new Set();
  return resources.map(resource => {
    const key = `${resource.apiVersion}/${resource.kind}`;
    assert(!seenResources.has(key), `API_REFERENCE_RESOURCE_DUPLICATE: ${key}`);
    seenResources.add(key);
    const authority = apiResourceFieldBoundaries(resource.apiVersion, resource.kind);
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
      resource.rows.map(row => row.receiverContract));
    assertApiReceiverCoverage(joined);
    for (const row of joined.rows) assert.deepEqual(rows.get(row.fieldPath).receiverContract,
      row.receiverContract, `API_REFERENCE_RECEIVER_IDENTITY_DRIFT: ${key} ${row.fieldPath}`);
    const sections = authority.map(expected => {
      const row = rows.get(expected.fieldPath);
      const receiver = row.receiverContract;
      const prose = [receiver.purpose, receiver.receiver, receiver.operationScope,
        receiver.omitted, receiver.nullValue, receiver.emptyValue, receiver.invalidValue,
        receiver.changeImpact, ...(receiver.crossFieldConditions ?? []),
        ...(receiver.qualificationLimits ?? []), ...(receiver.cases ?? []).flatMap(item =>
          [item.name, item.condition, item.sourceOutcome]),
        ...(receiver.evidence ?? []).map(item => item.claim)];
      // Explicit authoring obligations belong in internal evidence, never in
      // the product reference. Real product limits remain publishable prose.
      assert(!prose.some(value => /OPEN DOCUMENTATION PROOF|Available-source documentation gap|unclosed source-proof obligation/iu.test(String(value))),
        `API_REFERENCE_UNRESOLVED_PROOF: ${key} ${row.fieldPath}`);
      for (const name of ['purpose', 'receiver', 'operationScope', 'omitted', 'nullValue', 'emptyValue', 'invalidValue', 'changeImpact']) {
        assert(typeof receiver[name] === 'string' && receiver[name].trim(),
          `API_REFERENCE_RECEIVER_INCOMPLETE: ${key} ${row.fieldPath} ${name}`);
      }
      for (const name of ['crossFieldConditions', 'cases', 'evidence', 'qualificationLimits']) {
        assert(Array.isArray(receiver[name]), `API_REFERENCE_RECEIVER_INCOMPLETE: ${key} ${row.fieldPath} ${name}`);
      }
      assert(receiver.cases.length && receiver.evidence.length,
        `API_REFERENCE_RECEIVER_INCOMPLETE: ${key} ${row.fieldPath} cases/evidence`);
      const cases = receiver.cases.map(item => {
        for (const name of ['name', 'condition', 'sourceOutcome']) assert(typeof item[name] === 'string' && item[name].trim(),
          `API_REFERENCE_CASE_INCOMPLETE: ${key} ${row.fieldPath} ${name}`);
        return `- **${text(item.name)}:** ${text(item.condition)} Expected from the cited source: ${text(item.sourceOutcome)}`;
      }).join('\n');
      const evidence = receiver.evidence.map(item => {
        const range = item.url?.match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[a-f0-9]{40}\/[^#]+#L([1-9][0-9]*)(?:-L([1-9][0-9]*))?$/u);
        assert(range && Number(range[2] ?? range[1]) >= Number(range[1])
          && typeof item.claim === 'string' && item.claim.trim(),
          `API_REFERENCE_EVIDENCE_INCOMPLETE: ${key} ${row.fieldPath}`);
        return `- [${text(item.claim)}](${item.url})`;
      }).join('\n');
      return `<a id="${anchor(row)}"></a>\n\n#### ${code(row.fieldPath)}\n\n${text(receiver.purpose)}\n\n` +
        `**Receiver:** ${text(receiver.receiver)}\n\n**Operation:** ${text(receiver.operationScope)}\n\n` +
        `**Omitted:** ${text(receiver.omitted)}\n\n**JSON null:** ${text(receiver.nullValue)}\n\n` +
        `**Explicit empty value:** ${text(receiver.emptyValue)}\n\n**Invalid value:** ${text(receiver.invalidValue)}\n\n` +
        `**Change effect:** ${text(receiver.changeImpact)}\n\n` +
        (receiver.crossFieldConditions.length ? `**Related conditions:**\n\n${receiver.crossFieldConditions.map(item => `- ${text(item)}`).join('\n')}\n\n` : '') +
        `**Examples and expected outcomes:**\n\n${cases}\n\n` +
        (receiver.qualificationLimits.length ? `**Scope and limits:**\n\n${receiver.qualificationLimits.map(item => `- ${text(item)}`).join('\n')}\n\n` : '') +
        `**Implementation sources:**\n\n${evidence}\n\n` +
        `<details>\n<summary>Pinned API schema constraints</summary>\n\n` +
        `Authority: ${text(row.authority)}. Content SHA-256: ${code(row.authoritySha256)}.\n\n` +
        `<pre><code>${text(JSON.stringify(row.contract, null, 2)).replaceAll('<br>', '\n')}</code></pre>\n\n</details>`;
    }).join('\n\n');
    const contexts = (resource.sourceContexts ?? []).map(context =>
      `- ${sourceLink(context.path, 1)}; YAML document ${text(context.document)}.`).join('\n');
    return `### ${text(resource.kind)} (${code(resource.apiVersion)})\n\n` +
      `These fields cover the full pinned API schema, including options absent from the checked-in manifests. ` +
      `Expected outcomes below come from implementation sources. They do not report a live API request or deployment test.\n\n` +
      `Checked-in resource inputs:\n\n${contexts}\n\n${sections}`;
  }).join('\n\n');
}
