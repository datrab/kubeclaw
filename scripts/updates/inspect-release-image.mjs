import path from 'node:path';
import fs from 'node:fs';
import { selectedRelease } from './deployment-release.mjs';
import { ghcrDescriptorReader } from './ghcr-descriptor-reader.mjs';
import { resolveOciImageIdentity } from './oci-image-identity.mjs';

const [family, name, platformInput, tokenFile, unexpected] = process.argv.slice(2);
const [os, architecture, variant, extra] = (platformInput ?? '').split('/');
if (!family || !name || !os || !architecture || extra !== undefined || unexpected !== undefined) {
  throw new Error('Usage: node scripts/updates/inspect-release-image.mjs <runtime|ops> <image-slot> <os/architecture[/variant]> [registry-bearer-token-file]');
}
const receipt = selectedRelease(path.resolve('.'), family);
if (!Object.hasOwn(receipt.images, name)) throw new Error('OCI_SELECTED_IMAGE_SLOT_REQUIRED');
const image = receipt.images[name];
const identity = await resolveOciImageIdentity({ image, platform: { os, architecture,
  ...(variant === undefined ? {} : { variant }) }, read: ghcrDescriptorReader(image, { token: tokenFile === undefined ? undefined : fs.readFileSync(tokenFile, 'utf8').trim() }) });
console.log(JSON.stringify({ schemaVersion: 'release-image-descriptor-identity.v1', sourceCommit: receipt.commit,
  sourceRunId: receipt.sourceRunId, sourceRunAttempt: receipt.sourceRunAttempt, slot: name, ...identity,
  scope: 'descriptor-relationships-only', layersVerified: false, runningContainerVerified: false,
  activeBundleVerified: false }, null, 2));
