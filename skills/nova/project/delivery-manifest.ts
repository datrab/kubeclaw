import { portableJson } from '@kubeclaw/plugin-sdk';
import { DELIVERY_MANIFEST_ENCODING } from '@kubeclaw/delivery-manifest-contract';

export { DELIVERY_MANIFEST_ENCODING };
export type ProjectDeliveryManifestMode = 'legacy' | typeof DELIVERY_MANIFEST_ENCODING;

export function assertProjectDeliveryManifestMode(value: ProjectDeliveryManifestMode): void {
  if (value !== 'legacy' && value !== DELIVERY_MANIFEST_ENCODING) {
    throw new Error('PROJECT_DELIVERY_MANIFEST_ENCODING_INVALID');
  }
}

export function storedDeliveryManifestMode(stored: readonly { readonly id: string; readonly type: string;
  readonly config: Readonly<Record<string, unknown>> }[]): ProjectDeliveryManifestMode {
  const summaries = stored.filter(stage => stage.id === 'project-summary'
    && stage.type === 'kubeclaw.report.project-summary');
  const wrong = stored.filter(stage => (stage.id === 'project-summary') !== (stage.type === 'kubeclaw.report.project-summary'));
  if (summaries.length !== 1 || wrong.length !== 0) throw new Error('PROJECT_RECOVERY_SUMMARY_NODE_INVALID');
  for (const stage of stored) {
    portableJson(stage.config);
    if (stage !== summaries[0] && Object.hasOwn(stage.config, 'deliveryManifestEncoding')) {
      throw new Error('PROJECT_RECOVERY_DELIVERY_SELECTOR_FOREIGN');
    }
  }
  const config = summaries[0]!.config;
  const keys = Object.keys(config);
  if (keys.length === 0) return 'legacy';
  if (keys.length !== 1 || keys[0] !== 'deliveryManifestEncoding'
    || config.deliveryManifestEncoding !== DELIVERY_MANIFEST_ENCODING) {
    throw new Error('PROJECT_RECOVERY_DELIVERY_MANIFEST_ENCODING_INVALID');
  }
  return DELIVERY_MANIFEST_ENCODING;
}
