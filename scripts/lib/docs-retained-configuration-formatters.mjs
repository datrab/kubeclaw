// Extracted verbatim from verified 6fa source; acquisition supplied by callers.
function environmentSourceProse(value) {
  return value.replace(/(?<![`A-Za-z0-9_/])((?:\.github|charts|my-values|skills|scripts|docker|ops|tools|cmd|packaging|gitops|releases)\/(?:[A-Za-z0-9_./-]+\.(?:json|ya?ml|m?[jt]s|cjs|cts|tsx?|sh|py|go)|(?:[A-Za-z0-9_.-]+\/)*Dockerfile(?:\.[A-Za-z0-9_-]+)?))(?::(?:(\d+):)?|#)?/gu,
    (match, sourcePath, line) => {
      const qualifier = match.slice(sourcePath.length);
      return `\`${sourcePath}\`${line ? ` at line ${line}` : ''}${qualifier ? ' — ' : ''}`;
    });
}

export function environmentConsumerPurpose(contract, producer = null) {
  return `${environmentSourceProse(contract.purpose)} Owner: ${environmentSourceProse(contract.owner)}. Owning setting: ${environmentSourceProse(contract.owningSurface).replace(/\.$/u, '')}.${producer ? ` Producer binding: ${producer.setting}.` : ''} Boundary: ${contract.boundary}.`;
}

export function versionedApiSchemaContract(schema) {
  const constraints = [`type \`${schema.type ?? 'schema-defined'}\``];
  if (schema.enum?.length) constraints.push(`one of ${schema.enum.map((value) => `\`${String(value)}\``).join(', ')}`);
  if (schema.format) constraints.push(`format \`${schema.format}\``);
  if (schema.minimum !== null && schema.minimum !== undefined) constraints.push(`minimum ${schema.minimum}`);
  if (schema.maximum !== null && schema.maximum !== undefined) constraints.push(`maximum ${schema.maximum}`);
  const acceptedValues = `The pinned authority (${schema.authority}) defines ${constraints.join('; ')} for the exact field \`${schema.resolvedPath}\`.`;
  const defaultBehavior = schema.default === '<no schema default>'
    ? 'The exact field schema defines no default.'
    : `The exact field schema default is \`${JSON.stringify(schema.default)}\`.`;
  const omissionBehavior = schema.requiredBySchema
    ? 'When its enclosing object is declared, the parent schema requires this field; omission then fails schema validation.'
    : `The parent schema permits omission. ${defaultBehavior}`;
  const emptyBehavior = schema.nullable
    ? 'The exact schema permits null. Any other empty value must satisfy the same type, enum, format, and range constraints.'
    : 'The schema supplies no nullable marker. This does not establish how the selected API decoder or apply operation handles null. An empty string, list, or object is an authored value and must satisfy the type, enum, format, range, and parent constraints.';
  return { acceptedValues, defaultBehavior, omissionBehavior, emptyBehavior };
}

