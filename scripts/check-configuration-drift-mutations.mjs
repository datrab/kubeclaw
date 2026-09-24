#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = process.cwd();
const environmentSecretOnly = process.argv.includes('--env-secret-only');
const casePrefix = process.argv.find((argument) => argument.startsWith('--case-prefix='))?.slice('--case-prefix='.length) ?? null;
const sourceRevision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).stdout.trim();
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-config-docs-mutations-'));
const outputDirectory = path.join(temporaryRoot, 'docs/generated/inventory');
const generator = path.join(temporaryRoot, 'scripts/docs-configuration-inventory.mjs');
const publisher = path.join(temporaryRoot, 'scripts/docs-generate.mjs');

function copy(relativePath) {
  const source = path.join(repositoryRoot, relativePath);
  if (fs.existsSync(source)) fs.cpSync(source, path.join(temporaryRoot, relativePath), { recursive: true });
}

function runGenerator(...args) {
  return spawnSync(process.execPath, [generator, '--root', temporaryRoot, '--out-dir', outputDirectory, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

function runPublisher(...args) {
  return spawnSync(process.execPath, [publisher, '--root', temporaryRoot, '--revision', sourceRevision, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

function published(relativePath) {
  return fs.readFileSync(path.join(temporaryRoot, relativePath), 'utf8');
}

function append(relativePath, text) {
  const target = path.join(temporaryRoot, relativePath);
  const original = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(target, `${original.replace(/\s*$/, '')}\n${text}\n`);
  return () => fs.writeFileSync(target, original);
}

function createFile(relativePath, text) {
  const target = path.join(temporaryRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  assert.equal(fs.existsSync(target), false, `${relativePath}: mutation target already exists`);
  fs.writeFileSync(target, `${text.replace(/\s*$/u, '')}\n`);
  return () => fs.rmSync(target, { force: true });
}

function replaceOnce(relativePath, before, after) {
  const target = path.join(temporaryRoot, relativePath);
  const original = fs.readFileSync(target, 'utf8');
  assert.ok(original.includes(before), `${relativePath}: mutation source text is missing: ${before}`);
  fs.writeFileSync(target, original.replace(before, after));
  return () => fs.writeFileSync(target, original);
}

function combineMutations(...mutations) {
  const restores = mutations.map((mutation) => mutation());
  return () => restores.reverse().forEach((restore) => restore());
}

function mutateJson(relativePath, edit) {
  const target = path.join(temporaryRoot, relativePath);
  const original = fs.readFileSync(target, 'utf8');
  const value = JSON.parse(original);
  edit(value);
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  return () => fs.writeFileSync(target, original);
}

function mutateLineToken(relativePath, lineNumber, token) {
  const target = path.join(temporaryRoot, relativePath);
  const original = fs.readFileSync(target, 'utf8');
  const lines = original.split('\n');
  assert.ok(lines[lineNumber - 1]?.includes(token), `${relativePath}:${lineNumber}: mutation token is missing`);
  const pivot = Math.max(0, token.search(/[A-Za-z0-9](?![\s\S]*[A-Za-z0-9])/u));
  const replacement = token[pivot] === 'X' ? 'Y' : 'X';
  const changed = `${token.slice(0, pivot)}${replacement}${token.slice(pivot + 1)}`;
  lines[lineNumber - 1] = lines[lineNumber - 1].replace(token, changed);
  fs.writeFileSync(target, lines.join('\n'));
  return () => fs.writeFileSync(target, original);
}

function mutateFileByte(relativePath) {
  const target = path.join(temporaryRoot, relativePath);
  const original = fs.readFileSync(target);
  const changed = Buffer.from(original);
  assert(changed.length > 0, `${relativePath}: cannot mutate an empty authority file`);
  changed[Math.floor(changed.length / 2)] ^= 1;
  fs.writeFileSync(target, changed);
  return () => fs.writeFileSync(target, original);
}

function expectDetected(name, mutate, verifyPublication = null) {
  const restore = mutate();
  try {
    const result = name.startsWith('payload-edge:')
      ? runGenerator('--check-payload-delivery-only')
      : runGenerator('--check');
    assert.notEqual(result.status, 0, `${name}: stale inventory was not detected`);
    const diagnostic = `${result.stdout}\n${result.stderr}`;
    assert.match(diagnostic, /(?:Configuration documentation inventory is stale|CONFIG_SEMANTIC_GAP|CONFIG_YAML_AUTHORITY_DRIFT|CONFIG_YAML_(?:DOTTED_KEY|PATH_COLLISION|SEMANTIC_AUTHORITY|SEMANTIC_CONTRACT)|CONFIG_YAML_API_CONTRACT_GAP|CONFIG_YAML_LEAF_LINE_DRIFT|CONFIG_YAML_API_LEAF_(?:LINE|DIGEST)_DRIFT|CONFIG_PAYLOAD_(?:REQUEST_PATH|SWARM_READER)_BOUNDARY_CHANGED|schema logical regression|offline external Helm authority verification failed|external Helm authority lock bytes|external Helm extracted authority bytes|authority source bytes changed|indirect semantic contract|cannot extract vendored CRD authority|exact consumer line changed|consumer context changed|downstream receiver changed|consumer proof is not bound to this exact leaf|selected-value proof does not bind the exact source field|compressed bytes changed|manifest bytes changed|deployed config payload .* is missing|deployed config payload discovery differs|expected .* containing|mutation token is missing)/u, `${name}: failure did not identify inventory drift or a semantic authority gap`);
    const semanticRejected = /CONFIG_SEMANTIC_GAP|CONFIG_YAML_AUTHORITY_DRIFT|authority source bytes changed/u.test(diagnostic);
    if (name === 'environment-setting:add') {
      assert.match(diagnostic, /AP98_MUTATION_ENV/u, `${name}: diagnostic did not identify the new operator environment input`);
      assert.match(diagnostic, /purpose, accepted form, default and empty behavior, precedence, impact, and failure symptom/u, `${name}: diagnostic did not require the complete environment contract`);
    }
    if (name === 'secret-setting:add') {
      assert.match(diagnostic, /ap98-mutation/u, `${name}: diagnostic did not identify the new Secret authority`);
      assert.match(diagnostic, /purpose, namespace, keys, optionality, producer, consumer, rotation owner and method, and failure symptom/u, `${name}: diagnostic did not require the complete Secret contract`);
    }
    if (['helm-secret-key-reference:add', 'helm-secret-volume:add', 'helm-secret-declaration:add', 'helm-secret-envfrom:add',
      'yaml-secret-declaration:add', 'yaml-secret-envfrom:add', 'yaml-secret-reference:add', 'yaml-image-pull-secret:add'].includes(name)) {
      if (/CONFIG_YAML_API_CONTRACT_GAP/u.test(diagnostic)) {
        assert.match(diagnostic, name === 'yaml-image-pull-secret:add' ? /imagePullSecrets/u : /secret(?:Key)?Ref/u,
          `${name}: API-contract diagnostic did not identify the new Secret field`);
      } else {
        assert.match(diagnostic, /ap98-(?:secret|helm|yaml)[a-z-]*/u, `${name}: diagnostic did not identify the new Secret declaration or binding`);
      }
      if (name.startsWith('helm-')) {
        assert.match(diagnostic, /purpose, namespace, keys, optionality, producer, consumer, rotation owner and method, and failure symptom/u,
          `${name}: diagnostic did not require the complete Helm Secret authority`);
      } else {
        assert.match(diagnostic, /(?:CONFIG_YAML_API_CONTRACT_GAP|exact source path \+ full field path|purpose, namespace, keys, optionality)/u,
          `${name}: diagnostic did not reject the new YAML Secret surface at an authority gate`);
      }
    }
    if (name === 'nova-cli-flag:add' || name === 'short-cli-alias:add') {
      const regenerate = runGenerator('--allow-semantic-gaps');
      assert.equal(regenerate.status, 0, `${name}: mutated inventory generation failed\n${regenerate.stdout}\n${regenerate.stderr}`);
      const cliGate = spawnSync(process.execPath, ['scripts/check-configuration-cli-drift.mjs'], { cwd: temporaryRoot, encoding: 'utf8' });
      assert.notEqual(cliGate.status, 0, `${name}: undocumented public CLI flag passed the CLI documentation gate`);
      assert.match(`${cliGate.stdout}\n${cliGate.stderr}`, /operator-runtime definitions lack authored documentation/u, `${name}: CLI gate did not name the missing authored authority`);
      console.log(`PASS ${name}: public CLI option rejected until authored documentation exists`);
    } else if (semanticRejected) {
      console.log(`PASS ${name}: public option rejected until qualified semantic authority exists`);
    } else if (verifyPublication) {
      const regenerate = runGenerator('--allow-semantic-gaps');
      assert.equal(regenerate.status, 0, `${name}: mutated inventory generation failed\n${regenerate.stdout}\n${regenerate.stderr}`);
      const publish = runPublisher();
      assert.equal(publish.status, 0, `${name}: mutated reference publication failed\n${publish.stdout}\n${publish.stderr}`);
      verifyPublication();
      console.log(`PASS ${name}: source -> inventory -> published semantics`);
    }
  } finally {
    restore();
    if (verifyPublication) {
      const recover = runGenerator('--allow-semantic-gaps');
      assert.equal(recover.status, 0, `${name}: baseline inventory recovery failed\n${recover.stdout}\n${recover.stderr}`);
    }
  }
  console.log(`PASS ${name}`);
}

function expectLocalHelmMaintenanceDetected(name, mutate, expectedDiagnostic) {
  const restore = mutate();
  try {
    const result = spawnSync(process.execPath, ['scripts/generate-local-helm-authorities.mjs', '--check'], {
      cwd: temporaryRoot,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, `${name}: local Helm semantic maintenance accepted the mutation`);
    assert.match(`${result.stdout}\n${result.stderr}`, expectedDiagnostic,
      `${name}: local Helm semantic maintenance did not explain the rejected mutation`);
  } finally {
    restore();
  }
  console.log(`PASS ${name}`);
}

try {
  ['charts', 'examples', 'gitops', 'my-values', 'releases', 'scripts', 'skills', 'docker', 'ops', 'tools', 'cmd', 'packaging', 'versions.json', 'docs/generated/inventory', 'docs/site'].forEach(copy);
  fs.symlinkSync(path.join(repositoryRoot, 'node_modules'), path.join(temporaryRoot, 'node_modules'), 'dir');
  const generated = runGenerator('--allow-semantic-gaps');
  assert.equal(generated.status, 0, `could not generate temporary baseline\n${generated.stdout}\n${generated.stderr}`);
  const baseline = runGenerator('--check');
  assert.equal(baseline.status, 0, `temporary baseline is stale\n${baseline.stdout}\n${baseline.stderr}`);
  const baselineValues = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-values.json'), 'utf8'));
  const baselineRuntime = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-runtime-inputs.json'), 'utf8'));
  const operatorEnvironment = baselineRuntime.environment.filter((item) => item.surface === 'operator-authored-input');
  assert.ok(operatorEnvironment.length > 150, 'operator environment inventory unexpectedly lost its main surface');
  assert.equal(operatorEnvironment.filter((item) => /blocker/u.test(item.meaningStatus)).length, 0, 'operator environment contract blockers remain');
  for (const item of operatorEnvironment) {
    const escapedEnvironmentName = item.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.ok(item.consumers.length > 0, `${item.name}: operator contract lacks a source consumer`);
    assert.ok(item.consumers.some((consumer) => `${consumer.path}:${consumer.line}` === item.meaningEvidence), `${item.name}: meaning evidence does not identify an exact consumer line`);
    for (const field of ['meaning', 'acceptedForm', 'defaultBehavior', 'emptyBehavior', 'invalidBehavior', 'precedenceExplanation', 'changeImpact', 'failureMeaning']) {
      assert.ok(typeof item[field] === 'string' && item[field].trim().length >= 8, `${item.name}: incomplete environment contract field ${field}`);
      assert.doesNotMatch(item[field], new RegExp(`^(?:configure|set|use)\\s+[\`']?${escapedEnvironmentName}[\`']?\\.?$`, 'iu'), `${item.name}: tautological environment contract field ${field}`);
    }
  }
  assert.equal(baselineRuntime.secrets.filter((item) => item.semanticStatus !== 'authored-secret-authority').length, 0, 'Secret authority blockers remain');
  for (const item of baselineRuntime.secrets) {
    for (const field of ['purpose', 'requiredWhen', 'producer', 'consumerAuthority', 'rotationOwner', 'rotation', 'failure', 'namespaceMeaning']) {
      assert.ok(typeof item[field] === 'string' && item[field].length >= 8, `${item.name}: incomplete Secret authority field ${field}`);
    }
    assert.ok(Number.isInteger(item.line) && item.line > 0, `${item.name}: Secret fact lacks an exact source line`);
  }
  const helmGatewayDeclaration = baselineRuntime.secrets.find((item) => item.kind === 'helm-template-declaration'
    && item.path === 'charts/kubeclaw/templates/secret.yaml' && item.authorityId === 'kubeclaw-chart-managed-gateway-secret');
  assert.ok(helmGatewayDeclaration, 'Helm Secret producer declaration was not inventoried');
  assert.deepEqual(helmGatewayDeclaration.keys, ['discordToken', 'gatewayToken', 'litellmApiKey'], 'Helm Secret declaration lost its conditional payload keys');
  assert.match(helmGatewayDeclaration.optionalState, /auth\.token.*litellm\.apiKey.*discord\.enabled/u, 'Helm Secret declaration lost its render condition');
  assert.match(helmGatewayDeclaration.keyConditions.gatewayToken, /auth\.token.*auth\.existingSecret/u, 'gatewayToken lost its exact Helm condition');
  assert.match(helmGatewayDeclaration.keyConditions.litellmApiKey, /litellm\.apiKey.*litellm\.existingSecret/u, 'litellmApiKey lost its exact Helm condition');
  assert.match(helmGatewayDeclaration.keyConditions.discordToken, /discord\.enabled.*discord\.token.*discord\.existingSecret/u, 'discordToken lost its exact Helm condition');
  const databaseUrl = baselineRuntime.environment.find((item) => item.name === 'DATABASE_URL');
  for (const sourcePath of ['skills/prism/server/control-config.ts', 'skills/prism/server/migrate.ts', 'skills/prism/server/worker-config.ts']) {
    assert.ok(databaseUrl?.consumerContracts.some((contract) => contract.path === sourcePath), `DATABASE_URL lacks its exact contract for ${sourcePath}`);
  }
  assert.equal(databaseUrl?.meaningStatus, 'authored-consumer-specific-contracts', 'DATABASE_URL was flattened into one inaccurate contract');
  const controlDatabaseContract = databaseUrl?.consumerContracts.find((contract) => contract.path === 'skills/prism/server/control-config.ts');
  assert.match(controlDatabaseContract?.purpose ?? '', /unconditional `pg\.Pool`/u, 'DATABASE_URL Control contract invents a non-database listener');
  assert.match(controlDatabaseContract?.defaultBehavior ?? '', /PGUSER.*PGPASSWORD.*PGHOST.*PGPORT.*PGDATABASE/u,
    'DATABASE_URL Control contract omits node-postgres PG* fallback inputs');
  assert.match(controlDatabaseContract?.precedence ?? '', /connection URL.*PG\*.*library default/u,
    'DATABASE_URL Control contract does not explain URL, PG*, and library-default precedence');
  assert.doesNotMatch(`${controlDatabaseContract?.acceptedForm ?? ''} ${controlDatabaseContract?.required ?? ''}`, /listener path does not use a database/iu,
    'DATABASE_URL Control contract still invents a non-database listener');
  const bundleTemporaryRoot = baselineRuntime.environment.find((item) => item.name === 'BUNDLE_TMP_ROOT');
  assert.equal(bundleTemporaryRoot?.surface, 'runtime-process-boundary', 'BUNDLE_TMP_ROOT became an operator option');
  assert.equal(bundleTemporaryRoot?.setDirectly, false, 'BUNDLE_TMP_ROOT became directly settable');
  assert.deepEqual(bundleTemporaryRoot?.producers, [{ path: 'charts/kubeclaw/templates/deployment.yaml', line: 944, access: 'internal-shell-assignment', value: '/tmp/code-bundle' }],
    'BUNDLE_TMP_ROOT lost its exact fixed internal shell producer');
  assert.ok(bundleTemporaryRoot?.precedence.some((step) => step.evidence === 'charts/kubeclaw/templates/deployment.yaml:1023'),
    'BUNDLE_TMP_ROOT lost its exact child-process export boundary');
  assert.ok(bundleTemporaryRoot?.readers.some((reader) => reader.path === 'charts/kubeclaw/templates/deployment.yaml'
    && reader.line === 1027 && reader.access === 'embedded-node-process-env'), 'BUNDLE_TMP_ROOT lost its exact Node reader');
  assert.match(bundleTemporaryRoot?.acceptedForm ?? '', /fixed path `\/tmp\/code-bundle`.*not an operator or external runtime input/u,
    'BUNDLE_TMP_ROOT is presented as externally configurable');
  for (const name of ['KUBECLAW_RUN_SECRET_SETUP', 'KUBECLAW_SECRET_SETUP_MODE', 'KUBECLAW_SECRETS_OVERWRITE']) {
    const accepted = baselineRuntime.environment.find((item) => item.name === name)?.acceptedForm ?? '';
    for (const spelling of ['1', 'true', 'yes', 'on', 'enabled', '0', 'false', 'no', 'off', 'disabled']) {
      assert.match(accepted, new RegExp(`(?:^|[^A-Za-z])${spelling}(?:[^A-Za-z]|$)`, 'u'), `${name}: accepted forms omit ${spelling}`);
    }
  }
  assert.match(baselineRuntime.environment.find((item) => item.name === 'KUBECLAW_RUN_SECRET_SETUP')?.acceptedForm ?? '', /auto/u,
    'KUBECLAW_RUN_SECRET_SETUP accepted forms omit auto');
  assert.match(baselineRuntime.environment.find((item) => item.name === 'KUBECLAW_SECRET_SETUP_MODE')?.acceptedForm ?? '', /auto.*interactive.*noninteractive/u,
    'KUBECLAW_SECRET_SETUP_MODE accepted forms omit a canonical mode');
  const declaredSecret = (name) => baselineRuntime.secrets.filter((item) => item.kind === 'declared-keys-in-script' && item.name === name);
  assert.ok(declaredSecret('redis-secrets').some((item) => JSON.stringify(item.keys) === JSON.stringify(['redis-password'])), 'command-scoped parser lost the Redis Secret key');
  assert.equal(declaredSecret('redis-secrets').some((item) => item.keys.includes('litellm-password')), false, 'a neighboring Secret command leaked keys into redis-secrets');
  assert.ok(declaredSecret('ghcr-secret').some((item) => item.keys.includes('.dockerconfigjson')), 'docker-registry Secret command was not inventoried');
  assert.ok(declaredSecret('pipeline-test-gate-source-attestation').some((item) => item.keys.includes('privateKey') && item.keys.includes('publicKey')), 'finite function-call Secret name was not resolved');
  const sopsSharedSecret = declaredSecret('openclaw-shared-secrets').find((item) => item.fieldPath === '<shell function create_shared_secret_from_sops>');
  assert.equal(sopsSharedSecret?.line, 444, 'array-built shared Secret evidence does not point to the create command');
  for (const item of baselineRuntime.secrets.filter((candidate) => candidate.kind === 'declared-keys-in-script')) {
    const evidenceLine = fs.readFileSync(path.join(temporaryRoot, item.path), 'utf8').split('\n')[item.line - 1] ?? '';
    assert.ok(evidenceLine.trim(), `${item.path}:${item.line}: shell Secret evidence line is blank`);
    assert.ok(item.commandEvidence && evidenceLine.includes(item.commandEvidence), `${item.path}:${item.line}: shell Secret evidence omits its asserted command`);
    assert.ok(item.nameEvidence && evidenceLine.includes(item.nameEvidence), `${item.path}:${item.line}: shell Secret evidence omits its asserted name expression`);
  }
  assert.equal(baselineRuntime.secrets.some((item) => item.keys?.includes('image-references')), false, 'ConfigMap key was classified as Secret payload');
  for (const name of ['GENERAL_IMAGE_REPOSITORY', 'GENERAL_IMAGE_TAG', 'NAMESPACE_CONTROLLER_IMAGE_REPOSITORY', 'NAMESPACE_CONTROLLER_IMAGE_TAG']) {
    const item = operatorEnvironment.find((candidate) => candidate.name === name);
    assert.ok(item, `${name}: nested compatibility environment input was not inventoried`);
    assert.match(item.precedenceExplanation, /wins, then/u, `${name}: compatibility precedence is incomplete`);
  }
  const baselinePublish = runPublisher();
  assert.equal(baselinePublish.status, 0, `could not publish baseline environment and Secret contracts\n${baselinePublish.stdout}\n${baselinePublish.stderr}`);
  const environmentPage = published('docs/site/reference/environment-variables.md');
  for (const phrase of ['Default:', 'Empty:', 'Invalid:', 'Winner:', 'BACKUP_EXPECTED_SERVER_VERSION', 'operator-authored-input']) assert.ok(environmentPage.includes(phrase), `published environment reference lacks ${phrase}`);
  const bundleTemporaryRootRow = environmentPage.split('\n').find((line) => line.startsWith('| `BUNDLE_TMP_ROOT`')) ?? '';
  for (const phrase of ['Internal implementation detail; no operator or external setting exists.', '/tmp/code-bundle', '#L944-L944', '#L1023-L1023', '#L1027-L1027']) {
    assert.ok(bundleTemporaryRootRow.includes(phrase), `published BUNDLE_TMP_ROOT contract lacks ${phrase}`);
  }
  assert.doesNotMatch(bundleTemporaryRootRow, /use the listed producer or external authority/iu,
    'published BUNDLE_TMP_ROOT contract presents the internal edge as externally configurable');
  const databaseUrlRow = environmentPage.split('\n').find((line) => line.startsWith('| `DATABASE_URL`')) ?? '';
  for (const phrase of ['unconditional `pg.Pool`', 'PGUSER', 'PGPASSWORD', 'PGHOST', 'PGPORT', 'PGDATABASE', 'library default']) {
    assert.ok(databaseUrlRow.includes(phrase), `published DATABASE_URL contract lacks ${phrase}`);
  }
  assert.doesNotMatch(databaseUrlRow, /listener path does not use a database/iu, 'published DATABASE_URL contract invents a non-database Control path');
  const secretsPage = published('docs/site/reference/secrets.md');
  for (const phrase of ['Rotation', 'Failure', 'pipeline-test-gate-source-attestation', 'source registry security']) assert.ok(secretsPage.includes(phrase), `published Secrets reference lacks ${phrase}`);
  const sopsSharedSecretRow = secretsPage.split('\n').find((line) => line.includes('<shell function create_shared_secret_from_sops>')) ?? '';
  assert.match(sopsSharedSecretRow, /setup-secrets\.sh#L444-L444/u,
    'published shared Secret producer evidence does not point to its create command');
  const baselineSchemas = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-schemas.json'), 'utf8'));
  const schemaField = (sourcePath, fieldPath) => baselineSchemas.files.find((file) => file.path === sourcePath)?.fields.find((field) => field.path === fieldPath);
  for (const fieldPath of ['$.artifacts[].id', '$.artifacts[].path', '$.coverage[].format', '$.reports[].mediaType']) {
    const field = schemaField('skills/buster/plugins/direct-command/schemas/config.schema.json', fieldPath);
    assert.ok(field, `${fieldPath}: local $ref leaf was not recursively expanded`);
    assert.ok(field.resolvedReferences?.length, `${fieldPath}: expanded leaf lost its local $ref provenance`);
    assert.doesNotMatch(field.meaning.status, /blocker/u, `${fieldPath}: expanded leaf lacks qualified semantics`);
  }
  const requestHeader = schemaField('skills/buster/plugins/openapi/schemas/config.schema.json', '$.operations[].headers.{*}');
  assert.match(requestHeader?.meaning.text ?? '', /request-header value/u, 'OpenAPI header wildcard is not described as request input');
  assert.match(requestHeader?.meaning.implementationEvidence ?? '', /skills\/buster\/plugins\/openapi\/src\/provider\.js:/u,
    'OpenAPI request-header wildcard is not bound to the provider request construction');
  const leavesFor = (sourcePath) => baselineValues.files.find((file) => file.path === sourcePath)?.documents.flatMap((document) => document.fields).filter((field) => !['object', 'array'].includes(field.type)) ?? [];
  for (const profile of ['my-values/nova-values.yaml', 'my-values/buster-values.yaml', 'my-values/prism-agent-values.yaml', 'my-values/prism-values.yaml']) {
    assert.equal(leavesFor(profile).some((field) => field.required === 'not-applicable-unused'), false, `${profile}: canonical render profile was classified as inactive`);
  }
  assert.deepEqual(leavesFor('examples/buster-values.yaml').filter((field) => field.required === 'not-applicable-unused').map((field) => field.path), ['$.serviceAccount.name'],
    'Buster example must retain the honest unused serviceAccount.name classification');
  assert.deepEqual(leavesFor('examples/nova-values.yaml').filter((field) => field.required === 'not-applicable-unused').map((field) => field.path), ['$.processor.enabled'],
    'Nova example must retain the honest unused processor.enabled classification');
  assert.equal(leavesFor('charts/kubeclaw/values.yaml').some((field) => field.consumers.some((consumer) => consumer.path === 'scripts/versions.mjs')), false,
    'maintenance writer was classified as runtime owner for chart values');
  for (const profile of ['my-values/infra/postgresql-values.yaml', 'my-values/infra/redis-values.yaml']) {
    assert.ok(leavesFor(profile).some((field) => field.consumers.some((consumer) => consumer.path === 'scripts/deploy.sh')), `${profile}: composed deploy-file binding was not resolved`);
  }
  assert.equal(baselineValues.totals.activeMeaningBlockers, 0, 'active YAML meaning blockers remain');
  assert.equal(baselineValues.totals.embeddedPayloadContractsNeedingConsumerProof, 0, 'opaque embedded payload passed without exact consumer authority');
  assert.ok(baselineValues.totals.embeddedPayloadAuthorities > 0, 'embedded payload authority gate did not classify any checked-in payload');
  const yamlLeaves = baselineValues.files.flatMap((file) => file.documents.flatMap((document) => document.fields))
    .filter((field) => !['object', 'array'].includes(field.type));
  const dottedKeyLeaves = yamlLeaves.filter((field) => /\["(?:\\.|[^"])*\.(?:\\.|[^"])*"\]/u.test(field.path));
  assert.equal(dottedKeyLeaves.length, 112, 'literal dotted YAML key coverage changed');
  for (const [sourcePath, fieldPath] of [
    ['my-values/infra/argocd-values.yaml', '$.configs.cm["application.resourceTrackingMethod"]'],
    ['my-values/infra/argocd-values.yaml', '$.configs.params["server.insecure"]'],
    ['examples/cilium/project-network-policy.yaml', '$.metadata.labels["pod-security.kubernetes.io/enforce"]'],
    ['my-values/infra/registry-local.yaml', '$.data["config.yml"]'],
    ['my-values/nova-values.yaml', '$.capabilityProviders.buster.capabilities["runtime.dispatch"].port'],
    ['my-values/nova-values.yaml', '$.capabilityProviders.buster.capabilities["test.plan.execute"].port'],
  ]) assert(leavesFor(sourcePath).some((field) => field.path === fieldPath), `${sourcePath}#${fieldPath}: named literal dotted-key path is missing`);
  const semanticAuthorities = yamlLeaves.filter((field) => [
    'embedded-payload-authority', 'external-chart-authority', 'implementation-authority', 'local-helm-field-authority',
  ].includes(field.meaning.status));
  assert.equal(semanticAuthorities.length, 1223, 'semantic authority evidence coverage changed');
  for (const field of semanticAuthorities) {
    assert(field.meaning.semanticAuthorityEvidence?.line > 1, `${field.path}: semantic authority registration resolves to line 1`);
    assert(field.meaning.semanticContractEvidence?.line > 1
      && field.meaning.semanticContractEvidence.endLine >= field.meaning.semanticContractEvidence.line,
    `${field.path}: semantic authority contract range is absent`);
  }
  for (const field of yamlLeaves.filter((item) => item.meaning.status === 'embedded-payload-authority')) {
    assert.match(field.meaning.sourceFileSha256 ?? '', /^[a-f0-9]{64}$/u, `${field.path}: embedded payload lacks a pinned source digest`);
    assert.ok(field.meaning.acceptedValues?.length >= 8 && field.meaning.emptyBehavior?.length >= 20, `${field.path}: embedded payload contract is incomplete`);
    assert.ok(field.changeImpact?.length >= 20 && field.failureMeaning?.length >= 20, `${field.path}: embedded payload lacks impact or failure behavior`);
  }
  for (const field of yamlLeaves.filter((item) => item.meaning.status === 'external-chart-authority')) {
    assert.match(field.meaning.externalChart?.archiveSha256 ?? '', /^[a-f0-9]{64}$/u, `${field.path}: external chart archive is not digest-pinned`);
    assert.match(field.meaning.externalChart?.valuesSha256 ?? '', /^[a-f0-9]{64}$/u, `${field.path}: external chart values are not digest-pinned`);
    assert.ok(field.meaning.externalChart?.chart && field.meaning.externalChart?.version && field.meaning.externalChart?.repository,
      `${field.path}: external chart coordinate is incomplete`);
  }
  assert.equal(baselineValues.totals.localHelmFieldMeanings, 805, 'local Helm field coverage changed without an exact authority update');
  assert.ok(baselineValues.totals.kubernetesOperationalLeaves > 700, 'operational Kubernetes/Argo fields collapsed into a generic API boundary');
  assert.ok(baselineValues.totals.kubernetesStructuralLeaves > 0, 'structural Kubernetes/Argo classification disappeared');
  const structuralApiPaths = new Set(yamlLeaves.filter((item) => item.meaning.status === 'deployment-structural-authority')
    .map((item) => item.path.replace(/\[[0-9]+\]/gu, '[]')));
  assert.deepEqual([...structuralApiPaths].sort(), ['$.apiVersion', '$.kind', '$.spec.description'],
    'an operational API field was admitted through a broad structural fallback');
  for (const field of yamlLeaves.filter((item) => /^deployment-(?:operational|structural)-authority$/u.test(item.meaning.status))) {
    assert.match(field.meaning.sourceLineSha256 ?? '', /^[a-f0-9]{64}$/u, `${field.path}: API leaf lacks an exact source-line digest`);
    assert.match(field.meaning.apiSchemaAuthority?.authoritySha256 ?? '', /^[a-f0-9]{64}$/u, `${field.path}: API leaf lacks a version-bound schema digest`);
    assert.equal(field.meaning.apiSchemaAuthority?.fieldPath, field.path.replace(/^\$\.?/u, ''), `${field.path}: API schema proof is not bound to the exact leaf`);
    assert.ok(typeof field.meaning.defaultBehavior === 'string' && typeof field.meaning.omissionBehavior === 'string', `${field.path}: exact API default or omission behavior is missing`);
    assert.equal(field.meaning.sourceLine, field.sourceLine, `${field.path}: API meaning line differs from its exact AST leaf line`);
    assert.equal(field.meaning.sourceLineSha256, field.sourceLineSha256, `${field.path}: API meaning digest differs from its exact AST leaf digest`);
    assert.doesNotMatch(`${field.meaning.text} ${field.meaning.emptyBehavior ?? ''}`, /where defined|states whether|uses pinned default|controller behavior|commonly/iu,
      `${field.path}: API contract uses vague non-versioned omission wording`);
  }
  assert.equal(baselineValues.totals.mechanicalTemplateMeanings, 0, 'mechanical template-only meanings remain');
  const localHelmLeaves = yamlLeaves.filter((item) => item.meaning.status === 'local-helm-field-authority');
  const forbiddenLocalGroups = new Set(['typed-rendered-value', 'bounded-integer', 'container-path', 'duration', 'kubernetes-or-runtime-name', 'network-or-source-url', 'numeric-security-mode', 'protocol-selector']);
  for (const field of localHelmLeaves) {
    assert.match(field.meaning.sourceFileSha256 ?? '', /^[a-f0-9]{64}$/u, `${field.path}: local Helm authority lacks a source digest`);
    assert.ok(field.meaning.semanticGroup && !forbiddenLocalGroups.has(field.meaning.semanticGroup), `${field.path}: local Helm field uses a generic or conflated semantic group`);
    assert.ok(field.meaning.acceptedValues?.length >= 20 && field.meaning.emptyBehavior?.length >= 20, `${field.path}: local Helm accepted/empty contract is incomplete`);
    assert.ok(field.changeImpact?.length >= 20 && field.failureMeaning?.length >= 20, `${field.path}: local Helm impact/failure contract is incomplete`);
    const helmConsumers = field.consumers.filter((consumer) => consumer.kind?.startsWith('helm-template'));
    const runtimeConsumers = field.consumers.filter((consumer) => !consumer.kind?.startsWith('helm-template'));
    assert.ok(helmConsumers.length > 0,
      `${field.path}: local Helm field lacks an exact template consumer`);
    assert.ok(runtimeConsumers.every((consumer) => consumer.direction === 'read'
      && /^(?:checked-in-runtime-reader|generated-json-consumer|runtime-|selected-image-runtime-boundary)/u.test(consumer.kind ?? '')),
    `${field.path}: non-template consumer is not an explicit runtime proof`);
  }
  const localAuthorityRegistry = JSON.parse(fs.readFileSync(path.join(temporaryRoot, 'scripts/docs-local-helm-field-authorities.json'), 'utf8'));
  const novaAuthorityFields = localAuthorityRegistry.files['my-values/nova-values.yaml']?.fields ?? {};
  const dottedPortPath = '$.capabilityProviders.buster.capabilities["runtime.dispatch"].port';
  const dottedPlanPath = '$.capabilityProviders.buster.capabilities["test.plan.execute"].port';
  const dottedPort = novaAuthorityFields[dottedPortPath];
  assert(dottedPort, 'literal runtime.dispatch capability map key lost bracket-quoted notation');
  assert(novaAuthorityFields[dottedPlanPath], 'literal test.plan.execute capability map key lost bracket-quoted notation');
  assert.equal(Object.hasOwn(novaAuthorityFields, '$.capabilityProviders.buster.capabilities.runtime.dispatch.port'), false,
    'literal runtime.dispatch key was flattened into nested path segments');
  assert.equal(Object.hasOwn(novaAuthorityFields, '$.capabilityProviders.buster.capabilities.test.plan.execute.port'), false,
    'literal test.plan.execute key was flattened into nested path segments');
  assert.match(dottedPort.purpose, /literal capability key `runtime\.dispatch`/u,
    'runtime.dispatch prose implies nested runtime and dispatch maps');
  assert(dottedPort.consumerProof.every((consumer) => consumer.exactValuePath.includes('capabilities["runtime.dispatch"]')),
    'runtime.dispatch consumer authority republishes the literal key as nested path segments');
  assert(dottedPort.consumerProof.some((consumer) => consumer.line === 1318 && consumer.templateExpression.includes('$route.port')),
    'runtime.dispatch.port is not bound to the exact leaf receiver at deployment.yaml:1318');
  assert.equal(dottedPort.consumerProof.some((consumer) => consumer.line === 1308), false,
    'ancestor capabilities required check was incorrectly propagated to runtime.dispatch.port');
  for (const [sourcePath, declaration] of Object.entries(localAuthorityRegistry.files)) for (const [fieldPath, authority] of Object.entries(declaration.fields)) {
    for (const consumer of authority.consumerProof) {
      assert.ok(consumer.receiverProof.length > 0, `${sourcePath}#${fieldPath}: receiver proof is empty`);
      assert.ok(consumer.defaultProofEvidence?.path === sourcePath && consumer.defaultProofEvidence?.fieldPath === fieldPath,
        `${sourcePath}#${fieldPath}: selected-value proof is not bound to the exact source field`);
      if (consumer.condition !== 'unconditional in the linked template branch') assert.ok(consumer.conditionProof.length > 0,
        `${sourcePath}#${fieldPath}: conditional receiver lacks an exact branch proof`);
    }
  }
  assert.equal(baselineSchemas.totals.deployedConfigPayloads, 14, 'deployed chart config payload coverage changed');
  assert.equal(baselineSchemas.totals.deployedPayloadsWithoutCheckedInReader, 2, 'deployed payload reader-boundary count changed');
  assert.equal(baselineSchemas.deployedPayloads.find((item) => item.path.endsWith('/lint-policy.json'))?.behaviorClassification,
    'materialized-request-path-binding-unproved', 'lint policy was presented as reader-bound without a request.policyPath to runtime-path binding');
  assert.equal(baselineSchemas.deployedPayloads.find((item) => item.path.endsWith('/swarm.config.json'))?.behaviorClassification,
    'materialized-and-path-injected-field-reader-unproved', 'swarm configuration path injection was presented as a checked-in field reader');
  for (const requiredPayload of ['charts/kubeclaw/files/config/.semgrep.yml', 'charts/kubeclaw/files/config/.yamllint.yml']) {
    const payload = baselineSchemas.deployedPayloads.find((item) => item.path === requiredPayload);
    assert(payload?.leafFields > 0, `${requiredPayload}: recursive deployed payload inventory is missing`);
    assert(payload.consumers.some((consumer) => consumer.kind === 'process-argument-or-reader'), `${requiredPayload}: exact process-argument or reader chain is missing`);
  }
  assert.equal(baselineSchemas.totals.undeployedConfigPayloads, 1, 'checked-in configuration without chart delivery changed');
  const undeployedPolicyPack = baselineSchemas.undeployedPayloads.find((item) => item.path === 'charts/kubeclaw/files/config/kubernetes-policy-pack-default.json');
  assert.equal(undeployedPolicyPack?.behaviorClassification, 'checked-in-reference-without-chart-delivery', 'policy pack was incorrectly presented as deployed');
  assert.equal(undeployedPolicyPack?.executableBehaviorProved, false, 'undeployed policy pack was presented as an active runtime option');
  assert.match(undeployedPolicyPack?.deliveryGap ?? '', /does not embed or copy/u, 'policy-pack delivery gap is not explicit');
  for (const payload of baselineSchemas.deployedPayloads) for (const edge of [...payload.deliveryChain, ...payload.selectionProof, ...payload.unboundReaderEvidence]) {
    assert.match(edge.sourceLineSha256 ?? '', /^[a-f0-9]{64}$/u, `${payload.path}: ${edge.kind} lacks a source-line digest`);
    assert.ok(edge.requiredToken?.length > 2, `${payload.path}: ${edge.kind} lacks an exact required token`);
    const line = fs.readFileSync(path.join(temporaryRoot, edge.path), 'utf8').split('\n')[edge.line - 1] ?? '';
    assert.ok(line.includes(edge.requiredToken), `${payload.path}: ${edge.kind} token is absent at ${edge.path}:${edge.line}`);
  }
  assert.equal(baselineRuntime.secrets.some((fact) => fact.path === 'scripts/deploy.sh' && fact.keys?.includes('image-references')), false,
    'kubectl create configmap was misclassified as a Secret declaration');

  const payloadEdgeCases = [...new Map(baselineSchemas.deployedPayloads.flatMap((payload) => [...payload.deliveryChain, ...payload.selectionProof, ...payload.unboundReaderEvidence].map((edge) => [
    `${edge.path}:${edge.line}:${edge.requiredToken}`,
    [`payload-edge:${path.basename(payload.path)}:${edge.kind}:${edge.line}`, () => mutateLineToken(edge.path, edge.line, edge.requiredToken)],
  ]))).values()];
  const externalArchiveManifest = JSON.parse(fs.readFileSync(path.join(temporaryRoot, 'scripts/external-helm-archives.json'), 'utf8'));
  const firstExternalArchive = Object.values(externalArchiveManifest.charts).sort((left, right) => left.path.localeCompare(right.path))[0];
  const apiAuthorityManifest = JSON.parse(fs.readFileSync(path.join(temporaryRoot, 'scripts/docs-api-authority-lock.json'), 'utf8'));
  const cases = [
    ['helm-field:add', () => append('charts/kubeclaw/values.yaml', 'ap98Mutation:\n  nestedField: true')],
    ['helm-field:change', () => replaceOnce('charts/kubeclaw/values.yaml', 'replicaCount: 1', 'replicaCount: 2')],
    ['helm-field:remove', () => replaceOnce('charts/kubeclaw/values.yaml', 'replicaCount: 1\n', '')],
    ['local-helm-consumer:add', () => createFile('charts/kubeclaw/templates/ap98-consumer.yaml', 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ap98-consumer\ndata:\n  serviceType: {{ .Values.service.type | quote }}')],
    ['local-helm-consumer:change', () => replaceOnce('charts/kubeclaw/templates/service.yaml', '  type: {{ .Values.service.type }}', '  type: {{ .Values.service.gatewayTargetPort }}')],
    ['local-helm-consumer:context-change', () => replaceOnce('charts/kubeclaw/templates/service.yaml', 'spec:\n  type: {{ .Values.service.type }}', 'spec:\n  externalTrafficPolicy: Local\n  type: {{ .Values.service.type }}')],
    ['local-helm-consumer:remove', () => replaceOnce('charts/kubeclaw/templates/service.yaml', '  type: {{ .Values.service.type }}\n', '')],
    ['local-helm-helper-body:leaf-change', () => replaceOnce('charts/kubeclaw/templates/_helpers.tpl', '{{- printf "%s@%s" .repository .digest -}}', '{{- printf "%s@%s" .tag .digest -}}')],
    ['local-helm-helper-call:argument-change', () => replaceOnce('charts/kubeclaw/templates/deployment.yaml', 'include "kubeclaw.image" .Values.image | quote', 'include "kubeclaw.image" .Values.gateway | quote')],
    ['local-helm-root-helper-call:argument-change', () => replaceOnce('charts/kubeclaw/templates/deployment.yaml', 'include "kubeclaw.demoReadyClientEnv" . | nindent 12', 'include "kubeclaw.demoReadyClientEnv" .Values.image | nindent 12')],
    ['local-helm-root-helper-transitive-call:argument-change', () => replaceOnce('charts/kubeclaw/templates/_demo-ready-client.tpl', 'include "kubeclaw.demoReadyClientValidate" . -', 'include "kubeclaw.demoReadyClientValidate" .Values.image -')],
    ['local-helm-default:nested-fallback-change', () => replaceOnce('charts/kubeclaw/templates/deployment.yaml', 'default (printf "git-deploy-key-%s" (.Values.agentRole | default "default"))', 'default (printf "git-deploy-key-%s" (.Values.agentRole | default "nova"))')],
    ['local-helm-dotted-key:shape-change', () => replaceOnce('my-values/nova-values.yaml', '      runtime.dispatch:\n', '      runtime:\n        dispatch:\n')],
    ['yaml-dotted-key:generic-formatter-flatten', () => replaceOnce('scripts/yaml-field-path.mjs',
      '      result += `[${JSON.stringify(token)}]`;',
      '      result += `.${token}`;')],
    ['local-helm-dotted-key:authority-flatten', () => mutateJson('scripts/docs-local-helm-field-authorities.json', (value) => {
      const fields = value.files['my-values/nova-values.yaml'].fields;
      fields['$.capabilityProviders.buster.capabilities.runtime.dispatch.port'] = fields['$.capabilityProviders.buster.capabilities["runtime.dispatch"].port'];
      delete fields['$.capabilityProviders.buster.capabilities["runtime.dispatch"].port'];
    })],
    ['local-helm-ancestor-required:leaf-remove', () => replaceOnce('charts/kubeclaw/templates/deployment.yaml', ') $route.port) }}', ') 18789) }}')],
    ['local-helm-wrong-receiver:leaf-change', () => replaceOnce('charts/kubeclaw/templates/deployment.yaml', ') $route.port) }}', ') $route.proxyPort) }}')],
    ['local-helm-authority:same-token-collision', () => combineMutations(
      () => append('charts/kubeclaw/values.yaml', 'ap98Collision:\n  enabled: false'),
      () => createFile('charts/kubeclaw/templates/ap98-collision.yaml', '{{- if .Values.ap98Collision.enabled }}\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ap98-collision\n{{- end }}'),
    )],
    ['yaml-authority:add', () => append('gitops/platform/values/alloy.yaml', 'ap98Mutation:\n  enableReporting: false')],
    ['yaml-authority:change', () => replaceOnce('gitops/platform/values/alloy.yaml', '  enableReporting: false', '  enableReporting: true')],
    ['yaml-authority:remove', () => replaceOnce('gitops/platform/values/alloy.yaml', '  enableReporting: false\n', '')],
    ['yaml-indirect-contract:proof-token-change', () => replaceOnce('scripts/docs-yaml-field-authorities.mjs',
      'tokens: [pathName, purpose, allowed]',
      "tokens: [pathName, purpose, 'AP98_MISSING_CONTRACT_TOKEN']")],
    ['yaml-authority:same-token-collision', () => combineMutations(
      () => createFile('gitops/platform/values/ap98-shadow.yaml', 'alloy:\n  enableReporting: false'),
      () => createFile('gitops/platform/bootstrap/ap98-shadow.yaml', `apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ap98-shadow
  namespace: argocd
spec:
  sources:
    - repoURL: https://grafana.github.io/helm-charts
      chart: alloy
      targetRevision: 1.12.1
      helm:
        valueFiles:
          - $values/gitops/platform/values/ap98-shadow.yaml
    - repoURL: https://github.com/datrab/kubeclaw.git
      targetRevision: main
      ref: values
    destination:
      server: https://kubernetes.default.svc
      namespace: monitoring`),
    )],
    ['yaml-authority:chart-version-change', () => replaceOnce('gitops/platform/bootstrap/alloy.yaml', 'targetRevision: 1.12.1', 'targetRevision: 1.12.2')],
    ['yaml-authority:chart-repository-change', () => replaceOnce('gitops/platform/bootstrap/alloy.yaml', 'repoURL: https://grafana.github.io/helm-charts', 'repoURL: https://example.invalid/helm-charts')],
    ['yaml-authority:direct-chart-version-change', () => mutateJson('versions.json', (value) => { value.infrastructureCharts.redis.version = '28.1.1'; })],
    ['external-chart-lock:bytes-change', () => replaceOnce('scripts/docs-external-helm-authority-lock.json', '"version": 1', '"version": 2')],
    ['external-chart-snapshot:bytes-change', () => replaceOnce('scripts/external-helm-authority-snapshots.json', '"version": 2', '"version": 999')],
    ['external-chart-archive-manifest:bytes-change', () => replaceOnce('scripts/external-helm-archives.json', '"version": 1', '"version": 999')],
    ['external-chart-archive:content-change', () => mutateFileByte(firstExternalArchive.path)],
    ['api-authority-lock:bytes-change', () => replaceOnce('scripts/docs-api-authority-lock.json', '"version": 1', '"version": 999')],
    ['api-authority-source:content-change', () => mutateFileByte(apiAuthorityManifest.kubernetes.path)],
    ['api-leaf-context:parent-substitution', () => replaceOnce('scripts/docs-configuration-inventory.mjs',
      'const meaning = yamlMeaning(fieldContext, exactPath, valueType, semantics, authority);',
      'const meaning = yamlMeaning(context, exactPath, valueType, semantics, authority);')],
    ['embedded-payload-authority:add', () => append('gitops/platform/litellm/resources.yaml', '---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ap98-payload\ndata:\n  mode: strict')],
    ['embedded-payload-authority:change', () => replaceOnce('gitops/platform/litellm/resources.yaml', "              value: 'True'", "              value: 'False'")],
    ['embedded-payload-authority:remove', () => replaceOnce('gitops/platform/litellm/resources.yaml', "            - '4000'\n", '')],
    ['api-operational-field:add', () => replaceOnce('gitops/platform/litellm/resources.yaml', '  replicas: 1', '  replicas: 1\n  minReadySeconds: 5')],
    ['unregistered-values-profile:add', () => createFile('my-values/ap98-unregistered-values.yaml', 'ap98Mutation:\n  nestedField: true')],
    ['example-profile:change', () => replaceOnce('examples/buster-values.yaml', 'agentRole: buster', 'agentRole: nova')],
    ['environment-setting:add', () => append('scripts/deploy.sh', ': "${AP98_MUTATION_ENV:?Set AP98_MUTATION_ENV for the mutation fixture}"')],
    ['environment-setting:change', () => replaceOnce('charts/kubeclaw/templates/deployment.yaml', '- name: NODE_OPTIONS', '- name: AP98_NODE_OPTIONS')],
    ['environment-setting:remove', () => replaceOnce('charts/kubeclaw/templates/deployment.yaml', '            - name: TMPDIR\n              value: "/tmp"\n', '')],
    ['embedded-node-heredoc:add', () => createFile('docker/ap98-node-heredoc.sh', `#!/usr/bin/env bash
AP98_CHILD_ONE=one AP98_CHILD_TWO=two node <<'NODE'
const runtimeEnvironment = process.env;
const key = 'AP98_EMBEDDED_NODE_CONSTANT';
const read = (name) => runtimeEnvironment[name];
const readFrom = (environment, name) => environment[name];
process.stdout.write([runtimeEnvironment.AP98_CHILD_ONE, runtimeEnvironment[key], read('AP98_EMBEDDED_NODE_HELPER'), readFrom(process.env, 'AP98_EMBEDDED_NODE_ARGUMENT_HELPER')].join(''));
NODE`)],
    ['inline-node-environment:add', () => createFile('docker/ap98-node-inline.sh', `#!/usr/bin/env bash
node --input-type=module -e 'const environment = process.env; process.stdout.write(environment.AP98_NODE_INLINE || "")'`)],
    ['embedded-python-heredoc:add', () => createFile('docker/ap98-python-heredoc.sh', `#!/usr/bin/env bash
python3 <<'PY'
import os
print(os.getenv('AP98_PYTHON_GETENV', '') + os.environ.get('AP98_PYTHON_GET', '') + os.environ['AP98_PYTHON_INDEX'])
PY`)],
    ['embedded-yaml-javascript:add', () => createFile('charts/ops-pod/templates/ap98-embedded-javascript.yaml', `apiVersion: v1
kind: ConfigMap
metadata: {name: ap98-embedded-javascript}
data:
  reader.sh: |
    cat > /tmp/ap98-reader.mjs <<'JAVASCRIPT'
    const environment = process.env;
    const read = (name) => environment[name];
    process.stdout.write(read('AP98_EMBEDDED_YAML_HELPER') || '');
    JAVASCRIPT`)],
    ['secret-setting:add', () => append('my-values/setup-secrets.sh', 'kubectl create secret generic ap98-mutation --from-literal=ap98MutationKey="$AP98_MUTATION_SECRET"')],
    ['secret-setting:change', () => replaceOnce('my-values/setup-secrets.sh', '--from-literal="redis-password=$redis_password"', '--from-literal="redis-password-mutated=$redis_password"')],
    ['secret-setting:remove', () => replaceOnce('my-values/setup-secrets.sh', '    --from-literal="redis-password=$redis_password" \\\n', '')],
    ['helm-secret-key-reference:add', () => createFile('charts/ops-pod/templates/ap98-secret-key.yaml', `apiVersion: v1
kind: Pod
metadata: {name: ap98-secret-key}
spec:
  containers:
    - name: fixture
      image: example.invalid/fixture
      env:
        - name: AP98_TOKEN
          valueFrom:
            secretKeyRef: {name: ap98-helm-key-secret, key: token}`)],
    ['helm-secret-volume:add', () => createFile('charts/ops-pod/templates/ap98-secret-volume.yaml', `apiVersion: v1
kind: Pod
metadata: {name: ap98-secret-volume}
spec:
  containers:
    - name: fixture
      image: example.invalid/fixture
      volumeMounts: [{name: fixture, mountPath: /fixture}]
  volumes:
    - name: fixture
      secret:
        secretName: ap98-helm-volume-secret`)],
    ['helm-secret-declaration:add', () => createFile('charts/ops-pod/templates/ap98-secret-declaration.yaml', `{{- if .Values.ap98Secret.enabled }}
apiVersion: v1
kind: Secret
metadata:
  name: ap98-helm-declared-secret
type: Opaque
stringData:
  token: {{ .Values.ap98Secret.token | quote }}
{{- end }}`)],
    ['helm-secret-envfrom:add', () => createFile('charts/ops-pod/templates/ap98-secret-envfrom.yaml', `apiVersion: v1
kind: Pod
metadata: {name: ap98-secret-envfrom}
spec:
  containers:
    - name: fixture
      image: example.invalid/fixture
      envFrom:
        - secretRef:
            name: ap98-helm-envfrom-secret`)],
    ['yaml-secret-declaration:add', () => createFile('gitops/platform/ap98-yaml-secret-declaration.yaml', `apiVersion: v1
kind: Secret
metadata:
  name: ap98-yaml-declared-secret
  namespace: kubeclaw
stringData:
  token: fixture`)],
    ['yaml-secret-envfrom:add', () => createFile('gitops/platform/ap98-yaml-secret-envfrom.yaml', `apiVersion: v1
kind: Pod
metadata:
  name: ap98-yaml-envfrom
  namespace: kubeclaw
spec:
  containers:
    - name: fixture
      image: example.invalid/fixture
      envFrom:
        - secretRef:
            name: ap98-yaml-envfrom-secret`)],
    ['yaml-secret-reference:add', () => createFile('gitops/platform/ap98-yaml-secret-reference.yaml', `apiVersion: v1
kind: Pod
metadata:
  name: ap98-yaml-reference
  namespace: kubeclaw
spec:
  containers:
    - name: fixture
      image: example.invalid/fixture
      env:
        - name: AP98_SECRET_VALUE
          valueFrom:
            secretKeyRef:
              name: ap98-yaml-key-secret
              key: token`)],
    ['yaml-image-pull-secret:add', () => createFile('gitops/platform/ap98-yaml-image-pull-secret.yaml', `apiVersion: v1
kind: Pod
metadata:
  name: ap98-image-pull
  namespace: kubeclaw
spec:
  imagePullSecrets:
    - name: ap98-yaml-image-pull-secret
  containers:
    - name: fixture
      image: example.invalid/fixture`)],
    ['script-flag:add', () => combineMutations(
      () => replaceOnce('scripts/deploy.sh', '[--with-code]', '[--with-code] [--ap98-mutation]'),
      () => replaceOnce('scripts/deploy.sh', '    --with-code)\n', '    --with-code|--ap98-mutation)\n'),
    )],
    ['script-flag:change', () => combineMutations(
      () => replaceOnce('scripts/deploy.sh', '[--with-code]', '[--with-source-code]'),
      () => replaceOnce('scripts/deploy.sh', '    --with-code)\n', '    --with-source-code)\n'),
    )],
    ['script-flag:remove', () => combineMutations(
      () => replaceOnce('scripts/deploy.sh', ' [--with-code]', ''),
      () => replaceOnce('scripts/deploy.sh', '    --with-code)\n      with_code=1\n      ;;\n', ''),
    )],
    ['swarm-config-field:add', () => mutateJson('charts/kubeclaw/files/config/swarm.config.json', (value) => { value.ap98Mutation = { nestedField: true }; })],
    ['swarm-config-field:change', () => mutateJson('charts/kubeclaw/files/config/swarm.config.json', (value) => { value.features.observability = false; })],
    ['swarm-config-field:remove', () => mutateJson('charts/kubeclaw/files/config/swarm.config.json', (value) => { delete value.features.observability; })],
    ['deployed-semgrep-config:change', () => replaceOnce('charts/kubeclaw/files/config/.semgrep.yml', 'severity: WARNING', 'severity: ERROR')],
    ['deployed-yamllint-config:change', () => replaceOnce('charts/kubeclaw/files/config/.yamllint.yml', 'line-length:', 'line-length:\n    level: warning\n  ap98-mutation:')],
    ['payload-boundary:request-path-binding-add', () => replaceOnce('skills/nova/plugins/lint/src/engine/index.ts', 'const policyPath = fs.realpathSync(request.policyPath);', 'const policyPath = fs.realpathSync(request.policyPath || "/runtime-config/lint-policy.json");')],
    ['payload-boundary:runtime-reader-add', () => createFile('skills/nova/core/ap98-swarm-reader.ts', 'export const configPath = process.env.SWARM_CONFIG || "/home/node/.openclaw/swarm.config.json";')],
    ['undeployed-policy-pack:change', () => replaceOnce('charts/kubeclaw/files/config/kubernetes-policy-pack-default.json', '"version": "1.0.0"', '"version": "1.0.1"')],
    ['nested-plugin-config:add', () => mutateJson('skills/nova/plugins/lint/schemas/config.schema.json', (value) => { value.properties.ap98Mutation = { type: 'object', properties: { nested: { type: 'boolean', default: true } } }; })],
    ['common-name-plugin-config:add', () => mutateJson('skills/nova/plugins/lint/schemas/config.schema.json', (value) => { value.properties.enabled = { type: 'boolean', default: true }; })],
    ['local-ref-cycle:change', () => mutateJson('skills/buster/plugins/direct-command/schemas/config.schema.json', (value) => { value.$defs.artifact = { $ref: '#/$defs/artifact' }; })],
    ['conditional-not:remote-remove', () => mutateJson('skills/nova/plugins/remote-test-gate/schemas/config.schema.json', (value) => { delete value.allOf[0].else.not; })],
    ['conditional-not:runtime-change', () => mutateJson('skills/common/plugins/runtime-dispatch/schemas/config.schema.json', (value) => { value.properties.targets.additionalProperties.allOf[0].then.not.required = ['endpoint']; })],
    ['nested-plugin-config:change', () => mutateJson('skills/nova/plugins/lint/schemas/config.schema.json', (value) => { value.properties.includeDebt.default = true; })],
    ['nested-plugin-config:remove', () => mutateJson('skills/nova/plugins/lint/schemas/config.schema.json', (value) => { delete value.properties.includeExperimental; })],
    ['registered-nonstandard-config:add', () => mutateJson('skills/nova/plugins/lint/schemas/adapter-config.schema.json', (value) => { value.properties.ap98RegisteredMutation = { type: 'boolean', default: false }; })],
    ['registered-nonstandard-config:change', () => mutateJson('skills/nova/plugins/lint/schemas/adapter-config.schema.json', (value) => { value.additionalProperties = true; })],
    ['registered-nonstandard-config:remove', () => mutateJson('skills/nova/plugins/lint/schemas/adapter-config.schema.json', (value) => { delete value.properties; })],
    ['default-precedence:add', () => replaceOnce('skills/nova/plugins/lint/src/engine/policy-paths.ts', 'path.resolve(projectRoot, manifest)', "path.resolve(projectRoot, manifest || '.')")],
    ['default-precedence:change', () => replaceOnce('skills/nova/plugins/lint/src/engine/policy-paths.ts', "project.kubernetes.schema_location !== null", "project.kubernetes.schema_location !== undefined")],
    ['default-precedence:remove', () => replaceOnce('skills/nova/plugins/lint/src/engine/policy-paths.ts', "const schemaRoot = project.kubernetes.schema_location.split('{{', 1)[0].replace(/[\\\\/]$/u, '');", "const schemaRoot = project.kubernetes.schema_location;")],
    ['nova-cli-flag:add', () => replaceOnce('skills/nova/core/cli.ts', '[--signal <resume-signal.json>]', '[--signal <resume-signal.json>] [--ap98-mutation <value>]')],
    ['nova-cli-flag:change', () => replaceOnce('skills/nova/core/cli.ts', '--audit <run-id>', '--audit-mutated <run-id>')],
    ['nova-cli-flag:remove', () => replaceOnce('skills/nova/core/cli.ts', ' [--signal <resume-signal.json>]', '')],
    ['short-cli-alias:add', () => replaceOnce('skills/nova/project_setup/tools/progress-scaffold.ts', "argument === '--help' || argument === '-h'", "argument === '--help' || argument === '-h' || argument === '-v'")],
    ['short-cli-alias:change', () => replaceOnce('skills/nova/project_setup/tools/progress-scaffold.ts', "argument === '-h'", "argument === '-v'")],
    ['short-cli-alias:remove', () => replaceOnce('skills/nova/project_setup/tools/progress-scaffold.ts', " || argument === '-h'", '')],
    ...payloadEdgeCases,
  ];
  const semanticPublicationChecks = new Map([
    ['helm-field:add', () => {
      assert.match(published('docs/site/reference/helm-values.md'), /\$\.ap98Mutation\.nestedField/u);
      assert.match(published('docs/site/reference/helm-values.md'), /Add a source-backed template\/Application\/deploy binding or remove the unused value/u);
    }],
    ['unregistered-values-profile:add', () => {
      const inventory = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-values.json'), 'utf8'));
      const profile = inventory.files.find((file) => file.path === 'my-values/ap98-unregistered-values.yaml');
      assert(profile, 'unregistered values mutation was not inventoried');
      const leaf = profile.documents.flatMap((document) => document.fields).find((field) => field.path === '$.ap98Mutation.nestedField');
      assert.equal(leaf?.required, 'not-applicable-unused', 'generic values filename fabricated a chart/runtime binding');
    }],
    ['environment-setting:add', () => assert.match(published('docs/site/reference/environment-variables.md'), /AP98_MUTATION_ENV/u)],
    ['secret-setting:add', () => assert.match(published('docs/site/reference/secrets.md'), /ap98MutationKey/u)],
    ['script-flag:add', () => assert.match(published('docs/site/reference/cli.md'), /--ap98-mutation/u)],
    ['swarm-config-field:add', () => assert.match(published('docs/site/reference/plugin-configuration.md'), /\$\.ap98Mutation\.nestedField/u)],
    ['nested-plugin-config:add', () => assert.match(published('docs/site/reference/plugin-configuration.md'), /\$\.ap98Mutation\.nested/u)],
    ['registered-nonstandard-config:add', () => assert.match(published('docs/site/reference/plugin-configuration.md'), /\$\.ap98RegisteredMutation/u)],
    ['nova-cli-flag:add', () => assert.match(published('docs/site/reference/cli.md'), /--ap98-mutation/u)],
    ['default-precedence:change', () => {
      const inventory = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-runtime-inputs.json'), 'utf8'));
      const fact = inventory.configurationConsumerSources.find((item) => item.path === 'skills/nova/plugins/lint/src/engine/policy-paths.ts');
      assert(fact, 'default-precedence mutation lost its consumer authority');
      const baselineFact = baselineRuntime.configurationConsumerSources.find((item) => item.path === fact.path);
      assert(baselineFact, 'default-precedence baseline lost its consumer authority');
      assert.notEqual(fact.sourceDigest, baselineFact.sourceDigest, 'default-precedence source change did not update its internal drift digest');
      const readerPage = published('docs/site/reference/plugin-configuration.md');
      assert.equal(readerPage.includes(fact.sourceDigest), false, 'an internal source digest leaked into the reader reference');
      assert.doesNotMatch(readerPage, /candidate runtime consumer/iu, 'unresolved discovery language leaked into the reader reference');
    }],
  ]);
  const selectedCases = environmentSecretOnly
    ? cases.filter(([name]) => /^(?:environment-setting|embedded-node-heredoc|inline-node-environment|embedded-python-heredoc|embedded-yaml-javascript|secret-setting|helm-secret|yaml-secret|yaml-image-pull-secret)/u.test(name))
    : casePrefix ? cases.filter(([name]) => name.startsWith(casePrefix)) : cases;
  if (!environmentSecretOnly && (!casePrefix || 'local-helm-boolean:baseline-type-change'.startsWith(casePrefix))) {
    expectLocalHelmMaintenanceDetected('local-helm-boolean:baseline-type-change', () => replaceOnce(
      'charts/kubeclaw/values.yaml',
      'archviewer:\n  enabled: false',
      'archviewer:\n  enabled: "false"',
    ), /LOCAL_HELM_BOOLEAN_TYPE_DRIFT.*archviewer\.enabled/u);
  }
  for (const [name, mutation] of selectedCases) expectDetected(name, mutation, semanticPublicationChecks.get(name));

  if (casePrefix) {
    const focusedRestored = runGenerator('--check');
    assert.equal(focusedRestored.status, 0, `focused mutation baseline did not recover\n${focusedRestored.stdout}\n${focusedRestored.stderr}`);
    console.log(`PASS focused mutation prefix ${casePrefix} and baseline recovery`);
  } else {

  const restoreConfigMapControl = replaceOnce('scripts/deploy.sh', '--from-literal=user="$PRISM_E2E_USER"', '--from-literal=ap98-public="$PRISM_E2E_USER"');
  try {
    const configMapControl = runGenerator();
    assert.equal(configMapControl.status, 0, `ConfigMap --from-literal fixture generation failed\n${configMapControl.stdout}\n${configMapControl.stderr}`);
    const configMapRuntime = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-runtime-inputs.json'), 'utf8'));
    assert.equal(configMapRuntime.secrets.some((fact) => fact.keys?.includes('ap98-public')),
      false, 'ConfigMap --from-literal was misclassified as Secret payload');
  } finally {
    restoreConfigMapControl();
    const recovered = runGenerator();
    assert.equal(recovered.status, 0, `baseline generation failed after ConfigMap negative control\n${recovered.stdout}\n${recovered.stderr}`);
  }
  console.log('PASS ConfigMap --from-literal negative Secret control');

  const restored = runGenerator('--check');
  assert.equal(restored.status, 0, `baseline did not recover after mutations\n${restored.stdout}\n${restored.stderr}`);

  const canaryPath = 'my-values/infra/network-policies.yaml';
  const restoreCanaries = append(canaryPath, [
    '---',
    'authProfile:',
    '  email: ap98-person@example.invalid',
    '  discordGuildUsers:',
    '    - "123456789012345678"',
    '  channelId: "198765432109876543"',
    '  approvers:',
    '    - ap98-reviewer',
    '  repositoryUrl: https://ap98-user:ap98-password@example.invalid/repository.git',
    '  harmlessPort: 8443',
    '  harmlessPath: /var/lib/ap98',
  ].join('\n'));
  try {
    const result = runGenerator('--allow-semantic-gaps');
    assert.equal(result.status, 0, `redaction canary generation failed\n${result.stdout}\n${result.stderr}`);
    const generatedText = fs.readdirSync(outputDirectory)
      .filter((name) => name.startsWith('configuration-'))
      .map((name) => fs.readFileSync(path.join(outputDirectory, name), 'utf8'))
      .join('\n');
    for (const forbidden of ['ap98-person@example.invalid', '123456789012345678', '198765432109876543', 'ap98-reviewer', 'ap98-user:ap98-password']) {
      assert.equal(generatedText.includes(forbidden), false, `redaction leaked canary: ${forbidden}`);
    }
    assert.match(generatedText, /8443/, 'redaction removed a harmless port');
    assert.match(generatedText, /\/var\/lib\/ap98/, 'redaction removed a harmless path');
    console.log('PASS identity, access-list, and credential-URL redaction');
  } finally {
    restoreCanaries();
  }

  const secretProvenancePath = 'charts/ops-pod/templates/workload.yaml';
  const positive = runGenerator();
  assert.equal(positive.status, 0, `sensitivity baseline generation failed\n${positive.stdout}\n${positive.stderr}`);
  let runtimeInventory = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-runtime-inputs.json'), 'utf8'));
  assert.equal(runtimeInventory.environment.find((item) => item.name === 'TS_AUTHKEY')?.sensitivityClass, 'secret-value', 'TS_AUTHKEY secretKeyRef provenance was not sensitive');
  assert.ok(runtimeInventory.environment.find((item) => item.name === 'TS_AUTHKEY')?.sensitivityReasons.includes('Kubernetes valueFrom/secretKeyRef provenance'), 'TS_AUTHKEY did not retain its provenance reason');
  const restoreCanaryProvenance = append(secretProvenancePath, [
    '            - name: AP98_PUBLIC_NEIGHBOR',
    '              valueFrom:',
    '                configMapKeyRef: {name: public-runtime-config, key: public-value}',
    '            - name: AP98_SECRET_NAME',
    '              value: public-secret-object-name',
    '            - name: AP98_USERNAME',
    '              value: public-user-name',
    '            - name: AP98_CLIENT_ID',
    '              value: public-client-id',
    '            - name: AP98_PUBLIC_KEY',
    '              valueFrom:',
    '                secretKeyRef: {name: ap98-trust, key: public-key}',
    '            - name: AP98_TLS_CERT',
    '              value: /var/run/ap98/tls.crt',
    '            - name: AP98_PROVENANCE_VALUE',
    '              valueFrom:',
    '                secretKeyRef: {name: ap98-sensitive, key: opaque-value}',
  ].join('\n'));
  try {
    let canary = runGenerator('--allow-semantic-gaps');
    assert.equal(canary.status, 0, `sensitivity provenance canary generation failed\n${canary.stdout}\n${canary.stderr}`);
    runtimeInventory = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-runtime-inputs.json'), 'utf8'));
    assert.equal(runtimeInventory.environment.find((item) => item.name === 'AP98_PUBLIC_NEIGHBOR')?.sensitivityClass, 'ordinary-value', 'neighboring Secret provenance tainted a ConfigMap-backed env');
    assert.equal(runtimeInventory.environment.find((item) => item.name === 'AP98_SECRET_NAME')?.sensitivityClass, 'secret-object-name-reference', 'Secret object name was treated as secret payload');
    assert.equal(runtimeInventory.environment.find((item) => item.name === 'AP98_USERNAME')?.sensitivityClass, 'identity-reference', 'username identity was not separated from credentials and ordinary values');
    assert.equal(runtimeInventory.environment.find((item) => item.name === 'AP98_CLIENT_ID')?.sensitivityClass, 'identity-reference', 'client identity was not separated from credentials and ordinary values');
    assert.equal(runtimeInventory.environment.find((item) => item.name === 'AP98_PUBLIC_KEY')?.sensitivityClass, 'public-verification-material', 'public verification key was treated as secret payload');
    assert.equal(runtimeInventory.environment.find((item) => item.name === 'AP98_TLS_CERT')?.sensitivityClass, 'public-verification-file-path', 'public certificate path was treated as a private-key path');
    assert.equal(runtimeInventory.environment.find((item) => item.name === 'AP98_PROVENANCE_VALUE')?.sensitivityClass, 'secret-value', 'neutral env name did not inherit Secret provenance');
    const restoreNegative = replaceOnce(secretProvenancePath, 'secretKeyRef: {name: ap98-sensitive, key: opaque-value}', 'configMapKeyRef: {name: public-runtime-config, key: opaque-value}');
    canary = runGenerator('--allow-semantic-gaps');
    assert.equal(canary.status, 0, `sensitivity negative-control generation failed\n${canary.stdout}\n${canary.stderr}`);
    runtimeInventory = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-runtime-inputs.json'), 'utf8'));
    assert.equal(runtimeInventory.environment.find((item) => item.name === 'AP98_PROVENANCE_VALUE')?.sensitivityClass, 'ordinary-value', 'neutral env stayed sensitive after Secret provenance was removed');
    restoreNegative();
  } finally {
    restoreCanaryProvenance();
    runGenerator();
  }
  console.log('PASS Secret-provenance sensitivity positive and negative controls');

  const yamlSecretFixturePath = 'gitops/platform/ap98-secret-parser-fixture.yaml';
  const restoreYamlSecretFixture = createFile(yamlSecretFixturePath, `apiVersion: v1
kind: Secret
metadata:
  name: ap98-parser-declaration
  namespace: kubeclaw
stringData:
  token: fixture
---
fixture:
  imagePullSecrets:
    - name: ap98-parser-pull
  envFrom:
    - secretRef:
        name: ap98-parser-envfrom
  valueFrom:
    secretKeyRef:
      name: ap98-parser-key
      key: token`);
  try {
    const yamlSecretFixture = runGenerator('--allow-semantic-gaps');
    assert.equal(yamlSecretFixture.status, 0, `YAML Secret parser fixture failed\n${yamlSecretFixture.stdout}\n${yamlSecretFixture.stderr}`);
    runtimeInventory = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-runtime-inputs.json'), 'utf8'));
    const secretFact = (name, kind) => runtimeInventory.secrets.find((fact) => fact.path === yamlSecretFixturePath && fact.name === name && fact.kind === kind);
    const declaration = secretFact('ap98-parser-declaration', 'declaration');
    assert.deepEqual(declaration?.keys, ['token'], 'normal YAML Secret declaration lost its key');
    const envFrom = secretFact('ap98-parser-envfrom', 'reference');
    const keyReference = secretFact('ap98-parser-key', 'key-reference');
    assert.equal(keyReference?.key, 'token', 'normal YAML secretKeyRef lost its key');
    const imagePull = secretFact('ap98-parser-pull', 'reference');
    for (const fact of [declaration, envFrom, keyReference, imagePull]) {
      assert.ok(fact, 'normal YAML Secret fixture lost a declaration or reference');
      assert.equal(fact.semanticStatus, 'secret-authority-blocker', `${fact.name}: unknown fixture authority did not fail closed`);
      assert.match(fact.closureCondition, /purpose, condition, producer, consumer, rotation owner and method, and failure symptom/u,
        `${fact.name}: incomplete Secret closure contract`);
      const evidenceLine = fs.readFileSync(path.join(temporaryRoot, fact.path), 'utf8').split('\n')[fact.line - 1];
      assert.ok(evidenceLine.includes(fact.name), `${fact.name}: evidence line is not the exact YAML name line`);
    }
  } finally {
    restoreYamlSecretFixture();
    const recovered = runGenerator();
    assert.equal(recovered.status, 0, `baseline did not recover after YAML Secret parser fixture\n${recovered.stdout}\n${recovered.stderr}`);
  }
  console.log('PASS normal YAML Secret declaration, envFrom, keyRef, imagePullSecret, and exact-line discovery');

  const environmentFixturePath = 'scripts/ap98-environment-boundary-fixture.sh';
  const restoreEnvironmentFixture = combineMutations(
    () => createFile(environmentFixturePath, `#!/usr/bin/env bash
set -euo pipefail
effective="\${AP98_OUTER_INPUT:-\${AP98_INNER_INPUT:-fallback}}"
printf '%s\\n' "$effective"
cat <<'AP98_HELP'
This is documentation only: \${AP98_DOCUMENTATION_ONLY:-do-not-inventory}
AP98_HELP`),
    () => createFile('skills/prism/config/ap98-environment-reader-fixture.ts', `export function fixture(environment: NodeJS.ProcessEnv = process.env) {
  const computedKey = 'AP98_COMPUTED_ENV';
  const { AP98_DESTRUCTURED_ENV: renamed } = environment;
  const read = (name: string) => environment[name];
  const readFrom = (source: NodeJS.ProcessEnv, name: string) => source[name];
  return [environment.AP98_ALIAS_ENV, environment[computedKey], renamed, read('AP98_HELPER_ENV'), readFrom(process.env, 'AP98_ARGUMENT_HELPER_ENV')];
}`),
    () => createFile('skills/worker/core/worker/ap98-environment-reader-fixture.c', `#include <stdlib.h>
const char *fixture(void) { return getenv("AP98_C_GETENV"); }`),
    () => createFile('cmd/ap98-environment-reader-fixture/main.go', `package main
import "os"
func env(name string, fallback string) string { if value := os.Getenv(name); value != "" { return value }; return fallback }
func envInt(name string, fallback int) int { _ = os.Getenv(name); return fallback }
func unrelated(name string) string { return name }
func main() { _, _, _, _ = os.Getenv("AP98_GO_DIRECT"), env("AP98_GO_HELPER", "fallback"), envInt("AP98_GO_INT_HELPER", 42), unrelated("AP98_GO_NOT_ENV") }
`),
    () => createFile('charts/ops-pod/templates/ap98-inline-environment-fixture.yaml', `apiVersion: v1
kind: Pod
metadata: {name: ap98-inline-environment}
spec:
  containers:
    - name: fixture
      image: example.invalid/fixture
      env: [{name: AP98_INLINE_YAML_ENV, value: fixture}]`),
    () => createFile('charts/ops-pod/templates/ap98-embedded-javascript-fixture.yaml', `apiVersion: v1
kind: ConfigMap
metadata: {name: ap98-embedded-javascript-fixture}
data:
  reader.sh: |
    cat > /tmp/ap98-reader.mjs <<'JAVASCRIPT'
    const environment = process.env;
    const read = (name) => environment[name];
    process.stdout.write(read('AP98_EMBEDDED_YAML_HELPER') || '');
    JAVASCRIPT`),
    () => createFile('docker/ap98-embedded-program-fixture.sh', `#!/usr/bin/env bash
AP98_CHILD_PREFIX_ONE=one AP98_CHILD_PREFIX_TWO=two node <<'NODE'
const environment = process.env;
const key = 'AP98_EMBEDDED_COMPUTED';
const read = (name) => environment[name];
const readFrom = (source, name) => source[name];
process.stdout.write([environment.AP98_CHILD_PREFIX_ONE, environment.AP98_CHILD_PREFIX_TWO, environment[key], read('AP98_EMBEDDED_HELPER'), readFrom(process.env, 'AP98_EMBEDDED_ARGUMENT_HELPER')].join(''));
NODE
node -e 'const environment = process.env; process.stdout.write(environment.AP98_NODE_INLINE || "")'
python3 <<'PY'
import os
print(os.getenv('AP98_PYTHON_GETENV', '') + os.environ.get('AP98_PYTHON_GET', '') + os.environ['AP98_PYTHON_INDEX'])
PY`),
  );
  try {
    const environmentFixture = runGenerator('--allow-semantic-gaps');
    assert.equal(environmentFixture.status, 0, `environment parser boundary fixture failed\n${environmentFixture.stdout}\n${environmentFixture.stderr}`);
    runtimeInventory = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-runtime-inputs.json'), 'utf8'));
    const fixtureNames = new Set(runtimeInventory.environment.filter((item) => item.consumers.some((consumer) => consumer.path === environmentFixturePath)).map((item) => item.name));
    assert.ok(fixtureNames.has('AP98_OUTER_INPUT'), 'outer shell parameter expansion was not inventoried');
    assert.ok(fixtureNames.has('AP98_INNER_INPUT'), 'nested shell parameter expansion was not inventoried');
    assert.equal(fixtureNames.has('AP98_DOCUMENTATION_ONLY'), false, 'quoted help heredoc became a runtime environment input');
    const outer = runtimeInventory.environment.find((item) => item.name === 'AP98_OUTER_INPUT');
    assert.equal(outer?.precedence.find((step) => step.order === 2)?.value, '<nested parameter expansion; see source>', 'nested fallback was published as a truncated shell expression');
    const requiredReader = (name, sourcePath, access) => {
      const input = runtimeInventory.environment.find((item) => item.name === name);
      assert(input?.consumers.some((consumer) => consumer.path === sourcePath && consumer.access === access), `${name}: ${access} reader was not inventoried from ${sourcePath}`);
    };
    requiredReader('AP98_ALIAS_ENV', 'skills/prism/config/ap98-environment-reader-fixture.ts', 'node-process-env-alias');
    requiredReader('AP98_COMPUTED_ENV', 'skills/prism/config/ap98-environment-reader-fixture.ts', 'node-process-env-computed');
    requiredReader('AP98_DESTRUCTURED_ENV', 'skills/prism/config/ap98-environment-reader-fixture.ts', 'node-process-env-destructure');
    requiredReader('AP98_HELPER_ENV', 'skills/prism/config/ap98-environment-reader-fixture.ts', 'node-process-env-computed-helper');
    requiredReader('AP98_ARGUMENT_HELPER_ENV', 'skills/prism/config/ap98-environment-reader-fixture.ts', 'node-process-env-computed-helper');
    requiredReader('AP98_C_GETENV', 'skills/worker/core/worker/ap98-environment-reader-fixture.c', 'c-getenv');
    requiredReader('AP98_GO_DIRECT', 'cmd/ap98-environment-reader-fixture/main.go', 'go-process-env');
    requiredReader('AP98_GO_HELPER', 'cmd/ap98-environment-reader-fixture/main.go', 'go-process-env-helper');
    requiredReader('AP98_GO_INT_HELPER', 'cmd/ap98-environment-reader-fixture/main.go', 'go-process-env-helper');
    assert.equal(runtimeInventory.environment.some((item) => item.name === 'AP98_GO_NOT_ENV'), false,
      'unrelated Go helper call became an environment reader');
    assert.equal(runtimeInventory.environment.find((item) => item.name === 'AP98_GO_HELPER')?.precedence
      .find((step) => step.source === 'Go helper fallback')?.value, 'fallback',
    'Go helper fallback was not preserved in precedence evidence');
    requiredReader('AP98_INLINE_YAML_ENV', 'charts/ops-pod/templates/ap98-inline-environment-fixture.yaml', 'kubernetes-env');
    requiredReader('AP98_EMBEDDED_YAML_HELPER', 'charts/ops-pod/templates/ap98-embedded-javascript-fixture.yaml', 'embedded-node-process-env-computed-helper');
    for (const name of ['AP98_CHILD_PREFIX_ONE', 'AP98_CHILD_PREFIX_TWO']) requiredReader(name, 'docker/ap98-embedded-program-fixture.sh', 'embedded-node-process-env-alias');
    requiredReader('AP98_EMBEDDED_COMPUTED', 'docker/ap98-embedded-program-fixture.sh', 'embedded-node-process-env-computed');
    requiredReader('AP98_EMBEDDED_HELPER', 'docker/ap98-embedded-program-fixture.sh', 'embedded-node-process-env-computed-helper');
    requiredReader('AP98_EMBEDDED_ARGUMENT_HELPER', 'docker/ap98-embedded-program-fixture.sh', 'embedded-node-process-env-computed-helper');
    requiredReader('AP98_NODE_INLINE', 'docker/ap98-embedded-program-fixture.sh', 'embedded-node-process-env-alias');
    for (const name of ['AP98_PYTHON_GETENV', 'AP98_PYTHON_GET', 'AP98_PYTHON_INDEX']) requiredReader(name, 'docker/ap98-embedded-program-fixture.sh', 'embedded-python-process-env');
  } finally {
    restoreEnvironmentFixture();
    runGenerator();
  }
  console.log('PASS nested shell environment input and quoted-heredoc negative control');

  if (environmentSecretOnly) {
    const focusedBaseline = runGenerator('--check');
    assert.equal(focusedBaseline.status, 0, `focused Env/Secret baseline did not recover\n${focusedBaseline.stdout}\n${focusedBaseline.stderr}`);
    console.log('PASS focused Env/Secret mutation matrix and baseline recovery');
    process.exit(0);
  }

  const cliFixturePath = path.join(temporaryRoot, 'scripts/ap98-cli-derived-fixture.sh');
  fs.writeFileSync(cliFixturePath, `#!/usr/bin/env bash
GLOBAL_CANARY="\${1:-global}"
first_scope() {
  local FLOW_CANARY="$(
    printf '%s' "\${2:-first}"
  )"
  printf '%s\\n' "$FLOW_CANARY"
  FLOW_CANARY="\${3:-second}"
  printf '%s\\n' "$FLOW_CANARY"
}
second_scope() {
  printf '%s\\n' "$FLOW_CANARY"
}
export CHILD_CANARY="$(printf '%s' "\${4:-child}")"
env >/dev/null
UNSUPPORTED_CANARY=$((1 + 2))
printf '%s\\n' "$UNSUPPORTED_CANARY"
kubectl get pods \\
  --namespace "$GLOBAL_CANARY"
LENGTH_CANARY="\${#GLOBAL_CANARY}"
printf '%s\\n' "$LENGTH_CANARY"
LATE_EXPORT_CANARY="\${5:-late-export}"
export LATE_EXPORT_CANARY
env >/dev/null
PREFIX_CANARY="\${6:-prefix}" \\
  env >/dev/null
set_global_flow() {
  GLOBAL_FLOW_CANARY="\${7:-global-flow}"
}
set_global_flow
printf '%s\\n' "$GLOBAL_FLOW_CANARY"
set_early_flow() {
  if [[ -n \${8:-} ]]; then
    EARLY_FLOW_CANARY="\${8:-early-first}"
    return 0
  fi
  EARLY_FLOW_CANARY="\${9:-early-second}"
}
set_early_flow
printf '%s\\n' "$EARLY_FLOW_CANARY"
set_exclusive_flow() {
  if [[ -n \${10:-} ]]; then
    EXCLUSIVE_FLOW_CANARY="\${10:-exclusive-first}"
  else
    EXCLUSIVE_FLOW_CANARY="\${11:-exclusive-second}"
  fi
}
set_exclusive_flow
printf '%s\\n' "$EXCLUSIVE_FLOW_CANARY"
set_uninvoked_flow() {
  UNINVOKED_FLOW_CANARY="\${12:-uninvoked}"
}
printf '%s\\n' "$UNINVOKED_FLOW_CANARY"
`, 'utf8');
  const fakeTypeScriptPath = path.join(temporaryRoot, 'scripts/ap98-cli-negative-fixture.mjs');
  fs.writeFileSync(fakeTypeScriptPath, `const labels = ['--not-a-parser-definition', 'process.env.AP98_STRING_ONLY'];\nprocess.stdout.write(labels.join('\\n'));\n`, 'utf8');
  const fixtureResult = runGenerator('--allow-semantic-gaps');
  assert.equal(fixtureResult.status, 0, `CLI/derived fixture generation failed\n${fixtureResult.stdout}\n${fixtureResult.stderr}`);
  runtimeInventory = JSON.parse(fs.readFileSync(path.join(outputDirectory, 'configuration-runtime-inputs.json'), 'utf8'));
  assert.equal(runtimeInventory.cliFlags.some((item) => item.name === '--not-a-parser-definition'), false, 'bare string array became a CLI definition');
  assert.equal(runtimeInventory.environment.some((item) => item.name === 'AP98_STRING_ONLY'), false, 'process.env text inside a JavaScript string became an environment input');
  const externalInvocation = runtimeInventory.cliFlags.find((item) => item.path === 'scripts/ap98-cli-derived-fixture.sh' && item.name === '--namespace');
  assert.equal(externalInvocation, undefined, 'external kubectl flag entered the owned CLI definition inventory');
  const flowAssignments = runtimeInventory.derivedValues
    .filter((item) => item.path === 'scripts/ap98-cli-derived-fixture.sh' && item.name === 'FLOW_CANARY')
    .sort((left, right) => left.line - right.line);
  assert.equal(flowAssignments.length, 2, 'fixture did not retain both FLOW_CANARY definitions');
  assert.match(flowAssignments[0].formula, /printf '%s' "\$\{2:-first\}"/u, 'multiline command substitution was truncated');
  assert.ok(flowAssignments[0].inputs.includes('shell positional $2'), 'multiline formula lost its positional input');
  assert.deepEqual(flowAssignments[0].consumers.map((item) => item.line), [7], 'first definition flowed beyond its same-scope reassignment');
  assert.deepEqual(flowAssignments[1].consumers.map((item) => item.line), [9], 'second definition crossed into another function scope');
  const exportedChild = runtimeInventory.derivedValues.find((item) => item.path === 'scripts/ap98-cli-derived-fixture.sh' && item.name === 'CHILD_CANARY');
  assert.ok(exportedChild?.consumers.some((item) => item.kind === 'exported-child-process-environment-edge' && item.line === 14), 'exported value lacks its child-process edge');
  const unsupported = runtimeInventory.derivedValues.find((item) => item.path === 'scripts/ap98-cli-derived-fixture.sh' && item.name === 'UNSUPPORTED_CANARY');
  assert.equal(unsupported?.classification, 'unsupported-derived', 'unsupported arithmetic syntax was not classified truthfully');
  assert.equal(unsupported?.formula, '<unsupported shell syntax; inspect source>', 'unsupported arithmetic syntax published an invented formula');
  const length = runtimeInventory.derivedValues.find((item) => item.path === 'scripts/ap98-cli-derived-fixture.sh' && item.name === 'LENGTH_CANARY');
  assert.ok(length?.inputs.includes('GLOBAL_CANARY'), '${#VAR} lost VAR and was mistaken for shell positional $#');
  assert.equal(length?.inputs.includes('shell positional $#'), false, '${#VAR} was mistaken for shell positional $#');
  const lateExport = runtimeInventory.derivedValues.find((item) => item.path === 'scripts/ap98-cli-derived-fixture.sh' && item.name === 'LATE_EXPORT_CANARY');
  assert.ok(lateExport?.consumers.some((item) => item.kind === 'exported-child-process-environment-edge'), 'separate export statement lacks its child-process edge');
  const prefixedChild = runtimeInventory.derivedValues.find((item) => item.path === 'scripts/ap98-cli-derived-fixture.sh' && item.name === 'PREFIX_CANARY');
  assert.ok(prefixedChild?.consumers.some((item) => item.kind === 'child-process-environment-edge'), 'environment-prefix assignment lacks its child-process edge');
  const globalFlow = runtimeInventory.derivedValues.find((item) => item.path === 'scripts/ap98-cli-derived-fixture.sh' && item.name === 'GLOBAL_FLOW_CANARY');
  assert.ok(globalFlow?.consumers.some((item) => item.kind === 'shell-global-conditional-return-edge'), 'function-global assignment lacks its call edge');
  assert.ok(globalFlow?.consumers.some((item) => item.kind === 'shell-global-conditional-post-call-use'), 'function-global assignment did not reach its actual post-call use');
  for (const name of ['EARLY_FLOW_CANARY', 'EXCLUSIVE_FLOW_CANARY']) {
    const values = runtimeInventory.derivedValues.filter((item) => item.path === 'scripts/ap98-cli-derived-fixture.sh' && item.name === name);
    assert.equal(values.length, 2, `${name}: fixture did not retain both mutually exclusive definitions`);
    for (const value of values) {
      assert.ok(value.consumers.some((item) => item.kind === 'shell-global-conditional-return-edge'), `${name}:${value.line}: branch assignment lacks its call edge`);
      assert.ok(value.consumers.some((item) => item.kind === 'shell-global-conditional-post-call-use'), `${name}:${value.line}: branch assignment lacks its actual post-call use`);
    }
  }
  const uninvokedFlow = runtimeInventory.derivedValues.find((item) => item.path === 'scripts/ap98-cli-derived-fixture.sh' && item.name === 'UNINVOKED_FLOW_CANARY');
  assert.equal(uninvokedFlow?.consumers.some((item) => item.kind.startsWith('shell-global-conditional')), false,
    'assignment in an uninvoked function fabricated an external data-flow edge');
  assert.equal(uninvokedFlow?.classification, 'unused-derived', 'uninvoked function assignment was presented as runtime-derived');
  console.log('PASS structured CLI negative control and scoped shell data-flow controls');
  }
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}

console.log('All configuration documentation drift mutations passed.');
