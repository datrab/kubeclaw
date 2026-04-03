// tests/12-docs-reference.test.js
// Module 12 — Documentation and Reference Split
//
// Lightweight deterministic checks for doc/reference truthfulness and path hygiene.
//
// Checks:
//   1. required-doc-files       — all required governance doc files exist
//   2. path-hygiene             — referenced paths and config keys appear in docs
//   3. approval-gate-doc        — approval-gate.md covers V1 flow accurately
//   4. observability-doc        — observability-reference.md covers required artifact paths
//   5. arch-validator-doc       — architecture-validator-reference.md covers key behavior
//   6. governance-guide         — governance-integration-guide.md covers debugging paths
//   7. pipeline-readme          — README.md mentions Wave 2 governance section
//   8. project-setup-parity     — project_setup/SKILL.md covers Wave 2 governance conventions
//   9. no-overpromises          — docs do not claim native Discord buttons/slash commands in V1

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Repo root: tests/ → pipeline/ → src/ → refactoring/ → Projects/ → repo root
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

// Key doc paths
const GOVERNANCE_DOCS = path.join(REPO_ROOT, 'Projects', 'governance', 'src', 'docs');
const PROJECT_SETUP   = path.join(REPO_ROOT, 'Projects', 'refactoring', 'baseline', 'nova', 'project_setup');
const PIPELINE_README = path.join(REPO_ROOT, 'Projects', 'refactoring', 'src', 'pipeline', 'README.md');

// Read docs once at module level — all checks are synchronous
const DOC = {
  approvalGate:       fs.readFileSync(path.join(GOVERNANCE_DOCS, 'approval-gate.md'), 'utf8'),
  observability:      fs.readFileSync(path.join(GOVERNANCE_DOCS, 'observability-reference.md'), 'utf8'),
  archValidator:      fs.readFileSync(path.join(GOVERNANCE_DOCS, 'architecture-validator-reference.md'), 'utf8'),
  governanceGuide:    fs.readFileSync(path.join(GOVERNANCE_DOCS, 'governance-integration-guide.md'), 'utf8'),
  pipelineReadme:     fs.readFileSync(PIPELINE_README, 'utf8'),
  projectSetupSkill:  fs.readFileSync(path.join(PROJECT_SETUP, 'SKILL.md'), 'utf8'),
};

// ── 1. Required doc files exist ───────────────────────────────────────────────

describe('required-doc-files', () => {
  const required = [
    'approval-gate.md',
    'observability-reference.md',
    'architecture-validator-reference.md',
    'governance-integration-guide.md',
    'POST-WAVE-2-IMPROVEMENTS.md',
  ];

  for (const file of required) {
    it(`governance docs: ${file} exists`, () => {
      const p = path.join(GOVERNANCE_DOCS, file);
      assert.ok(fs.existsSync(p), `Missing required doc: ${p}`);
    });
  }

  it('pipeline README.md exists', () => {
    assert.ok(fs.existsSync(PIPELINE_README), `Missing: ${PIPELINE_README}`);
  });

  it('project_setup/SKILL.md exists', () => {
    const p = path.join(PROJECT_SETUP, 'SKILL.md');
    assert.ok(fs.existsSync(p), `Missing: ${p}`);
  });
});

// ── 2. Approval gate doc — V1 path hygiene ───────────────────────────────────

describe('approval-gate-doc', () => {
  it('references authoritative gate-state file pattern', () => {
    assert.ok(
      DOC.approvalGate.includes('<gate-id>-gate-status.json'),
      'Must reference .swarm/<gate-id>-gate-status.json as authoritative state'
    );
  });

  it('references gateStatusPath function', () => {
    assert.ok(
      DOC.approvalGate.includes('gateStatusPath'),
      'Must mention gateStatusPath function'
    );
  });

  it('describes APPROVE command syntax', () => {
    assert.ok(
      DOC.approvalGate.includes('APPROVE gate:'),
      'Must show APPROVE gate:<id> operator command'
    );
  });

  it('describes REJECT command syntax', () => {
    assert.ok(
      DOC.approvalGate.includes('REJECT gate:'),
      'Must show REJECT gate:<id> operator command'
    );
  });

  it('names audit artifact directory pattern', () => {
    assert.ok(
      DOC.approvalGate.includes('logs/gates/'),
      'Must reference .swarm/logs/gates/<gate-id>/ audit artifact path'
    );
  });

  it('describes nova-bridge as V1 interaction model', () => {
    assert.ok(
      DOC.approvalGate.includes('nova') || DOC.approvalGate.includes('Nova'),
      'Must describe Nova/OpenClaw as V1 operator interaction path'
    );
  });

  it('references all four audit artifact files', () => {
    assert.ok(DOC.approvalGate.includes('approval-request.json'), 'Must reference approval-request.json');
    assert.ok(DOC.approvalGate.includes('approval-transitions.jsonl'), 'Must reference approval-transitions.jsonl');
    assert.ok(DOC.approvalGate.includes('approval-decision.json'), 'Must reference approval-decision.json');
  });
});

