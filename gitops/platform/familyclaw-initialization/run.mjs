import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSync, privateDecrypt, createDecipheriv, constants, X509Certificate} from 'node:crypto';
import {setTimeout} from 'node:timers/promises';

const revision = '1a872d74bedc4a0dc37fb619c8d72378ef32cc04';
const namespace = 'familyclaw';
const context = 'familyclaw-initialization';
const endpoint = 'http://paperless-ngx.paperless.svc.cluster.local:8000';
const base = '/work';
const sa = '/var/run/secrets/kubernetes.io/serviceaccount';

function kubectl(args, body) {
  try {
    return execFileSync('kubectl', ['--kubeconfig', `${base}/kubeconfig`, ...args], {
      input: body ? JSON.stringify(body) : undefined, encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    });
  } catch {throw new Error('INITIALIZATION_KUBERNETES_OPERATION_FAILED');}
}
const client = {
  get(kind, name) {
    // The Namespace is created and tracked by this Argo Application first.
    if (kind === 'Namespace') return {metadata: {name: namespace}};
    const result = kubectl(['-n', namespace, 'get', kind, name, '--ignore-not-found', '-o', 'json']);
    return result.trim() ? JSON.parse(result) : null;
  },
  create(document, namespaced = true, allowConflict = false) {
    if (!namespaced) throw new Error('INITIALIZATION_NAMESPACE_NOT_MANAGED');
    try {kubectl(['-n', namespace, 'create', '-f', '-'], document); return true;}
    catch (error) {
      if (allowConflict && this.get(document.kind, document.metadata.name)) return false;
      throw error;
    }
  },
};

async function main() {
  fs.mkdirSync(base, {recursive: true});
  fs.writeFileSync(`${base}/kubeconfig`, JSON.stringify({apiVersion: 'v1', kind: 'Config',
    'current-context': context,
    clusters: [{name: context, cluster: {server: 'https://kubernetes.default.svc', 'certificate-authority': `${sa}/ca.crt`}}],
    users: [{name: context, user: {tokenFile: `${sa}/token`}}],
    contexts: [{name: context, context: {cluster: context, user: context, namespace}}],
  }), {mode: 0o600});
  // The deployment repository key is read-only and is never logged.
  fs.copyFileSync('/repository/sshPrivateKey', `${base}/repository-key`);
  fs.chmodSync(`${base}/repository-key`, 0o600);
  const env = {...process.env, GIT_SSH_COMMAND: `ssh -i ${base}/repository-key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/known-hosts/ssh_known_hosts`};
  const git = args => execFileSync('git', args, {env, stdio: 'pipe', timeout: 60000});
  git(['init', `${base}/source`]);
  git(['-C', `${base}/source`, 'fetch', '--depth=1', 'ssh://git@ssh.github.com:443/datrab/Familyclaw.git', revision]);
  git(['-C', `${base}/source`, 'checkout', '--detach', 'FETCH_HEAD']);
  fs.rmSync(`${base}/repository-key`, {force: true});
  const {initializeHousehold, createBundle} = await import(`${base}/source/tools/deployment/initialize-household.mjs`);
  const binding = {context, namespace, paperlessUrl: endpoint};
  let transferred;
  if (!client.get('Secret', 'familyclaw-initialization')) {
    const transport = generateKeyPairSync('rsa', {modulusLength: 2048,
      publicKeyEncoding: {type: 'spki', format: 'pem'}, privateKeyEncoding: {type: 'pkcs8', format: 'pem'}});
    console.log(JSON.stringify({state: 'waiting-for-encrypted-paperless-binding', publicKey: transport.publicKey}));
    while (!fs.existsSync(`${base}/envelope.json`)) await setTimeout(1000);
    const envelope = JSON.parse(fs.readFileSync(`${base}/envelope.json`, 'utf8'));
    const key = privateDecrypt({key: transport.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, Buffer.from(envelope.key, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    transferred = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString());
    fs.rmSync(`${base}/envelope.json`, {force: true});
    if (transferred.paperlessUrl !== endpoint || !transferred.token) throw new Error('INITIALIZATION_PROVIDER_BINDING_MISMATCH');
    const certificate = new X509Certificate(transferred.tls['tls.crt']);
    if (!certificate.checkHost('familyclaw-database.familyclaw')) throw new Error('INITIALIZATION_TLS_HOST_MISMATCH');
    const response = await fetch(`${endpoint}/api/documents/?page_size=1`, {headers: {Authorization: `Token ${transferred.token}`}, signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('INITIALIZATION_PAPERLESS_AUTHENTICATION_FAILED');
    const data = await response.json();
    if (!Number.isInteger(data.count) || data.count < 1) throw new Error('INITIALIZATION_PAPERLESS_DOCUMENTS_NOT_VISIBLE');
    console.log(JSON.stringify({paperlessAuthenticated: true, visibleDocuments: data.count}));
  }
  const result = initializeHousehold(binding, client, () => transferred.token,
    (actualBinding, token) => createBundle(actualBinding, token, () => transferred.tls));
  console.log(JSON.stringify(result));
  // Explicit one-shot Argo operation; no automatic workload pruning or sync.
  kubectl(['-n', 'argocd', 'patch', 'application', 'familyclaw', '--type=merge', '--patch-file=/dev/stdin'],
    {operation: {initiatedBy: {username: 'familyclaw-initialization'}, sync: {revision, prune: false, syncStrategy: {apply: {}}}}});
  console.log(JSON.stringify({argoSyncRequested: true, revision}));
}

try {await main();} catch {
  console.error('Familyclaw initialization failed; credentials and provider responses were suppressed.');
  process.exitCode = 1;
}
