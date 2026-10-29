import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pluginSourceClosure, pluginInvocationFacts, pluginCapabilityRoutes } from './plugin-source-closure.mjs';
import { dependencySchemaFacts } from './plugin-schema-dependencies.mjs';
import { invocationDependencyBoundaries } from './plugin-dependency-boundaries.mjs';
import { markdownInlineLinks, stripMarkdownCodeAndRawHtml } from './lib/docs-markdown-anchors.mjs';

export function markdownInlineCode(value) {
  const text = String(value);
  const longest = Math.max(0, ...[...text.matchAll(/`+/gu)].map((match) => match[0].length));
  const delimiter = '`'.repeat(longest + 1);
  const padding = /^[` ]|[` ]$/u.test(text) ? ' ' : '';
  return `${delimiter}${padding}${text}${padding}${delimiter}`;
}

export function schemaConstraint(name, value) {
  return markdownInlineCode(`${name}=${JSON.stringify(value)}`);
}

export function schemaConditions(conditions) {
  return conditions.map(markdownInlineCode).join(' and ');
}

export function schemaSemanticText(field) {
  const text = field.meaning?.text ?? '';
  const fallback = field.meaning?.runtimeDefault;
  const fallbackLiteral = fallback !== null && typeof fallback === 'object' ? JSON.stringify(fallback) : null;
  const defaultBehavior = field.meaning?.defaultBehavior;
  const fallbackPrefix = 'the linked runtime uses ';
  const fallbackContext = fallbackLiteral && field.meaning?.runtimeDefaultEvidence
    ? `${fallbackPrefix}${fallbackLiteral} (${field.meaning.runtimeDefaultEvidence})` : null;
  const omissionStart = typeof defaultBehavior === 'string' ? text.indexOf(`Omission: ${defaultBehavior}`) : -1;
  const contextStart = fallbackContext && typeof defaultBehavior === 'string' ? defaultBehavior.indexOf(fallbackContext) : -1;
  const fallbackStart = omissionStart >= 0 && contextStart >= 0
    ? omissionStart + 'Omission: '.length + contextStart + fallbackPrefix.length : -1;
  const visible = stripMarkdownCodeAndRawHtml(text);
  const links = markdownInlineLinks(text);
  const values = [...new Set([
    field.meaning?.acceptedValues,
    field.path,
    ...(field.meaning?.failureMeaning?.includes('<targetId>') ? ['<targetId>'] : []),
    ...(field.constraints ?? []).map(({ name, value }) => `${name}=${JSON.stringify(value)}`),
  ].filter(Boolean))].sort((a, b) => b.length - a.length);
  let result = '';
  for (let cursor = 0; cursor < text.length;) {
    const insideLink = links.find((link) => cursor >= link.start && cursor < link.end);
    const ownedFallback = cursor === fallbackStart && visible.startsWith(fallbackLiteral, cursor)
      && (!insideLink || (insideLink.start === cursor
        && insideLink.raw === `${fallbackLiteral} (${field.meaning.runtimeDefaultEvidence})`));
    const value = ownedFallback ? fallbackLiteral : !insideLink && values.find((candidate) => visible.startsWith(candidate, cursor));
    if (value) { result += markdownInlineCode(value); cursor += value.length; }
    else result += text[cursor++];
  }
  return result;
}

// One immutable acquisition per caller-owned candidate. Recreate this collector
// after any source/configuration/plugin mutation; cached facts are not live data.
// Source link callbacks must enforce the caller's pinned sourceRevision policy.
export function createRegistrationDependencyCollector({
  root, plugins, configurationSemantics, sourceRevision, sourceBase,
  sourceEvidenceLink, sourceLink,
}) {
  if (!path.isAbsolute(root)) throw new Error('Dependency root must be absolute');
  if (!/^[0-9a-f]{40}$/u.test(sourceRevision)) throw new Error('Dependency sourceRevision must be a full Git commit SHA');
  if (!sourceBase.endsWith(`/blob/${sourceRevision}`)) throw new Error('Dependency sourceBase must pin sourceRevision');
  if (!Array.isArray(plugins) || !Array.isArray(configurationSemantics?.files)) throw new Error('Dependency collector requires explicit plugins and configuration semantics');
  if (typeof sourceEvidenceLink !== 'function' || typeof sourceLink !== 'function') throw new Error('Dependency collector requires pinned source link authorities');
  const rel = (target) => path.relative(root, target).split(path.sep).join('/');
  const readJson = (target) => JSON.parse(fs.readFileSync(target, 'utf8'));
function registrationSchemaFacts(plugin, registration) {
  const target = registration.configSchema ? path.join(plugin.directory, registration.configSchema) : plugin.file;
  const schema = registration.configSchemaObject ?? (registration.configSchema && fs.existsSync(target) ? readJson(target) : undefined);
  if (registration.configSchema && !schema) return { fields: [], predicates: [], diagnostics: [`Missing registration schema ${rel(target)}`] };
  return schema ? dependencySchemaFacts(schema, target) : { fields: [], predicates: [], diagnostics: [] };
}

const dependencyAnalysisCache = new Map();
const dependencyAuthorityCache = new Map();
const busterDependencyRoutes = pluginCapabilityRoutes(path.join(root, 'skills/buster/engine/test-gates/remote-plan-service.ts'), root);
function registrationDependencyFacts(plugin, registration) {
  const key = `${plugin.file}:${registration.id}`;
  if (dependencyAnalysisCache.has(key)) return dependencyAnalysisCache.get(key);
  const schema = registrationSchemaFacts(plugin, registration);
  const fieldWords = (field) => field.replace(/([a-z0-9])([A-Z])/gu, '$1.$2').toLowerCase().split(/[^a-z0-9]+/u);
  const operationSchema = registration.configSchema ? rel(path.join(plugin.directory, registration.configSchema)) : '';
  // These fields govern the admitted target, baseline custody, comparison
  // verdict or exposure lifetime; name-only endpoint heuristics omit them.
  const operationFields = new Set(operationSchema === 'skills/buster/plugins/visual/schemas/config.schema.json'
    ? ['manifestFile', 'profileFile', 'comparisonProfile', 'overrides', 'masks', 'timeoutMs']
    : operationSchema === 'skills/buster/plugins/tailscale-exposure/schemas/config.schema.json'
      ? ['retentionMode', 'hostname', 'path', 'readinessTimeoutSeconds'] : []);
  const directOperationControls = {
    'skills/nova/plugins/prism-design/schemas/config.schema.json': ['issuerId', 'timeoutMinutes'],
    'skills/nova/plugins/review/schemas/config.schema.json': ['profile'],
    'skills/nova/plugins/review/schemas/repository-audit-config.schema.json': ['profile', 'reviewerModel', 'reviewerRuntime', 'reviewerThinking'],
  };
  for (const field of directOperationControls[operationSchema] ?? []) {
    if (registration.id === 'repository-revalidation' && field === 'profile') continue;
    operationFields.add(field);
  }
  const durableSchemaControls = {
    'skills/common/plugins/artifact-store/schemas/config.schema.json': ['artifactRoot', 'maxArtifactBytes', 'maximumRecords', 'maximumStoreBytes'],
    'skills/common/plugins/state-store/schemas/config.schema.json': ['root', 'maxEntryBytes', 'maximumRecords', 'maximumStoreBytes'],
    'skills/common/plugins/telemetry-store/schemas/config.schema.json': ['root', 'maxRecordBytes', 'maximumRecords', 'maximumStoreBytes'],
    'skills/common/plugins/wait-store/schemas/config.schema.json': ['root', 'maxEntryBytes', 'maximumRecords', 'maximumStoreBytes'],
    'skills/common/plugins/transport-publisher/schemas/config.schema.json': ['deliveryRoot', 'maximumDeliveryRecords', 'maximumDeliveryBytes'],
  };
  for (const field of durableSchemaControls[operationSchema] ?? []) operationFields.add(field);
  const endpoints = schema.fields.filter((field) => operationFields.has(field.path.split('.')[0].split('[')[0])
    || fieldWords(field.path).some((word) => ['endpoint', 'url', 'origin', 'origins', 'host', 'hosts', 'ports', 'port', 'address', 'agent', 'target', 'targets'].includes(word)));
  const sensitiveHints = new Set(Object.entries(plugin.manifest.uiHints ?? {}).filter(([, hint]) => hint.sensitive).map(([field]) => field));
  const loginMapping = (field) => registration.configSchema
    && rel(path.join(plugin.directory, registration.configSchema)) === 'skills/buster/plugins/demo-auth-smoke/schemas/config.schema.json'
    && ['usernameKey', 'passwordKey'].includes(field.path);
  const secrets = schema.fields.filter((field) => !loginMapping(field) && (field.constraints.writeOnly || sensitiveHints.has(field.path)
    || fieldWords(field.path).some((word) => ['secret', 'secrets', 'token', 'password', 'credential', 'credentials'].includes(word))
    || /(?:apiKey|caPath|certPath|keyPath)$/u.test(field.path)));
  const required = [...new Set(registration.requiredCapabilities ?? [])].sort();
  const provided = [...new Set(registration.providesCapabilities ?? [])].sort();
  const modulePath = registration.module ? path.join(plugin.directory, registration.module) : null;
  const moduleIsFile = modulePath && fs.existsSync(modulePath) && fs.statSync(modulePath).isFile();
  const closure = pluginSourceClosure(moduleIsFile ? modulePath : null, root);
  const invocation = pluginInvocationFacts(closure, registration.export);
  const routes = registration.kind === 'test provider' ? busterDependencyRoutes : [];
  const boundary = invocationDependencyBoundaries(invocation, root, { ...registration, manifestFile: rel(plugin.file), routes });
  const implementation = [...invocation.selectedSources.values()].join('\n');
  const evidenceLink = sourceEvidenceLink;
  const evidence = [...new Set(invocation.evidence.map(evidenceLink))].join(', ')
    || (moduleIsFile ? sourceLink(`${registration.export ?? 'Host entrypoint'} in ${rel(modulePath)}`, modulePath) : sourceLink('Host manifest', plugin.file));
  const called = [...new Set(invocation.evidence.filter((item) => item.kind === 'capability').map((item) => item.name))].sort();
  const direct = [...new Set(invocation.evidence.filter((item) => ['client', 'client-owner'].includes(item.kind)).map((item) => item.name))].sort();
  const roles = plugin.mechanical?.includedRoles ?? [];
  const namespace = plugin.openclaw ? 'OpenClaw host activation and tool configuration'
    : plugin.codex ? 'Codex host MCP connection'
      : ['test provider', 'report adapter'].includes(registration.kind) ? 'Buster resolved-plan runtime routes'
        : roles.length === 1 && roles[0] === 'nova' ? 'Nova platform grants and adapter selection'
          : 'selected pipeline runtime capability binding';
  // A capability identifies an authority boundary. It does not identify the
  // configured provider instance or prove that its remote target is reachable.
  const delegated = called; // Artifact, state, credential and evidence calls are real dependency boundaries too.
  const providerEvidence = delegated.map((name) => {
    const route = registration.kind === 'test provider' ? busterDependencyRoutes.find((item) => item.capability === name) : undefined;
    if (route) return `\`${name}\`: ${evidenceLink(route)} binds \`${route.constructor ?? route.variable}\` from ${route.providerFiles.map((target) => sourceLink(rel(target), target)).join(', ')}; runtime configuration selector \`${route.selector}\` must be supplied and allowed by Buster. This is client ownership; verify the configured instance separately`;
    const candidates = plugins.flatMap((provider) => provider.registrations.filter((item) => (item.providesCapabilities ?? []).includes(name)).map((item) =>
      `[${provider.manifest.id}:${item.id}](${sourceBase}/${rel(provider.file)})`));
    return `\`${name}\`: ${candidates.length ? `source-linked provider candidates ${candidates.join(', ')}` : 'route implementation belongs to the host runtime'}; ${namespace} selects the actual binding`;
  });
  const diagnostics = [...schema.diagnostics, ...boundary.diagnostics];
  const boundaryEvidence = (item) => item.evidence.map(evidenceLink).join(', ');
  const service = direct.length || delegated.length || boundary.records.some((item) => ['remote-command', 'selected-program', 'host-tools', 'runtime-client'].includes(item.scope));
  const noExternalProof = moduleIsFile && !service && !diagnostics.length && !endpoints.length && !secrets.length;
  const serviceText = [
    ...boundary.records.map((item) => `${item.service} ${boundaryEvidence(item)}.`),
    direct.length ? `Client calls or client owners loaded by the invocation: ${direct.map((name) => `\`${name}\``).join(', ')}. ${evidence}.` : '',
    providerEvidence.length ? `Delegated operations: ${providerEvidence.join('<br>')}. Call authority: ${evidence}.` : '',
    !service && called.length ? `Invokes ${called.map((name) => `\`${name}\``).join(', ')} through ${namespace}. ${evidence}.` : '',
    noExternalProof ? `No direct remote call in the resolved invocation of \`${registration.export ?? 'host entrypoint'}\`; its artifact, verified local store, and host capability consumers retain their own authority. ${evidence}.` : '',
    diagnostics.length ? `Dependency documentation blocked: ${diagnostics.map((item) => item.replaceAll(root + path.sep, '')).join('; ')}. Owner: \`${rel(plugin.file)}\`. The maintainer must qualify these invocation authorities before publishing a complete dependency claim.` : '',
    !service && !noExternalProof && !diagnostics.length ? `Configuration declares endpoint or credential authority; the linked invocation owns whether the selected configuration uses it. ${evidence}.` : '',
  ].filter(Boolean).join('<br>');
  const environmentBindings = [...implementation.matchAll(/configuredValue\(config,\s*env,\s*['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/gu)].map((match) => ({ field: match[1], environment: match[2] }));
  const configFile = configurationSemantics.files.find((item) => item.path === (registration.configSchema ? rel(path.join(plugin.directory, registration.configSchema)) : `${rel(plugin.file)}#$.configSchema`));
  const semanticPath = (field) => `$.${field.replaceAll('{key}', '.{*}').replace(/\{key matches ("(?:\\.|[^"\\])*")\}/gu, (_all, pattern) => `.{pattern:${JSON.parse(pattern)}}`)}`;
  function renderField(field) {
    const constraint = Object.entries(field.constraints).filter(([name]) => !['description', 'default'].includes(name)).map(([name, value]) => schemaConstraint(name, value)).join('; ');
    const binding = environmentBindings.find((item) => item.field === field.path);
    const semantics = configFile?.fields?.filter((item) => item.path === semanticPath(field.path)) ?? [];
    let authority = [...new Set(semantics.map(schemaSemanticText).filter(Boolean))].join(' ');
    if (operationSchema === 'skills/nova/plugins/review/schemas/repository-audit-config.schema.json'
      && registration.id === 'repository-revalidation'
      && ['agent', 'reviewerModel', 'reviewerAgentId', 'reviewerThinking', 'reviewerRuntime'].includes(field.path)) {
      const selectedPath = 'skills/nova/plugins/review/src/repository-revalidation-stage.ts';
      const selected = invocation.selectedSources.get(path.join(root, selectedPath));
      if (!selected?.includes('function runtimeIdentity(') || !selected.includes("model: text(config.reviewerModel, 'config.reviewerModel')")) {
        throw new Error('Revalidation runtime identity consumer changed; renew its field authority before publication');
      }
      const settings = {
        agent: ['Selects the revalidation dispatch target', 'Required with no consumer fallback.'],
        reviewerModel: ['Selects the expected revalidation runtime model identity, not an audit cache-key operation', 'Required with no consumer fallback.'],
        reviewerAgentId: ['Selects the expected revalidation agent identity', 'Omission selects codex.'],
        reviewerThinking: ['Selects the expected revalidation reasoning identity', 'Omission selects high.'],
        reviewerRuntime: ['Selects the expected revalidation runtime identity', 'Omission selects subagent; the schema admits acp or subagent.'],
      }[field.path];
      authority = `${settings[0]}. Omission: ${settings[1]} ${field.path === 'reviewerRuntime'
        ? 'The declared runtime enum is a schema constraint; runtimeIdentity casts this setting and the returned runtime attestation must match.'
        : 'When present, runtimeIdentity requires nonempty already-trimmed text of at most 1024 characters; empty or surrounding whitespace rejects rather than being trimmed.'} The selected repository-revalidation stage constructs and dispatches its own finding requests and validates runtime attestation; invalid text is a RepositoryRevalidationIntegrityError through the integrity wrapper, not an audit-stage configuration result. ${sourceLink('Selected revalidation runtimeIdentity and dispatch owner', path.join(root, selectedPath))}.`;
    }
    const fallback = Object.hasOwn(field.constraints, 'default') ? ` Schema default annotation: ${markdownInlineCode(JSON.stringify(field.constraints.default))}; the runtime consumer decides insertion or fallback.` : '';
    return `${markdownInlineCode(field.path)}: ${constraint || 'schema permits this field'}${field.conditions.length ? `; applies ${schemaConditions(field.conditions)}` : ''}.${binding ? ` Explicit configuration wins when it is not undefined; otherwise process \`${binding.environment}\` supplies the value. The linked parser owns empty-value normalization.` : ''}${authority ? ` ${authority}` : fallback}`;
  }
  const parentPaths = new Set([...endpoints, ...secrets].map((field) => field.path.lastIndexOf('.') < 0 ? '$' : field.path.slice(0, field.path.lastIndexOf('.'))));
  const authFields = schema.fields.filter((field) => /(?:authentication|redisTls|redisNetworkIsolation)$/u.test(field.path));
  const predicates = schema.predicates.filter((item) => parentPaths.has(item.path) && ['required', 'dependentRequired', 'not', 'if', 'anyOf', 'oneOf'].includes(item.keyword));
  const schemaContract = [...new Set([
    ...authFields.map(renderField),
    ...predicates.map((item) => `${markdownInlineCode(item.path)}: ${item.conditions.length ? `applies ${schemaConditions(item.conditions)}; ` : ''}${schemaConstraint(item.keyword, item.value)}`),
  ])].join('<br>');
  let endpoint = endpoints.length ? [...new Set(endpoints.map(renderField)), schemaContract, `The runtime request and selected configuration supply the concrete instance. ${evidence}.`].filter(Boolean).join('<br>')
    : boundary.records.length && !diagnostics.length ? ''
      : service ? `The invocation or delegated runtime binding supplies the target; no plugin-local endpoint field. ${evidence}.`
      : !diagnostics.length ? `No plugin-local endpoint: the resolved registration uses local or host-owned inputs. ${evidence}.` : `Endpoint authority is blocked by unresolved invocation analysis. ${evidence}.`;
  if (operationSchema === 'skills/nova/plugins/review/schemas/repository-audit-config.schema.json' && registration.id === 'repository-revalidation') {
    endpoint += '<br>The shared schema also admits config.profile and config.policy, but executeRepositoryRevalidation does not consume those settings. Its input grade, scope and overrides resolve the revalidation execution profile; importing compileRepositoryAudit does not call audit stageConfig or its policy resolver.';
  }
  let secret = secrets.length ? [...new Set(secrets.map(renderField)), schemaContract, called.includes('secrets.read') ? `Credential names resolve through ${namespace} and secrets.read. Secret projection and rotation belong to the selected runtime authority.` : plugin.openclaw ? 'The OpenClaw deployment owns sensitive configuration, process environment, credential projection, and rotation.' : 'The linked runtime consumer owns the declared credential value or reference.'].filter(Boolean).join('<br>')
    : boundary.records.length && !diagnostics.length ? ''
      : called.includes('secrets.read') ? `The invocation resolves secrets.read through ${namespace}; inspect its linked request for the actual credential selector. ${evidence}.`
      : service ? `The delegated provider or target may require credentials; this registration declares no plugin-local Secret field. Verify its selected binding.`
        : !diagnostics.length ? `No schema-declared credential field or secrets.read call; environment inputs and qualified consumers below retain their own authority. ${evidence}.` : `Credential authority is blocked by unresolved invocation analysis. ${evidence}.`;
  for (const input of invocation.environmentInputs) {
    const chain = input.provenance.map((item) => `${markdownInlineCode(item.name)} derives from ${markdownInlineCode(item.expression)} (${evidenceLink(item)})`).join('; ');
    secret += `${secret ? '<br>' : ''}Environment input: ${markdownInlineCode(input.expression)}${input.dynamic ? '; the environment name is computed at runtime' : ''}. ${chain ? `${chain}. ` : ''}The process owner supplies and rotates environment values; an environment read alone does not classify the value as a credential. ${evidenceLink(input)}.`;
  }
  const qualifiedOwners = boundary.records.map((item) => `${item.dataOwner} ${boundaryEvidence(item)}.`);
  let dataOwner = direct.length || called.length ? `The linked invocation establishes request/result and source-side custody boundaries, not the operational ownership, retention or access policy of a configured service or store. The platform configuration owner must establish those facts for each selected binding before activation; declarations and source-linked candidates do not assign them. ${evidence}.`
      : qualifiedOwners.length ? ''
        : !diagnostics.length ? `The registration transforms its host input or local files; no remote data owner is established. ${evidence}.` : `Data ownership requires the unresolved runtime authority above.`;
  let reachability = boundary.records.some((item) => ['runtime-client', 'host-tools', 'credential-provider'].includes(item.scope)) && !diagnostics.length ? ''
    : service ? `Use the ${namespace} to run one bounded operation. Verify its expected result. Direct client or provider code availability does not prove that an endpoint is configured or reachable. Retain failure, timeout, and cancellation results separately. ${evidence}.`
    : !diagnostics.length ? `No direct network preflight for this invocation. Verify local store and artifact/capability access using the registration's contract. ${evidence}.` : 'A complete dependency preflight requires qualification of the unresolved invocation authority above.';
  if (registration.kind === 'observer') {
    const policy = registration.failurePolicy ?? {};
    reachability += `${reachability ? '<br>' : ''}Declared observer delivery policy: ${markdownInlineCode(registration.delivery)}, ordering ${markdownInlineCode(registration.ordering)}, failure mode ${markdownInlineCode(policy.mode)}, at most ${markdownInlineCode(policy.maxAttempts)} attempts, ${markdownInlineCode(policy.backoffMs)} milliseconds backoff and ${markdownInlineCode(policy.timeoutMs)} milliseconds per-attempt timeout. At-least-once retries can duplicate writes/publishes; best-effort exhaustion can leave delivery missing without blocking the run. This declaration is not proof of delivery. ${sourceLink('Declared observer manifest policy', plugin.file)}.`;
  }
  const unqualifiedBindings = delegated.filter((name) => !routes.some((route) => route.capability === name));
  if (unqualifiedBindings.length) {
    const bindings = unqualifiedBindings.map(markdownInlineCode).join(', ');
    endpoint += `${endpoint ? '<br>' : ''}Separately verify the configured target or store for ${bindings}; linked provider source is not the deployed selection or endpoint.`;
    secret += `${secret ? '<br>' : ''}The selected ${bindings} binding owns its credential contract. Establish its actual Secret/value projection and rotation, or its source-backed absence of a credential requirement; capability names alone establish neither.`;
  }
  reachability += `${reachability ? '<br>' : ''}Before activation the platform configuration owner must assign an actual owner for each external reachability check and failure response. Stop if the binding, endpoint/store, credential authority, data handling or check owner is not established; do not infer readiness from package installation.`;
  for (const item of boundary.records) {
    const proof = `${boundaryEvidence(item)}.`;
    endpoint += `${endpoint ? '<br>' : ''}${item.endpoint} ${proof}`;
    secret += `${secret ? '<br>' : ''}${item.secret} ${proof}`;
    dataOwner += `${dataOwner ? '<br>' : ''}${item.dataOwner} ${proof}`;
    reachability += `${reachability ? '<br>' : ''}${item.check} ${proof}`;
  }
  const digest = crypto.createHash('sha256').update(JSON.stringify(schema).replaceAll(root, '$ROOT')).update(implementation).update(JSON.stringify({ called, direct, diagnostics, required, provided, environmentInputs: invocation.environmentInputs, boundaries: boundary.records }).replaceAll(root, '$ROOT')).digest('hex');
  const facts = { required, provided, serviceText, endpoint, secret, dataOwner, reachability, diagnostics, digest };
  // Structured observations retain exact invocation/schema provenance. Neither
  // capability declarations, role membership, nor prose establishes an actual
  // operational owner, deployed credential, artifact sink or runtime DATA role.
  const relativeEvidence = (item) => ({
    source: rel(item.file), line: item.line, endLine: item.endLine ?? item.line,
    sourceLink: evidenceLink(item),
  });
  dependencyAuthorityCache.set(key, {
    sourceRevision,
    required, provided,
    capabilityNamespace: plugin.codex ? 'Codex host interface declarations; not pipeline runtime grants'
      : plugin.openclaw ? 'OpenClaw host declarations; not pipeline runtime grants' : 'pipeline runtime capability declarations; not actual grants',
    identity: { packageId: plugin.manifest.id, registrationId: registration.id,
      host: plugin.openclaw ? 'openclaw' : plugin.codex ? 'codex' : 'pipeline-runtime',
      manifest: rel(plugin.file), kind: registration.kind },
    nativeManifestAuthor: plugin.manifest.author ?? null,
    roleInclusion: [...roles],
    operationalOwner: null,
    operationalOwnerQualification: 'Not established by source invocation analysis or native role inclusion.',
    schema: JSON.parse(JSON.stringify({ endpoints, secrets, predicates, diagnostics: schema.diagnostics }).replaceAll(root, '$ROOT')),
    invocations: invocation.evidence.map((item) => ({
      kind: item.kind, name: item.name ?? null, ...relativeEvidence(item),
    })),
    environmentInputs: invocation.environmentInputs.map((item) => ({
      expression: item.expression, dynamic: item.dynamic,
      classification: 'environment input; not automatically a credential',
      ...relativeEvidence(item),
      provenance: item.provenance.map((entry) => ({
        name: entry.name, expression: entry.expression, ...relativeEvidence(entry),
      })),
    })),
    boundaries: boundary.records.map(({ evidence: sources, ...record }) => ({
      ...record, evidence: sources.map(relativeEvidence),
    })),
    artifactOperations: invocation.evidence.filter((item) => item.kind === 'capability'
      && ['artifacts.read', 'artifacts.write', 'report.evidence.read', 'test.plan.evidence'].includes(item.name))
      .map((item) => ({ capability: item.name, ...relativeEvidence(item) })),
    observedRuntimeData: false,
    diagnostics,
    digest,
  });
  dependencyAnalysisCache.set(key, facts);
  return facts;
}

  return {
    registrationSchemaFacts,
    registrationDependencyFacts,
    registrationDependencyAuthority(plugin, registration) {
      registrationDependencyFacts(plugin, registration);
      return dependencyAuthorityCache.get(`${plugin.file}:${registration.id}`);
    },
  };
}

// Strict one-to-one join: inventory identity is not a family grant, and missing
// observations cannot silently become an empty successful dependency contract.
export function joinNativeDependencyAuthorities(nativePackages, authorities) {
  const kinds = new Map([
    ['stage', 'stage'], ['observer', 'observer'], ['adapter', 'capability adapter'],
    ['test-provider', 'test provider'], ['report-adapter', 'report adapter'],
    ['openclaw-extension', 'OpenClaw extension'], ['codex-plugin', 'Codex plugin'],
  ]);
  const byIdentity = new Map();
  for (const authority of authorities) {
    const { packageId, registrationId } = authority.identity;
    const key = `${packageId}:${registrationId}`;
    if (byIdentity.has(key)) throw new Error(`Duplicate dependency authority: ${key}`);
    byIdentity.set(key, authority);
  }
  const used = new Set();
  const canonical = (values) => JSON.stringify([...new Set(values ?? [])].sort());
  const result = nativePackages.map((plugin) => ({
    ...plugin,
    registrations: plugin.registrations.map((registration) => {
      const key = `${plugin.id}:${registration.id}`;
      if (used.has(key)) throw new Error(`Duplicate native registration: ${key}`);
      used.add(key);
      const authority = byIdentity.get(key);
      if (!authority) throw new Error(`Missing dependency authority: ${key}`);
      if ((plugin.host === 'pipeline-runtime' && (!Object.hasOwn(registration, 'requiredCapabilities')
        || !Object.hasOwn(registration, 'providedCapabilities')))
        || authority.identity.host !== plugin.host || authority.identity.manifest !== plugin.manifest
        || authority.identity.kind !== kinds.get(registration.kind)
        || (Object.hasOwn(registration, 'requiredCapabilities') && canonical(authority.required) !== canonical(registration.requiredCapabilities))
        || (Object.hasOwn(registration, 'providedCapabilities') && canonical(authority.provided) !== canonical(registration.providedCapabilities))) {
        throw new Error(`Native dependency identity/capability mismatch: ${key}`);
      }
      return { ...registration, dependencyAuthority: authority,
        nativeCapabilityComparison: {
          required: Object.hasOwn(registration, 'requiredCapabilities') ? 'exact' : 'not projected by native inventory',
          provided: Object.hasOwn(registration, 'providedCapabilities') ? 'exact' : 'not projected by native inventory',
        },
      };
    }),
  }));
  for (const key of byIdentity.keys()) {
    if (!used.has(key)) throw new Error(`Extra dependency authority: ${key}`);
  }
  return result;
}

// Read-only acquisition over caller-owned, freshly discovered inputs. No CLI,
// filesystem writes, or acceptance claims; the strict native join remains binding.
export function acquireNativeDependencyReport({ nativePackages, plugins, ...options }) {
  if (!Array.isArray(nativePackages)) throw new Error('Native packages must be explicit');
  const { registrationDependencyAuthority } = createRegistrationDependencyCollector({ plugins, ...options });
  const authorities = plugins.flatMap(plugin => plugin.registrations.map(registration =>
    registrationDependencyAuthority(plugin, registration)));
  const packages = joinNativeDependencyAuthorities(nativePackages, authorities);
  return { packageCount: packages.length,
    registrationCount: packages.reduce((sum, plugin) => sum + plugin.registrations.length, 0),
    packages };
}