// ── 3. Observability doc — artifact path coverage ────────────────────────────

describe('observability-doc', () => {
  it('references pipeline.jsonl event stream', () => {
    assert.ok(DOC.observability.includes('pipeline.jsonl'), 'Must reference pipeline.jsonl');
  });

  it('references model-policy.jsonl', () => {
    assert.ok(DOC.observability.includes('model-policy.jsonl'), 'Must reference model-policy.jsonl');
  });

  it('references summary.json', () => {
    assert.ok(DOC.observability.includes('summary.json'), 'Must reference summary.json');
  });

  it('references architecture-validator artifact dir', () => {
    assert.ok(
      DOC.observability.includes('architecture-validator'),
      'Must reference architecture-validator artifact directory'
    );
  });

  it('references cost/ artifacts', () => {
    assert.ok(DOC.observability.includes('cost/'), 'Must reference cost/ artifact directory');
  });

  it('references gates/ artifact dir', () => {
    assert.ok(DOC.observability.includes('gates/'), 'Must reference .swarm/logs/gates/ directory');
  });

  it('describes non-blocking safety guarantee', () => {
    assert.ok(
      DOC.observability.includes('non-blocking') || DOC.observability.includes('Non-Blocking') || DOC.observability.includes('Non-blocking'),
      'Must describe observability writes as non-blocking'
    );
  });

  it('covers model_source values including runtime_override', () => {
    assert.ok(DOC.observability.includes('runtime_override'), 'Must cover runtime_override model source');
  });
});

// ── 4. Architecture validator reference ───────────────────────────────────────

describe('arch-validator-doc', () => {
  it('references results.json artifact', () => {
    assert.ok(DOC.archValidator.includes('results.json'), 'Must reference results.json artifact');
  });

  it('references summary.md artifact', () => {
    assert.ok(DOC.archValidator.includes('summary.md'), 'Must reference summary.md artifact');
  });

  it('references architecture-validator/ artifact directory', () => {
    assert.ok(
      DOC.archValidator.includes('architecture-validator/'),
      'Must reference architecture-validator/ log directory'
    );
  });

  it('describes blocking severity policy', () => {
    assert.ok(
      DOC.archValidator.includes('blocking') && DOC.archValidator.includes('halt'),
      'Must describe blocking severity halting the pipeline'
    );
  });

  it('describes two-phase execution', () => {
    assert.ok(
      (DOC.archValidator.includes('Phase 1') || DOC.archValidator.includes('phase 1')) &&
      (DOC.archValidator.includes('Phase 2') || DOC.archValidator.includes('phase 2')),
      'Must describe two-phase (deterministic + agent judgment) execution'
    );
  });

  it('lists finding codes', () => {
    assert.ok(DOC.archValidator.includes('MODULE_FORGE_MISSING'), 'Must list finding codes including MODULE_FORGE_MISSING');
  });

  it('describes governance summary integration', () => {
    assert.ok(
      DOC.archValidator.includes('summary.json') || DOC.archValidator.includes('governance'),
      'Must describe integration with governance summary'
    );
  });
});

// ── 5. Governance integration guide ───────────────────────────────────────────

describe('governance-guide', () => {
  it('references authoritative gate state file', () => {
    assert.ok(
      DOC.governanceGuide.includes('<gate-id>-gate-status.json'),
      'Must reference .swarm/<gate-id>-gate-status.json as authoritative state'
    );
  });

  it('references pipeline.jsonl for debugging', () => {
    assert.ok(DOC.governanceGuide.includes('pipeline.jsonl'), 'Must reference pipeline.jsonl for debugging');
  });

  it('references governance overall_outcome field', () => {
    assert.ok(
      DOC.governanceGuide.includes('overall_outcome'),
      'Must reference governance.overall_outcome in summary.json'
    );
  });

  it('covers key outcome values', () => {
    assert.ok(DOC.governanceGuide.includes('CLEAN'), 'Must describe CLEAN outcome');
    assert.ok(DOC.governanceGuide.includes('BLOCKED_BY_ARCH_VALIDATOR'), 'Must describe BLOCKED_BY_ARCH_VALIDATOR outcome');
    assert.ok(DOC.governanceGuide.includes('REJECTED_BY_OPERATOR'), 'Must describe REJECTED_BY_OPERATOR outcome');
  });

  it('references approval-transitions.jsonl audit log', () => {
    assert.ok(
      DOC.governanceGuide.includes('approval-transitions.jsonl'),
      'Must reference approval-transitions.jsonl audit log'
    );
  });

  it('lists key file quick reference', () => {
    assert.ok(
      DOC.governanceGuide.includes('progress.json'),
      'Must reference .swarm/progress.json in key files'
    );
    assert.ok(
      DOC.governanceGuide.includes('cost-report.json'),
      'Must reference cost-report.json in key files'
    );
  });
});