export function formatLocalHelmMeaning({context,authority,semantics}) {
  return {
    status: authority.externalChart ? (authority.collectionOnly ? 'external-chart-collection-authority' : 'external-chart-authority') : authority.chartRoot ? 'local-helm-field-authority' : 'implementation-authority',
    text: `${authority.purpose} Accepted values: ${authority.acceptedValues} ${context.sourceClass === 'helm-values'
      ? 'Selected chart default: the checked-in value in this row is the chart default.'
      : context.sourceClass === 'helm-example'
        ? 'Selected example value: the checked-in value in this row is an example selection, not a chart default.'
        : 'Selected overlay value: the checked-in value in this row is an overlay selection, not a chart default.'} Empty or omitted value: ${authority.emptyBehavior}`,
    evidence: authority.externalChart
      ? `${context.sourcePath}:${context.fieldLine}; scripts/docs-yaml-field-authorities.mjs; ${authority.externalChart.chart}@${authority.externalChart.version}; archive sha256:${authority.externalChart.archiveSha256}`
      : authority.chartRoot
        ? `${context.sourcePath}:${context.fieldLine}; ${semantics.consumers.map((consumer) => `${consumer.path}:${consumer.line}`).join('; ')}; scripts/docs-local-helm-field-authorities.json`
        : `${context.sourcePath}:${context.fieldLine}; scripts/docs-yaml-field-authorities.mjs`,
    acceptedValues: authority.acceptedValues,
    emptyBehavior: authority.emptyBehavior,
    sourceFileSha256: authority.sourceFileSha256,
    externalChart: authority.externalChart ?? null,
    localHelmChart: authority.chartRoot ?? null,
    upstreamTemplateProof: authority.upstreamTemplateProof ?? null,
    semanticGroup: authority.group ?? null,
    semanticAuthorityEvidence: authority.semanticAuthorityEvidence,
    semanticContractEvidence: authority.semanticContractEvidence,
    semanticContractBinding: authority.semanticContractBinding ?? null,
    blockerOwner: null,
    closureCondition: null,
  };

}
export function formatApiOperationalMeaning({context,semantics,contract,schemaContract,schemaAuthority,collectionSchema,sha256,read}) {
    const rendererText = semantics.defaultKind === 'renderer-overwritten-template'
      ? ` Selected deployment input: this authored value is a template placeholder, not the effective capacity or StorageClass. The validated JSON selected by KUBECLAW_LAB_REGISTRY_STORAGE_CONFIG overwrites this exact leaf in render-registry-local.mjs before deploy.sh applies the rendered output. The JSON must be an object with only capacity and storageClassName: capacity is a positive integer followed by Mi, Gi or Ti; storageClassName is nonempty, at most 253 characters, contains only lowercase letters, digits, dots and hyphens, and starts and ends with a letter or digit. Empty or invalid selected JSON fails with REGISTRY_STORAGE_CONFIG_INVALID before apply; a conflicting existing PVC fails with REGISTRY_EXISTING_STORAGE_MISMATCH. The API contract below applies to the rendered value.`
      : semantics.defaultKind === 'renderer-selected-replicas'
        ? ` Selected deployment input: render-registry-local.mjs overwrites this template replica count with one for serve mode, which deploy.sh explicitly selects. Its gc-dry-run and gc modes instead set replicas to zero and add a maintenance Job after validating the existing Deployment/PVC. Those modes also replace the Job arguments and remove its ports and health probes. The mode is validated before rendering; an authored template count is not the winner.`
        : semantics.defaultKind === 'post-apply-overwritten-template'
        ? ` Selected deployment input: after applying the rendered Service, deploy.sh replaces the complete ports list with a merge patch containing name=http, port=4000, targetPort=4000, protocol=TCP and nodePort from LITELLM_NODE_PORT. A nonempty process input supplies that value; omission or an empty string selects 30050. Before render/apply the script checks numeric input and its 30000–32767 bounds. The patch must also satisfy the target API server allocation range and conflicts. A patch failure can leave the earlier applied Service; stop and inspect it rather than claiming the configured NodePort took effect.`
        : '';
    const collectionText = collectionSchema
      ? ` The linked API collection contract includes the exact field, child, item and parent descriptions, constraints and alternatives. Those descriptions can define API defaults absent from the schema default keyword. Null acceptance and deletion also depend on the receiving operation; absence of nullable does not prove that API decoding rejects every null.`
      : '';
    return {
      status: contract.status,
      text: `${contract.purpose}${rendererText} Accepted values: ${schemaContract.acceptedValues} Operational constraint: ${contract.acceptedValues} Default: ${schemaContract.defaultBehavior} Omission: ${schemaContract.omissionBehavior} ${collectionSchema ? 'Collection result' : `Empty value: ${schemaContract.emptyBehavior} Operational result after omission or an empty value`}: ${contract.emptyBehavior}${collectionText}`,
      evidence: `${context.sourcePath}:${context.fieldLine ?? 1}; ${schemaAuthority.authority}; sha256:${schemaAuthority.authoritySha256}`,
      acceptedValues: `${schemaContract.acceptedValues} ${contract.acceptedValues}`,
      defaultBehavior: schemaContract.defaultBehavior,
      omissionBehavior: schemaContract.omissionBehavior,
      emptyBehavior: `${collectionSchema ? '' : `${schemaContract.emptyBehavior} `}${contract.emptyBehavior}`,
      apiAuthority: `${schemaAuthority.authority}; ${contract.apiAuthority}`,
      apiSchemaAuthority: schemaAuthority,
      ...(collectionSchema ? { apiCollectionAuthority: collectionSchema, collectionGroup: contract.collectionGroup, qualification: contract.qualification } : {}),
      sourceLine: context.fieldLine ?? 1,
      sourceLineSha256: sha256(read(context.sourcePath).split('\n')[(context.fieldLine ?? 1) - 1] ?? ''),
      blockerOwner: contract.blockerOwner ?? null,
      closureCondition: contract.closureCondition ?? null,
    };
}

