import { registryClientOrigin } from '../../../scripts/registry-client-config.mjs';

/** Non-secret E2E projection of the same operator contract consumed by Buster. */
export function realE2ERegistryTarget(environment = process.env) {
  if (environment.KUBECLAW_LOCAL_REGISTRY !== undefined) {
    throw new Error('REAL_E2E_LEGACY_REGISTRY_OVERRIDE: use KUBECLAW_REGISTRY_CONFIG');
  }
  const raw = environment.KUBECLAW_REGISTRY_CONFIG;
  if (!raw) throw new Error('REAL_E2E_REGISTRY_CONFIG_REQUIRED: supply the operator registry-clients.v1 contract');
  const origin = registryClientOrigin(JSON.parse(raw));
  return Object.freeze({ origin, host: new URL(origin).host });
}

/** A seed image is explicit, immutable, and served by the configured writable registry. */
export function realE2EDeploymentImage(environment = process.env) {
  const image = environment.REAL_E2E_DEPLOYMENT_IMAGE;
  if (!image) throw new Error('REAL_E2E_DEPLOYMENT_IMAGE_REQUIRED: supply the published immutable release image');
  const match = /^(?<host>[a-z0-9.-]+(?::[0-9]{1,5})?)\/(?<repository>[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*)(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?@(?<digest>sha256:[a-f0-9]{64})$/u.exec(image);
  if (!match || image !== image.trim()) throw new Error('REAL_E2E_DEPLOYMENT_IMAGE_INVALID: expected an immutable SHA-256 image reference');
  if (match.groups.host !== realE2ERegistryTarget(environment).host) {
    throw new Error('REAL_E2E_DEPLOYMENT_IMAGE_REGISTRY_MISMATCH');
  }
  return Object.freeze({ reference: image, repository: match.groups.repository, digest: match.groups.digest });
}