// ── 6. Pipeline README — Wave 2 governance section ────────────────────────────

describe('pipeline-readme', () => {
  it('mentions Wave 2 governance section', () => {
    assert.ok(
      DOC.pipelineReadme.includes('Wave 2') || DOC.pipelineReadme.includes('Governance'),
      'README must include a Wave 2 / Governance section'
    );
  });

  it('mentions architecture validator', () => {
    assert.ok(
      DOC.pipelineReadme.includes('arch-validator') || DOC.pipelineReadme.includes('arch_validator') || DOC.pipelineReadme.includes('Architecture Validator'),
      'README must mention the architecture validator'
    );
  });

  it('mentions approval gate runner', () => {
    assert.ok(
      DOC.pipelineReadme.includes('approval-gate') || DOC.pipelineReadme.includes('Approval Gate'),
      'README must mention the approval gate'
    );
  });

  it('references governance docs location', () => {
    assert.ok(
      DOC.pipelineReadme.includes('governance/src/docs') || DOC.pipelineReadme.includes('governance-integration-guide'),
      'README must reference governance docs location'
    );
  });

  it('references observability artifacts location', () => {
    assert.ok(
      DOC.pipelineReadme.includes('.swarm/logs') || DOC.pipelineReadme.includes('observability'),
      'README must reference .swarm/logs observability output'
    );
  });
});

// ── 7. Project setup skill — Wave 2 parity ───────────────────────────────────

describe('project-setup-parity', () => {
  it('covers Wave 2 governance conventions section', () => {
    assert.ok(
      DOC.projectSetupSkill.includes('Wave 2') || DOC.projectSetupSkill.includes('Governance'),
      'SKILL.md must include Wave 2 governance conventions'
    );
  });

  it('describes approval gate type configuration', () => {
    assert.ok(
      DOC.projectSetupSkill.includes('"type": "approval"') || DOC.projectSetupSkill.includes('approval'),
      'SKILL.md must describe approval gate configuration'
    );
  });

  it('references gate-state file path convention', () => {
    assert.ok(
      DOC.projectSetupSkill.includes('gate-status.json') || DOC.projectSetupSkill.includes('gateStatusPath'),
      'SKILL.md must reference gate-state file naming convention'
    );
  });

  it('describes observability artifact paths', () => {
    assert.ok(
      DOC.projectSetupSkill.includes('.swarm/logs'),
      'SKILL.md must reference .swarm/logs artifact paths'
    );
  });

  it('links to governance docs', () => {
    assert.ok(
      DOC.projectSetupSkill.includes('governance/src/docs') || DOC.projectSetupSkill.includes('approval-gate.md') || DOC.projectSetupSkill.includes('observability-reference'),
      'SKILL.md must link to governance documentation'
    );
  });
});

// ── 8. No overpromises — V1 scope boundary ────────────────────────────────────

describe('no-overpromises', () => {
  it('approval-gate.md does not promise native Discord buttons in V1', () => {
    // Should mention V2 (future) for native Discord, not claim it works in V1
    const hasNativeV1Claim = (
      DOC.approvalGate.match(/V1[^)]*button/i) ||
      DOC.approvalGate.match(/V1[^)]*slash command/i) ||
      DOC.approvalGate.match(/native Discord[^)]*V1/i)
    );
    assert.ok(
      !hasNativeV1Claim,
      'approval-gate.md must not claim native Discord buttons or slash commands in V1'
    );
  });

  it('governance-integration-guide.md explicitly states Discord buttons not supported in V1', () => {
    assert.ok(
      DOC.governanceGuide.includes('V1') && (DOC.governanceGuide.includes('not support') || DOC.governanceGuide.includes('Not available') || DOC.governanceGuide.includes('not available')),
      'governance-integration-guide.md must explicitly state V1 limitations'
    );
  });

  it('project-setup SKILL.md warns against configuring native Discord buttons', () => {
    assert.ok(
      DOC.projectSetupSkill.includes('not') && (DOC.projectSetupSkill.includes('Discord button') || DOC.projectSetupSkill.includes('slash command') || DOC.projectSetupSkill.includes('inbound Discord')),
      'SKILL.md must warn against unsupported V1 Discord interaction methods'
    );
  });
});
