import fs from 'node:fs';
import path from 'node:path';

// Reading a baseline is not authentication: publication must first run the
// production provenance verifier against this exact immutable bundle path.
export function retainedBaseline(root, directory) {
  if (directory === undefined) return undefined;
  if (!/^releases\/gitops\/[a-z0-9][a-z0-9-]{0,50}$/u.test(directory)) throw new Error('GITOPS_BUNDLE_PATH_INVALID');
  const bundle = JSON.parse(fs.readFileSync(path.join(root, directory, 'bundle.receipt'), 'utf8'));
  if (bundle.schemaVersion !== 'kubeclaw-gitops-bundle.v1' || !bundle.receipt?.code) throw new Error('GITOPS_BUNDLE_SCHEMA_INVALID');
  const { code, ...runtime } = bundle.receipt;
  return { code, runtime };
}