// Genuine historical aggregate algorithm. Caller supplies resolved meaning; no resolution happens here.
export function formatEnvironmentAggregate(retainedEntry, meaning) {
 const entry=structuredClone(retainedEntry);
    const distinctConsumerContracts = new Set(entry.consumerContracts.map((contract) => JSON.stringify({
      acceptedForm: contract.acceptedForm,
      defaultBehavior: contract.defaultBehavior,
      emptyBehavior: contract.emptyBehavior,
      invalidBehavior: contract.invalidBehavior,
      required: contract.required,
      purpose: contract.purpose,
      failure: contract.failure,
    })));
    if (distinctConsumerContracts.size > 1) {
      entry.meaningStatus = 'authored-consumer-specific-contracts';
      entry.meaning = `The meaning of ${entry.name} differs by receiving process. Use the contract attached to the exact consumer source.`;
      entry.meaningEvidence = `${entry.consumerContracts[0].path}:${entry.consumerContracts[0].line}`;
      entry.acceptedForm = 'Varies by receiving process; see the consumer-specific contracts.';
      entry.required = 'varies by receiving process';
      entry.defaultBehavior = 'Varies by receiving process; no merged default is valid.';
      entry.emptyBehavior = 'Varies by receiving process; an empty string can be rejected, retained, or converted to a value.';
      entry.invalidBehavior = 'Varies by receiving process; use the exact reader validation below.';
      entry.precedenceExplanation = 'Each receiving process captures and interprets its own environment. No consumer contract overrides another consumer.';
      entry.changeImpact = 'Changes only the processes that receive the variable, according to each listed consumer contract.';
      entry.failureMeaning = 'Use the exact consumer failure below; a single merged symptom would be incorrect.';
      entry.blockerOwner = null;
      entry.closureCondition = null;
    } else if (entry.consumerContracts.length >= 1 && !meaning.contract
      && entry.unqualifiedReaders.length === 0 && entry.unqualifiedProducers.length === 0) {
      const [contract] = entry.consumerContracts;
      entry.meaningStatus = 'authored-consumer-specific-contract';
      entry.meaning = contract.purpose;
      entry.meaningEvidence = `${contract.path}:${contract.line}`;
      entry.acceptedForm = contract.acceptedForm;
      entry.required = contract.required;
      entry.defaultBehavior = contract.defaultBehavior;
      entry.emptyBehavior = contract.emptyBehavior;
      entry.invalidBehavior = contract.invalidBehavior;
      entry.precedenceExplanation = contract.precedence;
      entry.changeImpact = contract.impact;
      entry.failureMeaning = contract.failure;
      if (contract.precedenceSteps) entry.precedence = contract.precedenceSteps;
      entry.blockerOwner = null;
      entry.closureCondition = null;
    }
    if (entry.unqualifiedReaders.length || entry.unqualifiedProducers.length) {
      entry.meaningStatus = 'environment-consumer-contract-blocker';
      entry.meaning = `The receiving-source contract is missing for ${[...entry.unqualifiedReaders, ...entry.unqualifiedProducers].map((item) => `${entry.name} at ${item.path}:${item.line}`).join('; ')}.`;
      entry.blockerOwner = entry.runtimeOwner;
      entry.closureCondition = 'Add an exact source-backed reader or external boundary contract, including its owning configuration, default, empty and invalid behavior, required condition, precedence, change effect and failure.';
    }

 return entry;
}
