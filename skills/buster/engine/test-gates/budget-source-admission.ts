import type { ProviderConfigurationV1, ProviderConfigurationV2 } from '@kubeclaw/pipeline-test-gate-contract';

/** QB-R02 activation fence, not a snapshot implementation or a new authority.
 * Current runner/loader/session paths carry only ArtifactRefV1 metadata and can
 * reopen mutable storageUrl bytes. None receives an authenticated original
 * producer/inputStore sealed snapshot or its accounting/publication fence.
 * Keep selected Quality execution denied until that complete receiver is wired.
 * Do not accept task/IPC receipt-shaped objects or add an opt-out flag here.
 * Original v1 readers and other selected providers keep their existing ABI.
 */
export function assertBudgetSourceAdmission(configuration: ProviderConfigurationV1 | ProviderConfigurationV2): void {
  if (configuration?.schemaVersion === 'provider-configuration.v2'
    && (configuration.contractId === 'kubeclaw.size-budget@1'
      || configuration.contractId === 'kubeclaw.coverage-budget@1')) {
    throw new Error('BUDGET_SOURCE_RECEIPT_REQUIRED');
  }
}
