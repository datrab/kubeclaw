// Reviewed static constructors copied from exact whole authenticated source6fa.
// These are ordinary module code, never eval/import/compile of input source bytes.
export function historicalPrismEnvironmentDeclarations() {
 const declarations=[];
 const addEnvironmentConsumerContract=(name,path,raw)=>declarations.push({name,path,raw});
const environmentContract = ({ purpose, acceptedForm, defaultBehavior, emptyBehavior, invalidBehavior, precedence, precedenceSteps, impact, failure, required = 'conditional', evidence = [] }) => ({
  purpose,
  acceptedForm,
  defaultBehavior,
  emptyBehavior,
  invalidBehavior,
  precedence,
  ...(precedenceSteps ? { precedenceSteps } : {}),
  impact,
  failure,
  required,
  evidence,
});

for (const [sourcePath, purpose, failure] of [
  ['skills/prism/server/control-config.ts', 'Authenticates Control dispatch to the Prism worker when SPIFFE workload identity is disabled.', 'Control startup stops with `PRISM_WORKER_SECRET is required`.'],
  ['skills/prism/server/worker-config.ts', 'Authenticates requests received by the Prism worker when SPIFFE workload identity is disabled.', 'Worker startup stops with `PRISM_WORKER_SECRET is required`.'],
  ['skills/prism/config/native-worker.ts', 'Authenticates native-worker artifact and dispatch traffic when SPIFFE workload identity is disabled.', 'Native-worker configuration stops with `PRISM_NATIVE_ARTIFACT_AUTH_REQUIRED`.'],
]) addEnvironmentConsumerContract('PRISM_WORKER_SECRET', sourcePath, environmentContract({
  purpose,
  acceptedForm: 'A non-empty shared secret when `WORKER_TRUST_SPIFFE_ENABLED` is not exactly `true`.',
  defaultBehavior: 'Uses an empty internal value only when SPIFFE workload identity is exactly enabled.',
  emptyBehavior: 'Accepted only with `WORKER_TRUST_SPIFFE_ENABLED=true`; otherwise startup rejects it.',
  invalidBehavior: 'The reader does not impose a character format. A value that differs from the peer causes authentication failure.',
  precedence: 'The receiving process reads its captured environment once at startup. Exact SPIFFE enablement removes the shared-secret requirement.',
  impact: 'Changing the value requires every shared-secret producer and consumer at this trust boundary to change together.',
  failure,
  required: 'required when SPIFFE workload identity is not exactly `true`',
}));

for (const name of ['PRISM_NATIVE_POOL_POLICY_FILE', 'PRISM_NATIVE_LAUNCHER']) addEnvironmentConsumerContract(name, 'skills/prism/config/native-worker.ts', environmentContract({
  purpose: name.endsWith('POLICY_FILE') ? 'Selects the signed/owned native-worker pool policy read by the Prism supervisor.' : 'Selects the privileged native-worker launcher executable used by the Prism supervisor.',
  acceptedForm: 'A non-empty canonical absolute path other than filesystem root.', defaultBehavior: 'No default.', emptyBehavior: 'An absent or empty value is rejected.',
  invalidBehavior: `A relative, non-canonical, empty, or root path returns \`PRISM_NATIVE_PATH_REQUIRED:${name}\`; the selected file then has its own identity and ownership checks.`,
  precedence: 'The process value is the only path source.', impact: 'Changing the path changes the native isolation authority or executable and requires a new host acceptance proof.',
  failure: 'The native supervisor stops before opening the pool or launcher.', required: 'required',
}));

for (const name of ['PRISM_PRODUCT_ORIGIN', 'PRISM_PRODUCT_CONTROLLER_URL', 'PRISM_PRODUCT_OPERATORS', 'PRISM_PRODUCT_PRIVATE_KEY_FILE', 'PRISM_PRODUCT_ISSUER', 'PRISM_PRODUCT_CONTROLLER_CA_FILE', 'PRISM_PRODUCT_CONTROLLER_TOKEN_FILE']) {
  const url = name === 'PRISM_PRODUCT_ORIGIN' || name === 'PRISM_PRODUCT_CONTROLLER_URL';
  const operators = name === 'PRISM_PRODUCT_OPERATORS';
  const privateKey = name === 'PRISM_PRODUCT_PRIVATE_KEY_FILE';
  addEnvironmentConsumerContract(name, 'skills/prism/control/product-decisions.ts', environmentContract({
    purpose: `${name} supplies ${url ? 'one HTTPS product-decision authority endpoint' : operators ? 'the explicit product-operator allow-list' : privateKey ? 'the dedicated product-decision signing key file' : 'one required product-decision authority value'}.`,
    acceptedForm: url ? 'An HTTPS origin with no credentials, query, fragment, or path other than `/`.' : operators ? 'A JSON array of unique, non-empty, already-trimmed strings.' : privateKey ? 'A readable file containing a dedicated Ed25519 private key.' : 'A non-empty string after trimming.',
    defaultBehavior: 'No value is read while product decisions are disabled; no default exists when enabled.',
    emptyBehavior: `When product decisions are enabled, an absent, empty, or whitespace-only value returns \`${name} is required\`.`,
    invalidBehavior: url ? 'A non-HTTPS or non-origin URL returns `product authority requires HTTPS origins`.' : operators ? 'Malformed JSON or an empty, duplicated, or untrimmed list returns `explicit product operator allowlist is required`.' : privateKey ? 'Read failure or a non-Ed25519 key stops composition.' : 'The reader requires non-empty trimmed text; the downstream controller connection validates the selected file or identity.',
    precedence: 'Exact `PRISM_PRODUCT_DECISIONS_ENABLED=true` activates the captured startup environment; no other source overrides it.',
    impact: 'Changing this authority input changes who can issue, receive, or approve signed product decisions.',
    failure: 'Control composition stops before the product-decision endpoint becomes available.', required: 'required only when product decisions are exactly enabled',
  }));
}
const contracts=new Map();
function add(source, name, purpose, acceptedForm, defaultBehavior, emptyBehavior, invalidBehavior, precedence, impact, failure, owningSurface, required = 'optional', boundary = 'checked-in runtime') {
  contracts.set(`${name}:${source}`, { purpose, acceptedForm, defaultBehavior, emptyBehavior, invalidBehavior, precedence, impact, failure, owningSurface, required, boundary, owner: source });
}
const processOnly = 'This reader uses the captured process value. Another process cannot override this reader.';
const studio='skills/prism/server/studio-config.ts';
const control='skills/prism/server/control-config.ts';
add(studio, 'PRISM_INGRESS_SECRET', 'Supplies the shared secret used by Studio to sign Control ingress requests.', 'A string. This loader does not enforce a minimum length.', 'An absent value uses an empty string.', 'An explicit empty value is retained; it is not rejected by this loader.', 'A wrong value makes Control signature verification fail.', processOnly, 'Changing the secret requires matching Control and Studio bindings.', 'Control denies requests signed with a different secret.', 'charts/prism/values.yaml:secrets.runtime; charts/prism/templates/workloads.yaml:PRISM_INGRESS_SECRET');
for (const name of ['PRISM_SESSION_SECRET', 'PRISM_INGRESS_SECRET', 'PRISM_INGESTION_SECRET', 'PRISM_DISPATCH_SECRET']) {
  const conditional = name === 'PRISM_DISPATCH_SECRET';
  add(control, name, `Supplies the ${name === 'PRISM_SESSION_SECRET' ? 'session authentication' : name === 'PRISM_INGRESS_SECRET' ? 'Studio ingress signing' : name === 'PRISM_INGESTION_SECRET' ? 'ingestion authentication' : 'worker dispatch signing'} secret captured by Control at startup.`, 'A non-empty string; this loader does not validate entropy or trim whitespace.', conditional ? 'No secret default. With WORKER_TRUST_SPIFFE_ENABLED exactly true, Control uses an empty dispatch secret and SPIFFE trust instead.' : 'No default.', conditional ? 'Empty is rejected unless SPIFFE trust is enabled.' : 'Empty is rejected by required().', 'An absent or empty required value throws its name followed by is required; wrong non-empty bytes fail authentication later.', conditional ? 'SPIFFE trust mode wins over this environment secret; otherwise the process value is required.' : processOnly, 'Changes the authentication authority; rotate the matching producers and consumers together.', 'Control configuration stops or later requests fail authentication.', 'charts/prism/values.yaml:secrets.runtime; charts/prism/templates/workloads.yaml', conditional ? 'required without SPIFFE trust' : 'required');
}
 for(const [identity,raw] of contracts) { const [name,...source]=identity.split(':'); declarations.push({name,path:source.join(':'),raw}); }
 const selected=new Set([
  "PRISM_WORKER_SECRET:skills/prism/config/native-worker.ts",
  "PRISM_NATIVE_POOL_POLICY_FILE:skills/prism/config/native-worker.ts",
  "PRISM_PRODUCT_ORIGIN:skills/prism/control/product-decisions.ts",
  "PRISM_PRODUCT_CONTROLLER_URL:skills/prism/control/product-decisions.ts",
  "PRISM_PRODUCT_OPERATORS:skills/prism/control/product-decisions.ts",
  "PRISM_PRODUCT_ISSUER:skills/prism/control/product-decisions.ts",
  "PRISM_PRODUCT_CONTROLLER_CA_FILE:skills/prism/control/product-decisions.ts",
  "PRISM_PRODUCT_CONTROLLER_TOKEN_FILE:skills/prism/control/product-decisions.ts",
  "PRISM_INGRESS_SECRET:skills/prism/server/control-config.ts",
  "PRISM_INGRESS_SECRET:skills/prism/server/studio-config.ts",
  "PRISM_DISPATCH_SECRET:skills/prism/server/control-config.ts"
]);
 return declarations.filter(d=>selected.has(`${d.name}:${d.path}`));
}
