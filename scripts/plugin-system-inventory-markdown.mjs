import { ownerKey } from './plugin-system-inventory-build.mjs';

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
  ].join('\n');
}

function summarySection(inventory) {
  return [
    '## Summary',
    '',
    markdownTable(
      ['Files', 'Runtime/support', 'Exported surfaces', 'Local imports', 'Runtime effects', 'Legacy runtime/all', 'Hardcoding runtime/all', 'Registrations', 'Unclassified'],
      [[
        inventory.summary.files,
        `${inventory.summary.runtimeFiles} / ${inventory.summary.supportFiles}`,
        inventory.summary.exportedSurfaces,
        inventory.summary.localImports,
        inventory.summary.privilegedEffects,
        `${inventory.summary.runtimeLegacyContractHits} / ${inventory.summary.legacyContractHits}`,
        `${inventory.summary.runtimeHardcodingHits} / ${inventory.summary.hardcodingHits}`,
        inventory.summary.registrations,
        inventory.summary.unclassified,
      ]],
    ),
  ];
}

function registrationSection(inventory) {
  return [
    '## Target Ownership',
    '',
    markdownTable(['Target owner', 'Files'], inventory.ownerCounts.map((item) => [item.id, item.count])),
    '',
    '## Registration Extraction Matrix',
    '',
    markdownTable(
      ['Current ID', 'Current type/stage', 'Entrypoint', 'Target package', 'Target surface', 'Canonical registration ID'],
      inventory.registrations.map((item) => [
        item.currentId,
        `${item.currentType} / ${item.currentStageId}`,
        `\`${item.entrypoint}\``,
        item.targetPackage,
        item.targetSurface,
        item.targetRegistrationId,
      ]),
    ),
  ];
}

function referenceSection(inventory) {
  return [
    '## Reference Plugin Decision',
    '',
    `Decision: **${inventory.referenceAssessment.decision} ${inventory.referenceAssessment.packageId}** as the first reference extraction.`,
    '',
    ...inventory.referenceAssessment.rationale.map((item) => `- ${item}`),
    '',
    'Evidence:',
    '',
    markdownTable(
      ['Signal', 'Value'],
      Object.entries(inventory.referenceAssessment.evidence).map(([key, value]) => [key, value]),
    ),
    '',
    'Candidate comparison (lower score means a smaller first-extraction blast radius):',
    '',
    'The deterministic score is `runtime files + cross-owner imports + (legacy hits × 3) + (hardcoding hits × 2) + weighted privileged effects + 25 for a currently hardcoded/non-registry behavior + 10 for each additional stage registration`. Effect weights prioritize runtime dispatch, network, command, Redis, Git, and secret authority in that order. The score chooses migration order only; it is not a security rating.',
    '',
    markdownTable(
      ['Candidate package', 'Score', 'Registry-backed', 'Registrations', 'Runtime files', 'Cross-owner imports', 'Effect risk', 'Legacy', 'Hardcoding'],
      inventory.referenceCandidateRanking.map((item) => [
        item.packageId,
        item.score,
        item.currentRegistryBacked,
        item.registrationCount,
        item.runtimeFileCount,
        item.outboundOwnerDependencies,
        item.effectRisk,
        item.legacyContractCount,
        item.hardcodingCount,
      ]),
    ),
  ];
}

function ledgerSection(inventory) {
  return [
    '## Privileged Effect Ledger',
    '',
    markdownTable(['Effect', 'Detected calls', 'Target adapter'], inventory.effectCounts.map((item) => [
      item.id,
      item.count,
      inventory.effectAdapters[item.id],
    ])),
    '',
    '## Legacy Contract Ledger',
    '',
    markdownTable(['Legacy contract', 'Runtime hits', 'All references'], inventory.legacyContractCounts.map((item) => [
      item.id,
      inventory.runtimeLegacyContractCounts.find((runtime) => runtime.id === item.id)?.count ?? 0,
      item.count,
    ])),
    '',
    '## Hardcoding Ledger',
    '',
    markdownTable(['Hardcoding', 'Runtime hits', 'All references'], inventory.hardcodingCounts.map((item) => [
      item.id,
      inventory.runtimeHardcodingCounts.find((runtime) => runtime.id === item.id)?.count ?? 0,
      item.count,
    ])),
  ];
}

function dependencySection(inventory) {
  return [
    '## Cross-Owner Dependency Graph',
    '',
    markdownTable(['From', 'To', 'Imports', 'Examples'], inventory.dependencyGraph.map((edge) => [
      edge.from,
      edge.to,
      edge.count,
      edge.samples.slice(0, 3).map((sample) => `\`${sample}\``).join('<br>'),
    ])),
    '',
    '## Exported Runtime Surface Matrix',
    '',
    markdownTable(
      ['Current path', 'Exported surface', 'Target owner', 'Classification rule'],
      inventory.files
        .filter((file) => file.scope === 'runtime')
        .flatMap((file) => file.exports.map((exported) => [
          `\`${file.path}\``,
          `\`${exported}\``,
          ownerKey(file.target),
          file.target.ruleId,
        ])),
    ),
  ];
}

function classificationSection(inventory) {
  return [
    '## Complete File Classification',
    '',
    markdownTable(
      ['Current path', 'Scope', 'Target', 'Rule', 'Exports', 'Effects', 'Legacy', 'Hardcoding'],
      inventory.files.map((file) => [
        `\`${file.path}\``,
        file.scope,
        ownerKey(file.target),
        file.target.ruleId,
        file.exports.length,
        file.effects.length,
        file.legacyContracts.length,
        file.hardcodings.length,
      ]),
    ),
  ];
}

export function renderMarkdown(inventory) {
  const sections = [
    ['# Plugin System Current Inventory', '', 'Status: generated migration control', 'Audience: maintainers, pipeline developers'],
    ['> Generated by `scripts/plugin-system-inventory.mjs` from `plugin-system-inventory.rules.json`. Do not edit by hand.'],
    ['## Purpose', '', 'Record the complete current ownership, dependency, effect, legacy-contract, and hardcoding surface that must be migrated into the canonical plugin architecture. The exhaustive machine-readable evidence is in [`../generated/inventory/plugin-system.json`](../generated/inventory/plugin-system.json).'],
    summarySection(inventory),
    registrationSection(inventory),
    referenceSection(inventory),
    ledgerSection(inventory),
    dependencySection(inventory),
    classificationSection(inventory),
    ['## Verification', '', '```bash', 'npm run plugin-system:inventory:check', '```', '', 'The check fails when generated evidence is stale, an included file lacks a target owner, a detected privileged effect lacks a declared target adapter, a registration ID is duplicated, or a declared entrypoint is missing.'],
  ];
  return `${sections.flatMap((section, index) => index === 0 ? section : ['', ...section]).join('\n')}\n`;
}
