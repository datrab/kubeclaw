import {generateKeyPairSync, createPublicKey, createHash} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import https from 'node:https';
import {pathToFileURL} from 'node:url';

export const repository = 'ssh://git@ssh.github.com:443/datrab/Familyclaw.git';
const secretPath = '/api/v1/namespaces/argocd/secrets/familyclaw-repository';
const decode = value => Buffer.from(value ?? '', 'base64').toString();
const encode = value => Buffer.from(value).toString('base64');

export function publicKey(privateKey) {
  const key = createPublicKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Unexpected repository key type');
  const raw = Buffer.from(key.export({format: 'jwk'}).x, 'base64url');
  const field = value => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(value.length);
    return Buffer.concat([length, value]);
  };
  const wire = Buffer.concat([field(Buffer.from('ssh-ed25519')), field(raw)]);
  return {
    publicKey: `ssh-ed25519 ${wire.toString('base64')} familyclaw-argocd-readonly`,
    fingerprint: `SHA256:${createHash('sha256').update(wire).digest('base64').replace(/=+$/u, '')}`,
  };
}

// The Role permits only get/patch of this precreated Secret. Never rotate an
// existing key on retries: GitHub may already have its public half registered.
export async function provision(api) {
  const secret = await api('GET', secretPath);
  const expected = {type: 'git', url: repository, project: 'familyclaw'};
  if (secret.metadata?.labels?.['argocd.argoproj.io/secret-type'] !== 'repository'
    || Object.entries(expected).some(([name, value]) => decode(secret.data?.[name]) !== value)) {
    throw new Error('Repository Secret binding mismatch');
  }
  let privateKey = decode(secret.data?.sshPrivateKey);
  if (!privateKey) {
    privateKey = generateKeyPairSync('ed25519', {
      publicKeyEncoding: {type: 'spki', format: 'pem'},
      privateKeyEncoding: {type: 'pkcs8', format: 'pem'},
    }).privateKey;
    const publicInfo = publicKey(privateKey);
    // Optimistic concurrency: a competing provisioner cannot replace a key.
    await api('PATCH', secretPath, {
      metadata: {resourceVersion: secret.metadata.resourceVersion},
      data: {sshPrivateKey: encode(privateKey)},
    });
    return {...publicInfo, repository};
  }
  return {...publicKey(privateKey), repository};
}

export function clusterApi() {
  const directory = '/var/run/secrets/kubernetes.io/serviceaccount';
  const ca = readFileSync(`${directory}/ca.crt`);
  return (method, path, body) => new Promise((resolve, reject) => {
    const content = body ? JSON.stringify(body) : undefined;
    const request = https.request({
      hostname: 'kubernetes.default.svc', port: 443, path, method, ca,
      headers: {
        authorization: `Bearer ${readFileSync(`${directory}/token`, 'utf8').trim()}`,
        ...(content ? {'content-type': 'application/merge-patch+json'} : {}),
      },
      timeout: 15000,
    }, response => {
      let buffer = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {buffer += chunk;});
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Repository Secret ${method} rejected (${response.statusCode})`));
          return;
        }
        try {resolve(JSON.parse(buffer));} catch {reject(new Error('Invalid Kubernetes response'));}
      });
    });
    request.on('timeout', () => request.destroy(new Error('Repository provisioning timed out')));
    request.on('error', () => reject(new Error('Repository provisioning transport failed')));
    request.end(content);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await provision(clusterApi())));
  } catch {
    console.error('Repository key provisioning failed; no credential values emitted.');
    process.exitCode = 1;
  }
}
