import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { checkpointSkippedAgentPhases } from './checkpoints.mjs';
import { realE2EScenarioSetupContract } from './failure-scenarios.mjs';
import { malformedOutputScenarioConfig } from './malformed-output-publisher.mjs';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pathExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function listFiles(rootDir) {
  const files = [];
  if (!pathExists(rootDir)) return files;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };
  visit(rootDir);
  return files;
}

function readTextIfPresent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function readJsonLines(filePath) {
  const text = readTextIfPresent(filePath);
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readJsonIfPresent(filePath) {
  const text = readTextIfPresent(filePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function rel(workspace, filePath) {
  return path.relative(workspace.projectSrc, filePath);
}

function evidencePass(code, details = {}) {
  return { code, ok: true, ...details };
}

function evidenceFail(code, reason, details = {}) {
  return { code, ok: false, reason, ...details };
}

function restoredCheckpointName(workspace) {
  return workspace?.restoredCheckpoint?.checkpoint || null;
}

function skippedAgentPhasesForWorkspace(workspace) {
  const checkpoint = restoredCheckpointName(workspace);
  if (!checkpoint) return [];
  try {
    return checkpointSkippedAgentPhases(checkpoint);
  } catch {
    return [];
  }
}

function restoredCheckpointSkipsPhase(workspace, phase) {
  return skippedAgentPhasesForWorkspace(workspace).includes(phase);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function typedFieldFailures(actual, expected) {
  const failures = [];
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (JSON.stringify(actual?.[field]) !== JSON.stringify(expectedValue)) {
      failures.push({ field, expected: expectedValue, actual: actual?.[field] ?? null });
    }
  }
  return failures;
}

function assertTypedFields(actual, expected, reason) {
  const field_failures = typedFieldFailures(actual, expected);
  return field_failures.length === 0 ? { ok: true } : { ok: false, reason, field_failures };
}

function assertPresentFields(actual, fields, reason) {
  const missing_fields = fields.filter((field) => actual?.[field] == null || actual?.[field] === '');
  return missing_fields.length === 0 ? { ok: true } : { ok: false, reason, missing_fields };
}

function requiredValuesMissing(values, required) {
  const actual = new Set(values);
  return required.filter((value) => !actual.has(value));
}

function assertOrderedContracts(records, contracts, reason) {
  const matches = [];
  let cursor = -1;
  for (const contract of contracts) {
    const index = records.findIndex((record, candidateIndex) => candidateIndex > cursor
      && typedFieldFailures(contract.map(record), contract.expected).length === 0
      && (contract.presentFields ? assertPresentFields(contract.map(record), contract.presentFields, reason).ok : true));
    if (index < 0) {
      return {
        ok: false,
        reason,
        missing_contract: contract.name,
        expected: contract.expected,
        after_index: cursor,
      };
    }
    matches.push({ name: contract.name, index, record: records[index] });
    cursor = index;
  }
  return { ok: true, matches };
}

function requireFile(workspace, relativePath, code) {
  const filePath = path.join(workspace.swarmDir, relativePath);
  return pathExists(filePath)
    ? evidencePass(code, { path: rel(workspace, filePath) })
    : evidenceFail(code, 'REAL_E2E_MISSING_ARTIFACT', { expected_path: rel(workspace, filePath) });
}

function requireJsonFile(workspace, relativePath, code, validate = null) {
  const filePath = path.join(workspace.swarmDir, relativePath);
  if (!pathExists(filePath)) {
    return evidenceFail(code, 'REAL_E2E_MISSING_ARTIFACT', { expected_path: rel(workspace, filePath) });
  }
  try {
    const data = readJson(filePath);
    const validation = validate ? validate(data, filePath) : null;
    if (validation?.ok === false) return evidenceFail(code, validation.reason || 'REAL_E2E_INVALID_ARTIFACT', { path: rel(workspace, filePath), ...validation });
    return evidencePass(code, { path: rel(workspace, filePath), ...(validation || {}) });
  } catch (error) {
    return evidenceFail(code, 'REAL_E2E_INVALID_JSON_ARTIFACT', { path: rel(workspace, filePath), error: error?.message || String(error) });
  }
}

function requireAnyFile(workspace, candidates, code) {
  for (const relativePath of candidates) {
    const filePath = path.join(workspace.swarmDir, relativePath);
    if (pathExists(filePath)) return evidencePass(code, { path: rel(workspace, filePath) });
  }
  return evidenceFail(code, 'REAL_E2E_MISSING_ARTIFACT', { expected_any_path: candidates.map((candidate) => `.swarm/${candidate}`) });
}

function validateSummaryForWorkspace(workspace) {
  return (data) => {
    if (!data || typeof data !== 'object') return { ok: false, reason: 'REAL_E2E_SUMMARY_NOT_OBJECT' };
    const expectedRunId = primaryExpectedRunId(workspace);
    if (data.run_id !== expectedRunId) return { ok: false, reason: 'REAL_E2E_SUMMARY_RUN_ID_MISMATCH', expected_run_id: expectedRunId, actual_run_id: data.run_id || null };
    if (data.project !== workspace.projectName) return { ok: false, reason: 'REAL_E2E_SUMMARY_PROJECT_MISMATCH', expected_project: workspace.projectName, actual_project: data.project || null };
    if (data.terminal_status !== 'succeeded') return { ok: false, reason: 'REAL_E2E_SUMMARY_NOT_SUCCEEDED', terminal_status: data.terminal_status || null };
    if (!data.governance || typeof data.governance !== 'object') return { ok: false, reason: 'REAL_E2E_SUMMARY_MISSING_GOVERNANCE' };
    if (!data.telemetry_stream_key) return { ok: false, reason: 'REAL_E2E_SUMMARY_MISSING_TELEMETRY_STREAM' };
    return { summary_run_id: data.run_id, terminal_status: data.terminal_status };
  };
}

function validateForgeCompletionForWorkspace() {
  return (data) => {
    if (!isPlainObject(data)) return { ok: false, reason: 'REAL_E2E_FORGE_COMPLETION_NOT_OBJECT' };
    const fieldCheck = assertTypedFields(data, {
      artifact_type: 'forge_completion',
      status: 'READY_FOR_TESTING',
    }, 'REAL_E2E_FORGE_COMPLETION_FIELD_MISMATCH');
    if (!fieldCheck.ok) return fieldCheck;
    const presentCheck = assertPresentFields(data, ['summary', 'evidence', 'completed_at'], 'REAL_E2E_FORGE_COMPLETION_REQUIRED_FIELD_MISSING');
    if (!presentCheck.ok) return presentCheck;
    if (!isPlainObject(data.evidence)) return { ok: false, reason: 'REAL_E2E_FORGE_COMPLETION_EVIDENCE_NOT_OBJECT' };
    if (!Array.isArray(data.evidence.inspected_files) || data.evidence.inspected_files.filter((entry) => typeof entry === 'string' && entry.trim()).length === 0) {
      return { ok: false, reason: 'REAL_E2E_FORGE_COMPLETION_INSPECTED_FILES_MISSING' };
    }
    if (!Array.isArray(data.evidence.consulted_contracts) || data.evidence.consulted_contracts.filter((entry) => typeof entry === 'string' && entry.trim()).length === 0) {
      return { ok: false, reason: 'REAL_E2E_FORGE_COMPLETION_CONTRACT_EVIDENCE_MISSING' };
    }
    if (typeof data.evidence.implementation_notes !== 'string' || !data.evidence.implementation_notes.trim()) {
      return { ok: false, reason: 'REAL_E2E_FORGE_COMPLETION_IMPLEMENTATION_NOTES_MISSING' };
    }
    if (Number.isNaN(Date.parse(data.completed_at))) {
      return { ok: false, reason: 'REAL_E2E_FORGE_COMPLETION_COMPLETED_AT_INVALID', completed_at: data.completed_at };
    }
    return {
      status: data.status,
      completed_at: data.completed_at,
    };
  };
}

function validateArchitectureResultsForWorkspace(workspace) {
  return (data) => {
    if (!isPlainObject(data)) return { ok: false, reason: 'REAL_E2E_ARCH_RESULTS_NOT_OBJECT' };
    if (data.project !== workspace.projectName) {
      return { ok: false, reason: 'REAL_E2E_ARCH_RESULTS_PROJECT_MISMATCH', expected_project: workspace.projectName, actual_project: data.project || null };
    }
    if (data.run_id && data.run_id !== workspace.runId) {
      return { ok: false, reason: 'REAL_E2E_ARCH_RESULTS_RUN_ID_MISMATCH', expected_run_id: workspace.runId, actual_run_id: data.run_id };
    }
    if (data.blocked !== false) return { ok: false, reason: 'REAL_E2E_ARCH_RESULTS_BLOCKED', blocked: data.blocked ?? null };
    if (!Array.isArray(data.findings)) return { ok: false, reason: 'REAL_E2E_ARCH_RESULTS_FINDINGS_NOT_ARRAY' };
    if (typeof data.timestamp !== 'string' || Number.isNaN(Date.parse(data.timestamp))) {
      return { ok: false, reason: 'REAL_E2E_ARCH_RESULTS_TIMESTAMP_INVALID', timestamp: data.timestamp ?? null };
    }
    const invalidFinding = data.findings.find((finding) => !isPlainObject(finding)
      || typeof finding.id !== 'string'
      || typeof finding.severity !== 'string'
      || typeof finding.scope !== 'string'
      || typeof finding.explanation !== 'string'
      || typeof finding.remediation !== 'string');
    if (invalidFinding) return { ok: false, reason: 'REAL_E2E_ARCH_RESULTS_FINDING_CONTRACT_INVALID', finding: invalidFinding };
    return {
      project: data.project,
      finding_count: data.findings.length,
      blocked: data.blocked,
    };
  };
}

function validateEchoReviewForWorkspace(workspace, { gateId, gateType = 'review' } = {}) {
  return (data) => {
    if (!isPlainObject(data)) return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_NOT_OBJECT' };
    const status = String(data.status || '').toUpperCase();
    if (status !== 'PASS') return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_NOT_PASS', status: data.status || null };
    if (data.project && data.project !== workspace.projectName) {
      return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_PROJECT_MISMATCH', expected_project: workspace.projectName, actual_project: data.project };
    }
    if (data.run_id && data.run_id !== workspace.runId) {
      return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_RUN_ID_MISMATCH', expected_run_id: workspace.runId, actual_run_id: data.run_id };
    }
    if (data.gate_id && data.gate_id !== gateId) {
      return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_GATE_ID_MISMATCH', expected_gate_id: gateId, actual_gate_id: data.gate_id };
    }
    if (data.gate_type && data.gate_type !== gateType) {
      return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_GATE_TYPE_MISMATCH', expected_gate_type: gateType, actual_gate_type: data.gate_type };
    }
    if (!Array.isArray(data.critical_issues)) return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_CRITICAL_ISSUES_NOT_ARRAY' };
    if (data.critical_issues.length > 0) return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_HAS_CRITICAL_ISSUES', critical_count: data.critical_issues.length };
    if (!Array.isArray(data.deferred_issues)) return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_DEFERRED_ISSUES_NOT_ARRAY' };
    if (!Array.isArray(data.checked_contracts) || data.checked_contracts.length === 0) {
      return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_CHECKED_CONTRACTS_MISSING' };
    }
    if (!Array.isArray(data.opened_artifacts) || data.opened_artifacts.length === 0) {
      return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_OPENED_ARTIFACTS_MISSING' };
    }
    if (!Array.isArray(data.failed_commands)) return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_FAILED_COMMANDS_NOT_ARRAY' };
    if (data.failed_commands.length > 0) {
      return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_HAS_FAILED_COMMANDS', failed_command_count: data.failed_commands.length };
    }
    if (!Array.isArray(data.unverified_requirements)) return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_UNVERIFIED_REQUIREMENTS_NOT_ARRAY' };
    if (data.unverified_requirements.length > 0) {
      return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_HAS_UNVERIFIED_REQUIREMENTS', unverified_requirement_count: data.unverified_requirements.length };
    }
    if (typeof data.summary !== 'string' || !data.summary.trim()) return { ok: false, reason: 'REAL_E2E_ECHO_REVIEW_SUMMARY_MISSING' };
    return {
      status,
      gate_id: data.gate_id || gateId,
      deferred_count: data.deferred_issues.length,
      checked_contract_count: data.checked_contracts.length,
      opened_artifact_count: data.opened_artifacts.length,
    };
  };
}

function validatePipelineReviewForWorkspace(workspace) {
  return (data) => {
    if (!isPlainObject(data)) return { ok: false, reason: 'REAL_E2E_PIPELINE_REVIEW_NOT_OBJECT' };
    const pipelineRunId = primaryExpectedRunId(workspace);
    const fieldCheck = assertTypedFields(data, {
      status: 'REVIEWED',
      project: workspace.projectName,
      run_id: pipelineRunId,
    }, 'REAL_E2E_PIPELINE_REVIEW_FIELD_MISMATCH');
    if (!fieldCheck.ok) return fieldCheck;
    const arrayFields = ['architecture_observations', 'prompt_effectiveness', 'test_quality', 'config_recommendations', 'improvements_next_run'];
    const invalidArrayField = arrayFields.find((field) => !Array.isArray(data[field]));
    if (invalidArrayField) return { ok: false, reason: 'REAL_E2E_PIPELINE_REVIEW_ARRAY_FIELD_INVALID', field: invalidArrayField };
    if (!isPlainObject(data.agent_performance)) return { ok: false, reason: 'REAL_E2E_PIPELINE_REVIEW_AGENT_PERFORMANCE_INVALID' };
    if (!Array.isArray(data.agent_performance.modules_with_retries) || !Array.isArray(data.agent_performance.common_failure_modes)) {
      return { ok: false, reason: 'REAL_E2E_PIPELINE_REVIEW_AGENT_PERFORMANCE_ARRAY_INVALID' };
    }
    return {
      status: data.status,
      run_id: data.run_id,
      improvement_count: data.improvements_next_run.length,
    };
  };
}

function validateLatestPointerForWorkspace(workspace) {
  return (data) => {
    if (!isPlainObject(data)) return { ok: false, reason: 'REAL_E2E_LATEST_POINTER_NOT_OBJECT' };
    const pipelineRunId = primaryExpectedRunId(workspace);
    const expected = {
      run_id: pipelineRunId,
      status: 'completed',
      terminal_status: 'succeeded',
      telemetry_stream_key: `pipeline:telemetry:${workspace.projectName}:${pipelineRunId}`,
      run_dir: `runs/${pipelineRunId}`,
      path: `runs/${pipelineRunId}`,
      pipeline_jsonl: `runs/${pipelineRunId}/pipeline.jsonl`,
      summary_json: `runs/${pipelineRunId}/summary.json`,
    };
    const fieldCheck = assertTypedFields(data, expected, 'REAL_E2E_LATEST_POINTER_FIELD_MISMATCH');
    if (!fieldCheck.ok) return fieldCheck;
    if (!isPlainObject(data.authority)) return { ok: false, reason: 'REAL_E2E_LATEST_POINTER_AUTHORITY_MISSING' };
    return {
      run_id: data.run_id,
      run_dir: data.run_dir,
      telemetry_stream_key: data.telemetry_stream_key,
    };
  };
}

function normalizeSuiteResults(data) {
  if (Array.isArray(data?.results)) return data.results;
  if (isPlainObject(data?.suites)) return Object.entries(data.suites).map(([suite, result]) => ({ suite, ...result }));
  if (Array.isArray(data?.suite_results)) return data.suite_results;
  return [];
}

function metadataFromK8sResult(data, k8sResult) {
  const candidates = [
    k8sResult?.metadata,
    data?.metadata?.k8s,
    data?.k8s,
    data?.preview,
    data,
  ];
  return candidates.find((candidate) => isPlainObject(candidate) && (
    candidate.preview_url || candidate.previewUrl || candidate.preview_exposure_provider || candidate.previewExpectedText
  )) || null;
}

function staticServingSurfacesForWorkspace(workspace) {
  const runtimeConfig = readJsonIfPresent(path.join(workspace.swarmDir, 'contracts', 'runtime-config.json')) || {};
  const surfaces = runtimeConfig?.static_serving?.surfaces;
  return Array.isArray(surfaces)
    ? surfaces.filter((surface) => typeof surface?.served_as === 'string' && surface.served_as.startsWith('/'))
    : [];
}

function validateStaticSurfacePreviewEvidence(workspace, suites) {
  const surfaces = staticServingSurfacesForWorkspace(workspace);
  if (surfaces.length === 0) return { ok: true };
  const tailscalePreview = suites.get('tailscale-preview');
  if (!isPlainObject(tailscalePreview)) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_MISSING_SUITE', suite: 'tailscale-preview' };
  if (tailscalePreview.status !== 'PASS') return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_SUITE_NOT_PASS', suite: 'tailscale-preview', status: tailscalePreview.status || null };
  const metadata = isPlainObject(tailscalePreview.metadata) ? tailscalePreview.metadata : {};
  const checks = Array.isArray(metadata.static_surface_checks) ? metadata.static_surface_checks : [];
  const missing = [];
  const invalid = [];
  for (const surface of surfaces) {
    const check = checks.find((candidate) => candidate?.path === surface.served_as);
    if (!check) {
      missing.push(surface.served_as);
      continue;
    }
    if (check.passed !== true
      || !(typeof check.url === 'string' && /^https?:\/\//.test(check.url))
      || !(typeof check.body_bytes === 'number' && check.body_bytes > 0)
      || check.expected_text !== surface.expected_marker) {
      invalid.push({
        path: surface.served_as,
        expected_text: surface.expected_marker,
        actual: {
          passed: check.passed ?? null,
          url: check.url ?? null,
          body_bytes: check.body_bytes ?? null,
          expected_text: check.expected_text ?? null,
        },
      });
    }
  }
  if (missing.length > 0) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_STATIC_SURFACE_PREVIEW_MISSING', missing_paths: missing };
  if (invalid.length > 0) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_STATIC_SURFACE_PREVIEW_INVALID', invalid_surfaces: invalid };
  return {
    ok: true,
    static_surface_paths: surfaces.map((surface) => surface.served_as),
  };
}

function validateBusterOutputForWorkspace(workspace) {
  return (data) => {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_NOT_OBJECT' };
  if (data.status !== 'PASS') return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_NOT_PASS', status: data.status || null };
  if (data.project && data.project !== workspace.projectName) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_PROJECT_MISMATCH', expected_project: workspace.projectName, actual_project: data.project || null };
  const suiteResults = normalizeSuiteResults(data);
  const suites = new Map(suiteResults.map((result) => [result?.suite, result]));
  for (const suiteName of ['k8s']) {
    const result = suites.get(suiteName);
    if (!isPlainObject(result)) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_MISSING_SUITE', suite: suiteName };
    if (result.status !== 'PASS') return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_SUITE_NOT_PASS', suite: suiteName, status: result.status || null };
  }
  const k8s = suites.get('k8s');
  const metadata = metadataFromK8sResult(data, k8s);
  if (!isPlainObject(metadata)) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_METADATA_MISSING' };
  const provider = metadata.preview_exposure_provider || metadata.previewExposureProvider || metadata.provider || null;
  const previewUrl = metadata.preview_url || metadata.previewUrl || null;
  const expectedText = metadata.preview_expected_text || metadata.previewExpectedText || null;
  const internalBodyBytes = metadata.internal_body_bytes ?? metadata.internalBodyBytes ?? null;
  const testNamespace = metadata.test_namespace || metadata.testNamespace || null;
  const sourceImage = metadata.source_image || metadata.sourceImage || null;
  const sourceImageId = metadata.source_image_id || metadata.sourceImageId || metadata.image_promotion?.source_image_id || metadata.imagePromotion?.sourceImageId || null;
  const registryImage = metadata.registry_image || metadata.registryImage || null;
  const registryImageDigest = metadata.registry_image_digest || metadata.registryImageDigest || metadata.image_promotion?.registry_image_digest || metadata.imagePromotion?.registryImageDigest || null;
  const imagePromotion = metadata.image_promotion || metadata.imagePromotion || null;
  const progress = readJsonIfPresent(path.join(workspace.swarmDir, 'progress.json')) || {};
  const expectedSourceImage = progress?.gates?.['final-buster']?.test_config?.k8s?.source_image || null;
  if (metadata.purpose && metadata.purpose !== 'final-preview') return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_PURPOSE_MISMATCH', expected_purpose: 'final-preview', actual_purpose: metadata.purpose || null };
  if (provider !== 'tailscale-ingress') return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_EXPOSURE_PROVIDER_MISMATCH', expected_provider: 'tailscale-ingress', actual_provider: provider };
  if (expectedSourceImage && sourceImage !== expectedSourceImage) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_SOURCE_IMAGE_MISMATCH', expected_source_image: expectedSourceImage, actual_source_image: sourceImage };
  if (expectedSourceImage && (typeof registryImage !== 'string' || registryImage.length === 0)) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_REGISTRY_IMAGE_MISSING', registry_image: registryImage };
  if (expectedSourceImage && !isPlainObject(imagePromotion)) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_IMAGE_PROMOTION_MISSING' };
  if (expectedSourceImage && imagePromotion.source_image !== expectedSourceImage) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_PROMOTION_SOURCE_IMAGE_MISMATCH', expected_source_image: expectedSourceImage, actual_source_image: imagePromotion.source_image || null };
  if (expectedSourceImage && imagePromotion.registry_image !== registryImage) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_PROMOTION_REGISTRY_IMAGE_MISMATCH', expected_registry_image: registryImage, actual_registry_image: imagePromotion.registry_image || null };
  if (expectedSourceImage && typeof sourceImageId !== 'string') return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_SOURCE_IMAGE_ID_MISSING', source_image_id: sourceImageId };
  if (expectedSourceImage && typeof registryImageDigest !== 'string') return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_REGISTRY_IMAGE_DIGEST_MISSING', registry_image_digest: registryImageDigest };
  if (typeof testNamespace === 'string' && !testNamespace.startsWith('test-')) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_NAMESPACE_INVALID', test_namespace: testNamespace };
  if (typeof previewUrl !== 'string' || !/^https?:\/\//.test(previewUrl)) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_PREVIEW_URL_INVALID', preview_url: previewUrl };
  const expectedPreviewText = progress?.gates?.['final-buster']?.test_config?.k8s?.preview?.expected_text || 'REAL_E2E_NGINX_OK';
  if (expectedText !== expectedPreviewText) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_PREVIEW_TEXT_MISMATCH', expected_text: expectedPreviewText, actual_text: expectedText };
  if (!(typeof internalBodyBytes === 'number' && internalBodyBytes > 0)) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_INTERNAL_BODY_BYTES_INVALID', internal_body_bytes: internalBodyBytes };
  const checkNames = Array.isArray(metadata.checks) ? metadata.checks.map((check) => check?.name) : [];
  if (checkNames.length > 0) {
    const missingChecks = requiredValuesMissing(checkNames, ['namespace-lease', 'pods-ready', 'health-check', 'preview-url']);
    if (missingChecks.length > 0) return { ok: false, reason: 'REAL_E2E_BUSTER_OUTPUT_K8S_CHECK_MISSING', missing_checks: missingChecks };
  }
  const staticSurfacePreview = validateStaticSurfacePreviewEvidence(workspace, suites);
  if (!staticSurfacePreview.ok) return staticSurfacePreview;
  return {
    status: data.status,
    suites: [...suites.keys()],
    preview_url: previewUrl,
    test_namespace: testNamespace,
    source_image: sourceImage,
    source_image_id: sourceImageId,
    registry_image: registryImage,
    registry_image_digest: registryImageDigest,
    static_surface_paths: staticSurfacePreview.static_surface_paths || [],
  };
  };
}

const BUSTER_FAILURE_REASON_CONTRACTS = Object.freeze({
  buster_module_failure: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'unit',
    suite_status: 'FAIL',
    finding_contains: 'REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE',
  }),
  buster_module_infra_failure: Object.freeze({
    artifact_reason_prefix: 'REAL_E2E_BUSTER_INFRA_UNAVAILABLE',
    suite: 'infra',
    suite_status: 'FAIL',
    finding_contains: 'REAL_E2E_BUSTER_INFRA_UNAVAILABLE',
  }),
  needs_nova_code_failure: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'unit',
    suite_status: 'FAIL',
    finding_contains: 'REAL_E2E_EXPECTED_NEEDS_NOVA_CODE_FAILURE',
  }),
  retry_budget_exhausted: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'unit',
    suite_status: 'FAIL',
    finding_contains: 'REAL_E2E_EXPECTED_RETRY_BUDGET_EXHAUSTED',
  }),
  buster_invalid_completion_identity: Object.freeze({
    artifact_reason_prefix: 'output_file_identity_mismatch',
  }),
  buster_gate_failure: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'unit',
    suite_status: 'FAIL',
    finding_contains: 'REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE',
  }),
  multi_module_dependency_blocked: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'unit',
    suite_status: 'FAIL',
    finding_contains: 'REAL_E2E_EXPECTED_MULTI_MODULE_DEPENDENCY_BLOCKED',
  }),
  multi_module_final_gate_one_module_failure: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'unit',
    suite_status: 'FAIL',
    finding_contains: 'REAL_E2E_EXPECTED_MULTI_MODULE_FINAL_GATE_MODULE_02_FAILURE',
  }),
  k8s_pod_never_ready: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'k8s',
    suite_status: 'FAIL',
    failed_check: 'pods-ready',
    finding_contains: 'Pods not ready within',
  }),
  namespace_lease_denied: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'k8s',
    suite_status: 'FAIL',
    failed_check: 'namespace-prefix',
    finding_contains: 'Invalid k8s namespace_prefix "prod"',
  }),
  tailscale_ingress_creation_failure: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'k8s',
    suite_status: 'FAIL',
    failed_check: 'service-port',
    finding_contains: 'Invalid k8s service port 70000',
  }),
  tailscale_preview_url_unreachable: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'tailscale-preview',
    suite_status: 'FAIL',
    failed_check: 'preview-health-check',
    finding_contains: 'preview-health-check failed',
  }),
  tailscale_preview_wrong_deployment: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'k8s',
    suite_status: 'FAIL',
    failed_check: 'health-check',
    finding_contains: 'REAL_E2E_EXPECTED_DIFFERENT_DEPLOYMENT_MARKER',
  }),
  tailscale_unavailable: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'tailscale-preview',
    suite_status: 'FAIL',
    failed_check: 'dns-resolve',
    finding_contains: 'real-e2e-missing-operator',
  }),
  k8s_context_invalid: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'k8s',
    suite_status: 'FAIL',
    failed_check: 'namespace-lease',
    finding_contains: 'real-e2e-missing-kubeconfig',
  }),
  registry_pull_failure: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'k8s',
    suite_status: 'FAIL',
    failed_check: 'dockerfile-build',
    finding_contains: 'real-e2e-intentional-missing-base',
  }),
  registry_credentials_missing: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'manifest',
    suite_status: 'FAIL',
    finding_contains: 'imagePullSecrets',
  }),
  tailscale_preview_credentials_missing: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'k8s',
    suite_status: 'FAIL',
    failed_check: 'namespace-lease',
    finding_contains: 'real-e2e-missing-tailscale-preview-credentials',
  }),
  required_env_missing: Object.freeze({
    artifact_reason_prefix: 'NO_SUBAGENT:',
    suite: 'manifest',
    suite_status: 'FAIL',
    finding_contains: 'REAL_E2E_REQUIRED_CONFIG_TOKEN',
  }),
});

function busterFailureReasonContract(code) {
  return BUSTER_FAILURE_REASON_CONTRACTS[code] || null;
}

function busterSuiteByName(data, suiteName) {
  if (!suiteName) return null;
  const suites = normalizeSuiteResults(data);
  return suites.find((suite) => suite?.suite === suiteName) || null;
}

function busterFindingMessages(suite) {
  return Array.isArray(suite?.findings)
    ? suite.findings.map((finding) => String(finding?.message || '')).filter(Boolean)
    : [];
}

function busterFailedCheckNames(suite) {
  const checks = Array.isArray(suite?.metadata?.checks) ? suite.metadata.checks : [];
  return checks
    .filter((check) => check?.passed === false)
    .map((check) => String(check?.name || ''))
    .filter(Boolean);
}

function assertBusterFailureReasonContract(data, code) {
  const contract = busterFailureReasonContract(code);
  if (!contract) return { ok: true };
  if (contract.artifact_reason_prefix && !String(data.reason || '').startsWith(contract.artifact_reason_prefix)) {
    return {
      ok: false,
      reason: 'REAL_E2E_BUSTER_FAILURE_REASON_MISMATCH',
      expected_reason_prefix: contract.artifact_reason_prefix,
      actual_reason: data.reason || null,
    };
  }
  const suite = busterSuiteByName(data, contract.suite);
  if (contract.suite && !isPlainObject(suite)) {
    return {
      ok: false,
      reason: 'REAL_E2E_BUSTER_FAILURE_SUITE_MISSING',
      expected_suite: contract.suite,
      available_suites: normalizeSuiteResults(data).map((entry) => entry?.suite).filter(Boolean),
    };
  }
  if (contract.suite_status && suite?.status !== contract.suite_status) {
    return {
      ok: false,
      reason: 'REAL_E2E_BUSTER_FAILURE_SUITE_STATUS_MISMATCH',
      expected_suite: contract.suite,
      expected_status: contract.suite_status,
      actual_status: suite?.status || null,
    };
  }
  if (contract.failed_check) {
    const failedChecks = busterFailedCheckNames(suite);
    if (!failedChecks.includes(contract.failed_check)) {
      return {
        ok: false,
        reason: 'REAL_E2E_BUSTER_FAILURE_CHECK_MISMATCH',
        expected_failed_check: contract.failed_check,
        actual_failed_checks: failedChecks,
      };
    }
  }
  if (contract.finding_contains) {
    const messages = [
      ...busterFindingMessages(suite),
      String(suite?.reason || ''),
      String(suite?.error || ''),
      String(suite?.metadata?.top_finding || ''),
      String(data.summary || ''),
      String(data.reason || ''),
    ].filter(Boolean);
    if (!messages.some((message) => message.includes(contract.finding_contains))) {
      return {
        ok: false,
        reason: 'REAL_E2E_BUSTER_FAILURE_FINDING_MISMATCH',
        expected_finding_contains: contract.finding_contains,
        actual_findings: messages,
      };
    }
  }
  return {
    suite: contract.suite || null,
    failed_check: contract.failed_check || null,
    reason_prefix: contract.artifact_reason_prefix || null,
  };
}

function validateApprovalDecision(data) {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'REAL_E2E_APPROVAL_DECISION_NOT_OBJECT' };
  if (data.status !== 'APPROVED') return { ok: false, reason: 'REAL_E2E_APPROVAL_DECISION_NOT_APPROVED', status: data.status || null };
  if (!String(data.decision_via || '').startsWith('real-e2e-auto-')) {
    return { ok: false, reason: 'REAL_E2E_APPROVAL_DECISION_NOT_FROM_E2E_OPERATOR', decision_via: data.decision_via || null };
  }
  return { status: data.status, decision_via: data.decision_via || null };
}

function validateApprovalDecisionForScenario() {
  return validateApprovalDecision;
}

function requireDiscordAudit(workspace) {
  const logFiles = listFiles(path.join(workspace.swarmDir, 'logs')).filter((filePath) => path.basename(filePath) === 'discord.jsonl');
  if (logFiles.length === 0) {
    return evidenceFail('discord_delivery_audit', 'REAL_E2E_MISSING_DISCORD_AUDIT_LOG', { expected_under: rel(workspace, path.join(workspace.swarmDir, 'logs')) });
  }
  const readFailures = [];
  const entries = [];
  for (const filePath of logFiles) {
    try {
      entries.push(...readJsonLines(filePath).map((entry) => ({ ...entry, _path: filePath })));
    } catch (error) {
      readFailures.push({ path: rel(workspace, filePath), error: error?.message || String(error) });
    }
  }
  const pipelineRunId = primaryExpectedRunId(workspace);
  const matching = entries.find((entry) => {
    const fieldCheck = assertTypedFields(entry, {
      run_id: pipelineRunId,
      project: workspace.projectName,
    }, 'REAL_E2E_DISCORD_AUDIT_FIELD_MISMATCH');
    const presentCheck = assertPresentFields(entry, ['title', 'fields'], 'REAL_E2E_DISCORD_AUDIT_REQUIRED_FIELD_MISSING');
    return fieldCheck.ok && presentCheck.ok && Array.isArray(entry.fields);
  });
  return matching
    ? evidencePass('discord_delivery_audit', { path: rel(workspace, matching._path), files: logFiles.map((filePath) => rel(workspace, filePath)), run_id: matching.run_id, project: matching.project })
    : evidenceFail('discord_delivery_audit', 'REAL_E2E_DISCORD_AUDIT_MISSING_RUN_CONTEXT', {
      files: logFiles.map((filePath) => rel(workspace, filePath)),
      entry_count: entries.length,
      read_failures: readFailures,
      expected: { run_id: pipelineRunId, seed_run_id: workspace.runId, project: workspace.projectName },
    });
}

function requireDiscordDeliveryReceipt(workspace) {
  const pipelineRunId = primaryExpectedRunId(workspace);
  const candidates = [
    path.join(workspace.swarmDir, 'logs/pipeline/discord-deliveries.jsonl'),
    path.join(workspace.swarmDir, 'logs/pipeline/runs', pipelineRunId, 'discord-deliveries.jsonl'),
  ];
  const receipts = [];
  const readFailures = [];
  for (const filePath of candidates) {
    try {
      receipts.push(...readJsonLines(filePath).map((entry) => ({ ...entry, _path: filePath })));
    } catch (error) {
      readFailures.push({ path: rel(workspace, filePath), error: error?.message || String(error) });
    }
  }
  const matching = receipts.filter((entry) => entry.run_id === pipelineRunId && entry.project === workspace.projectName);
  const delivered = matching.find((entry) => entry.ok === true && entry.message_id && entry.channel_id && entry.webhook_message_returned === true);
  const titles = matching.map((entry) => String(entry.title || ''));
  const missingBusterTitles = [
    /Module 01-nginx.+Buster queued/,
    /Suite Results: PASS.+01-nginx/,
  ].filter((pattern) => !titles.some((title) => pattern.test(title)));
  if (!delivered) {
    return evidenceFail('discord_delivery_receipt', 'REAL_E2E_DISCORD_DELIVERY_RECEIPT_MISSING_REAL_MESSAGE', {
      expected_run_id: pipelineRunId,
      seed_run_id: workspace.runId,
      expected_project: workspace.projectName,
      receipt_count: receipts.length,
      matching_count: matching.length,
      read_failures: readFailures,
    });
  }
  if (missingBusterTitles.length > 0) {
    return evidenceFail('discord_delivery_receipt', 'REAL_E2E_DISCORD_DELIVERY_RECEIPT_MISSING_BUSTER_PROGRESS', {
      expected_run_id: pipelineRunId,
      seed_run_id: workspace.runId,
      expected_project: workspace.projectName,
      receipt_count: receipts.length,
      matching_count: matching.length,
      missing_title_patterns: missingBusterTitles.map((pattern) => String(pattern)),
      titles,
      read_failures: readFailures,
    });
  }
  return evidencePass('discord_delivery_receipt', {
    path: rel(workspace, delivered._path),
    message_id: delivered.message_id,
    channel_id: delivered.channel_id,
    buster_progress_titles: titles.filter((title) => /Buster queued|Suite Results/.test(title)),
  });
}

function requireNovaHandoffDeliveryAcknowledgement(workspace, { required = false } = {}) {
  const pipelineRunId = primaryExpectedRunId(workspace);
  const candidates = [
    path.join(workspace.swarmDir, 'logs/pipeline/nova-injections.jsonl'),
    path.join(workspace.swarmDir, 'logs/pipeline/runs', pipelineRunId, 'nova-injections.jsonl'),
  ];
  const entries = [];
  const readFailures = [];
  for (const filePath of candidates) {
    try {
      entries.push(...readJsonLines(filePath).map((entry) => ({ ...entry, _path: filePath })));
    } catch (error) {
      readFailures.push({ path: rel(workspace, filePath), error: error?.message || String(error) });
    }
  }
  const matching = entries.filter((entry) => entry.run_id === pipelineRunId && entry.delivery_content_known === true);
  const deliveredHandoff = matching.find((entry) => entry.status === 'ok'
    && entry.delivery_surface === 'gateway_sessions_send'
    && entry.delivery_acknowledged === true
    && entry.session_key);
  const unacknowledged = matching.filter((entry) => entry.delivery_acknowledged !== true
    || entry.status !== 'ok');
  if (unacknowledged.length > 0) {
    return evidenceFail('nova_handoff_delivery_ack', 'REAL_E2E_NOVA_HANDOFF_DELIVERY_UNACKNOWLEDGED', {
      expected_run_id: pipelineRunId,
      seed_run_id: workspace.runId,
      matching_count: matching.length,
      unacknowledged: unacknowledged.map((entry) => ({
        path: rel(workspace, entry._path),
        status: entry.status ?? null,
        delivery_status: entry.delivery_status ?? null,
        delivery_surface: entry.delivery_surface ?? null,
        step_type: entry.step_type ?? null,
        step_id: entry.step_id ?? null,
        error: entry.error ?? null,
      })),
    });
  }
  if (!deliveredHandoff) {
    if (required) {
      return evidenceFail('nova_handoff_delivery_ack', 'REAL_E2E_NOVA_HANDOFF_DELIVERY_MISSING', {
        expected_run_id: pipelineRunId,
        seed_run_id: workspace.runId,
        matching_count: matching.length,
        read_failures: readFailures,
      });
    }
    return evidencePass('nova_handoff_delivery_ack', {
      matching_count: 0,
      read_failures: readFailures,
    });
  }

  return evidencePass('nova_handoff_delivery_ack', {
    matching_count: matching.length,
    session_key: deliveredHandoff.session_key,
    delivery_session_key: deliveredHandoff.delivery_session_key ?? null,
    turn_id: deliveredHandoff.turn_id ?? null,
    receipt_path: rel(workspace, deliveredHandoff._path),
  });
}

function pipelineLogCandidates(workspace) {
  const runsDir = path.join(workspace.swarmDir, 'logs/pipeline/runs');
  const runScopedCandidates = [];
  if (pathExists(runsDir)) {
    for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      runScopedCandidates.push(
        path.join(runsDir, entry.name, 'lifecycle/canonical-events.jsonl'),
        path.join(runsDir, entry.name, 'pipeline.jsonl'),
      );
    }
  }
  return [
    path.join(workspace.swarmDir, 'logs/pipeline/runs', workspace.runId, 'lifecycle/canonical-events.jsonl'),
    path.join(workspace.swarmDir, 'logs/pipeline/runs', workspace.runId, 'pipeline.jsonl'),
    ...runScopedCandidates,
    path.join(workspace.swarmDir, 'logs/pipeline/pipeline.jsonl'),
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);
}

function detectedPipelineRunId(workspace) {
  const candidates = [];
  const summary = readJsonIfPresent(path.join(workspace.swarmDir, 'logs/pipeline/summary.json'));
  const latest = readJsonIfPresent(path.join(workspace.swarmDir, 'logs/pipeline/latest.json'));
  for (const candidate of [summary?.run_id, latest?.run_id, workspace.runId]) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const runId = candidate.trim();
    if (
      pathExists(path.join(workspace.swarmDir, 'logs/pipeline/runs', runId, 'lifecycle/canonical-events.jsonl'))
      || pathExists(path.join(workspace.swarmDir, 'logs/pipeline/runs', runId, 'pipeline.jsonl'))
      || runId === workspace.runId
    ) {
      candidates.push(runId);
    }
  }
  if (candidates.length > 0) return candidates[0];
  return workspace.runId;
}

function primaryExpectedRunId(workspace) {
  return detectedPipelineRunId(workspace);
}

function readPipelineEvents(workspace) {
  const events = [];
  const readFailures = [];
  for (const filePath of pipelineLogCandidates(workspace)) {
    try {
      events.push(...readJsonLines(filePath).map((entry) => ({ ...entry, _path: filePath })));
    } catch (error) {
      readFailures.push({ path: rel(workspace, filePath), error: error?.message || String(error) });
    }
  }
  return { events, readFailures };
}

function scopedPipelineEvents(workspace, events) {
  const expectedRunId = primaryExpectedRunId(workspace);
  return events.filter((entry) => eventRunId(entry) === expectedRunId && (!eventProject(entry) || eventProject(entry) === workspace.projectName));
}

function readLifecycleReadModels(workspace) {
  const filePath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'runs', primaryExpectedRunId(workspace), 'lifecycle', 'read-models.json');
  if (!pathExists(filePath)) {
    return { ok: false, reason: 'REAL_E2E_LIFECYCLE_READ_MODELS_MISSING', path: rel(workspace, filePath), data: null };
  }
  try {
    return { ok: true, path: rel(workspace, filePath), data: readJson(filePath) };
  } catch (error) {
    return { ok: false, reason: 'REAL_E2E_LIFECYCLE_READ_MODELS_INVALID_JSON', path: rel(workspace, filePath), error: error?.message || String(error), data: null };
  }
}

function eventRunId(event) {
  return event?.refs?.run_id || event?.run_id || event?.data?.run_id || null;
}

function eventProject(event) {
  return event?.project || event?.data?.project || event?.refs?.project || null;
}

function terminalStatusFromEvent(event = {}) {
  if (!event) return null;
  return event.terminal_status
    || event.data?.terminal_status
    || event.result?.terminal_status
    || event.terminal?.status
    || event.status
    || null;
}

function terminalReasonFromEvent(event = {}) {
  if (!event) return null;
  return event.halt_reason
    || event.reason_code
    || event.reason
    || event.data?.halt_reason
    || event.data?.reason_code
    || event.data?.reason
    || event.result?.reason
    || null;
}

function terminalDecisionFromEvent(event = {}) {
  const decision = event?.terminal_decision || event?.data?.terminal_decision || event?.result?.terminal_decision || event?.terminal?.decision || null;
  return isPlainObject(decision) ? decision : null;
}

function terminalEventIdFromEvent(event = {}) {
  return event?.event_id || event?.id || event?.data?.event_id || null;
}

function terminalStepTypeFromEvent(event = {}) {
  if (!event) return null;
  return event.step_type || event.data?.step_type || null;
}

function terminalStepIdFromEvent(event = {}) {
  if (!event) return null;
  return event.step_id || event.data?.step_id || null;
}

function attemptFromEvent(event = {}) {
  const value = event?.refs?.attempt ?? event?.attempt ?? event?.data?.attempt ?? event?.result?.attempt ?? null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function componentFromStep(stepType, stepId) {
  if (stepType === 'arch_validation') return `validator:${stepId || 'arch-validation'}`;
  if (stepType === 'pipeline') return `pipeline:${stepId || 'run'}`;
  if (stepType && stepId) return `${stepType}:${stepId}`;
  return stepType || null;
}

function terminalComponentFromEvent(event = {}) {
  return componentFromStep(terminalStepTypeFromEvent(event), terminalStepIdFromEvent(event));
}

function terminalFailureClassFromEvent(event = {}) {
  const decision = terminalDecisionFromEvent(event);
  return event?.failure_class
    || event?.data?.failure_class
    || event?.result?.failure_class
    || decision?.reasonCode
    || terminalReasonFromEvent(event)
    || terminalStatusFromEvent(event)
    || null;
}

function pipelineEventSchemaFields(event = {}) {
  return {
    event_id: terminalEventIdFromEvent(event),
    event_type: event?.type || null,
    run_id: eventRunId(event),
    project: eventProject(event),
    step_type: terminalStepTypeFromEvent(event),
    step_id: terminalStepIdFromEvent(event),
    attempt: attemptFromEvent(event),
    fail_count_before: Number.isFinite(Number(event?.data?.fail_count_before)) ? Number(event.data.fail_count_before) : null,
    component: terminalComponentFromEvent(event),
    terminal_status: terminalStatusFromEvent(event),
    reason: terminalReasonFromEvent(event),
    failure_class: terminalFailureClassFromEvent(event),
  };
}

function pipelineEventContract(name, expected, presentFields = ['event_id']) {
  return {
    name,
    expected,
    presentFields,
    map: pipelineEventSchemaFields,
  };
}

function terminalContract(fields) {
  return Object.freeze({
    require_event_id: true,
    ...fields,
    component: fields.component || componentFromStep(fields.step_type, fields.step_id),
  });
}

function expectedFailUnitCommand(message) {
  return ['node', '-e', `console.error(${JSON.stringify(String(message))}); process.exit(1)`];
}

function expectedFailOnceUnitCommand() {
  const code = [
    'const fs=require("fs")',
    'const path=require("path")',
    'const marker=path.join(process.cwd(),".swarm","logs","real-e2e-retry-marker.txt")',
    'fs.mkdirSync(path.dirname(marker),{recursive:true})',
    'if(!fs.existsSync(marker)){fs.writeFileSync(marker,"REAL_E2E_EXPECTED_RETRYABLE_FORGE_CODE_FAILURE\\n");console.error("REAL_E2E_EXPECTED_RETRYABLE_FORGE_CODE_FAILURE");process.exit(1)}',
    'console.log("REAL_E2E_RETRY_RECOVERED")',
  ].join(';');
  return ['node', '-e', code];
}

const MODULE_TERMINAL_CONTRACT = terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'failed', failure_class: 'failed' });
const MODULE_INFRA_ERROR_TERMINAL_CONTRACT = terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'blocked', failure_class: 'infra_error' });
const MODULE_TEST_FAILURE_EXHAUSTED_TERMINAL_CONTRACT = terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'blocked', failure_class: 'test_failure' });
const MODULE_ACTION_REQUIRED_TERMINAL_CONTRACT = terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'action_required', failure_class: 'needs_nova' });
const FINAL_BUSTER_TERMINAL_CONTRACT = terminalContract({ event_type: 'pipeline_run.halted', step_type: 'gate', step_id: 'final-buster', terminal_status: 'action_required', failure_class: 'needs_nova' });
const FINAL_BUSTER_VERDICT_FAIL_TERMINAL_CONTRACT = terminalContract({ event_type: 'pipeline_run.halted', step_type: 'gate', step_id: 'final-buster', terminal_status: 'action_required', failure_class: 'verdict_fail' });
const DEGRADED_EVIDENCE_TERMINAL_CONTRACT = terminalContract({ event_type: 'pipeline_run.halted', step_type: 'pipeline', step_id: 'degraded_evidence', terminal_status: 'blocked', failure_class: 'degraded_evidence_requires_handoff' });

const FAILURE_CONTRACTS = Object.freeze({
  'approval-deny': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'gate', step_id: 'operator-approval', terminal_status: 'action_required', failure_class: 'needs_nova' }),
    setup: Object.freeze({ progress: Object.freeze({ 'execution_order.0': 'gate:operator-approval', 'real_e2e.approval_before_modules': true }) }),
  }),
  'approval-timeout-block': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'gate', step_id: 'operator-approval', terminal_status: 'action_required', failure_class: 'needs_nova' }),
    setup: Object.freeze({ progress: Object.freeze({ 'execution_order.0': 'gate:operator-approval', 'real_e2e.approval_before_modules': true }) }),
  }),
  'buster-module-failure': Object.freeze({
    terminal: MODULE_TEST_FAILURE_EXHAUSTED_TERMINAL_CONTRACT,
    setup: Object.freeze({ progress: Object.freeze({ 'modules.01-nginx.test_config.unit.test_cmd': expectedFailUnitCommand('REAL_E2E_EXPECTED_BUSTER_MODULE_FAILURE') }) }),
  }),
  'buster-module-infra-failure': Object.freeze({
    terminal: MODULE_INFRA_ERROR_TERMINAL_CONTRACT,
    setup: Object.freeze({}),
  }),
  'needs-nova-code-failure': Object.freeze({
    terminal: MODULE_ACTION_REQUIRED_TERMINAL_CONTRACT,
    setup: Object.freeze({ progress: Object.freeze({ 'modules.01-nginx.test_config.unit.test_cmd': expectedFailUnitCommand('REAL_E2E_EXPECTED_NEEDS_NOVA_CODE_FAILURE') }) }),
  }),
  'retry-budget-exhausted': Object.freeze({
    terminal: MODULE_TEST_FAILURE_EXHAUSTED_TERMINAL_CONTRACT,
    setup: Object.freeze({
      progress: Object.freeze({
        'modules.01-nginx.max_fails': 2,
        'modules.01-nginx.auto_retry_threshold': 1,
        'modules.01-nginx.test_config.unit.test_cmd': expectedFailUnitCommand('REAL_E2E_EXPECTED_RETRY_BUDGET_EXHAUSTED'),
      }),
    }),
  }),
  'retry-fix-malformed-output': Object.freeze({
    terminal: MODULE_ACTION_REQUIRED_TERMINAL_CONTRACT,
    setup: Object.freeze({
      progress: Object.freeze({
        'modules.01-nginx.max_fails': 3,
        'modules.01-nginx.auto_retry_threshold': 1,
        'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_RETRY_FIX_MALFORMED_TIMEOUT_MINUTES || 15),
        'modules.01-nginx.test_config.unit.test_cmd': expectedFailOnceUnitCommand(),
      }),
    }),
  }),
  'retry-buster-pass-echo-rejects': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'gate', step_id: 'module-review', terminal_status: 'action_required', failure_class: 'needs_nova' }),
    setup: Object.freeze({
      progress: Object.freeze({
        'modules.01-nginx.max_fails': 2,
        'modules.01-nginx.auto_retry_threshold': 1,
        'modules.01-nginx.test_config.unit.test_cmd': expectedFailOnceUnitCommand(),
        'gates.module-review.primary_reviewer': 'echo-codex',
        'gates.module-review.instructions_file': 'echo-review/MODULE-REVIEW-INSTRUCTIONS.md',
        'gates.module-review.output_file': 'logs/echo-review/MODULE-REVIEW.json',
      }),
    }),
  }),
  'forge-malformed-output': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'failed', failure_class: 'invalid_contract' }),
    setup: Object.freeze({ progress: Object.freeze({ 'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_FORGE_MALFORMED_TIMEOUT_MINUTES || 15) }) }),
  }),
  'architecture-validator-block': Object.freeze({
    terminal: terminalContract({
      event_type: 'pipeline.halted',
      step_type: 'arch_validation',
      step_id: 'arch-validation',
      terminal_status: 'blocked',
      reason: 'ARCH_VALIDATION_BLOCKED',
      failure_class: 'ARCH_VALIDATION_BLOCKED',
    }),
    setup: Object.freeze({
      progress: Object.freeze({
        'execution_order.0': 'REAL_E2E_EXPECTED_ARCH_VALIDATOR_UNKNOWN_MODULE',
      }),
    }),
  }),
  'echo-malformed-output': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'gate', step_id: 'module-review', terminal_status: 'failed', failure_class: 'invalid_contract' }),
    setup: Object.freeze({ progress: Object.freeze({ 'gates.module-review.timeout_minutes': Number(process.env.REAL_E2E_ECHO_MALFORMED_TIMEOUT_MINUTES || 0.1) }) }),
  }),
  'buster-invalid-completion-identity': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'failed', failure_class: 'output_file_identity_mismatch' }),
    setup: Object.freeze({ progress: Object.freeze({ 'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_BUSTER_IDENTITY_FAILURE_TIMEOUT_MINUTES || 0.1) }) }),
  }),
  'buster-gate-failure': Object.freeze({
    terminal: FINAL_BUSTER_VERDICT_FAIL_TERMINAL_CONTRACT,
    setup: Object.freeze({ progress: Object.freeze({ 'gates.final-buster.test_config.unit.test_cmd': expectedFailUnitCommand('REAL_E2E_EXPECTED_BUSTER_GATE_FAILURE') }) }),
  }),
  'k8s-pod-never-ready': Object.freeze({
    terminal: FINAL_BUSTER_VERDICT_FAIL_TERMINAL_CONTRACT,
    setup: Object.freeze({ file_exact_line: Object.freeze({ 'k8s/deployment.yaml': '              path: /real-e2e-intentional-not-ready' }) }),
  }),
  'namespace-lease-denied': Object.freeze({
    terminal: FINAL_BUSTER_VERDICT_FAIL_TERMINAL_CONTRACT,
  }),
  'tailscale-preview-url-unreachable': Object.freeze({
    terminal: FINAL_BUSTER_VERDICT_FAIL_TERMINAL_CONTRACT,
  }),
  'tailscale-preview-wrong-deployment': Object.freeze({
    terminal: FINAL_BUSTER_VERDICT_FAIL_TERMINAL_CONTRACT,
  }),
  'pipeline-summary-failure': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'generator', step_id: 'generator:project_summary', terminal_status: 'failed', failure_class: 'failed' }),
  }),
  'redis-unavailable': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'pipeline', step_id: 'runtime_config', terminal_status: 'failed', failure_class: 'ECONNREFUSED' }),
    setup: Object.freeze({
      progress: Object.freeze({
        'real_e2e.intentional_config_failure.component': 'redis',
        'real_e2e.intentional_config_failure.error_code': 'REDIS_CONNECTION_UNAVAILABLE',
      }),
    }),
  }),
  'k8s-context-invalid': Object.freeze({
    terminal: FINAL_BUSTER_TERMINAL_CONTRACT,
    setup: Object.freeze({
      progress: Object.freeze({
        'gates.final-buster.test_config.k8s.kubeconfig_path': '/tmp/real-e2e-missing-kubeconfig',
        'real_e2e.intentional_config_failure.component': 'kubernetes',
        'real_e2e.intentional_config_failure.error_code': 'KUBECONFIG_UNAVAILABLE',
      }),
    }),
  }),
  'registry-pull-failure': Object.freeze({
    terminal: FINAL_BUSTER_TERMINAL_CONTRACT,
  }),
  'git-credential-failure': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'failed', failure_class: 'git_credential_failed', reason_contains: 'Permission denied (publickey)' }),
  }),
  'git-non-fast-forward': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'failed', failure_class: 'git_non_fast_forward', reason_contains: 'non-fast-forward' }),
  }),
  'git-merge-conflict': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'failed', failure_class: 'git_rebase_conflict', reason_contains: 'GIT_REBASE_CONFLICT' }),
  }),
  'git-commit-failure': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'failed', failure_class: 'git_commit_failed', reason_contains: 'pre-commit' }),
  }),
  'forge-timeout': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'timed_out', failure_class: 'timeout' }),
    setup: Object.freeze({ progress: Object.freeze({ 'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_FORGE_TIMEOUT_MINUTES || 0.001) }) }),
  }),
  'buster-module-timeout': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'module', step_id: '01-nginx', terminal_status: 'timed_out', failure_class: 'timeout' }),
    setup: Object.freeze({ progress: Object.freeze({ 'modules.01-nginx.timeout_minutes': Number(process.env.REAL_E2E_BUSTER_MODULE_TIMEOUT_MINUTES || 0.001) }) }),
  }),
  'echo-gate-timeout': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'gate', step_id: 'module-review', terminal_status: 'timed_out', failure_class: 'timeout' }),
    setup: Object.freeze({ progress: Object.freeze({ 'gates.module-review.timeout_minutes': Number(process.env.REAL_E2E_ECHO_GATE_TIMEOUT_MINUTES || 0.001) }) }),
  }),
  'final-review-timeout': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'gate', step_id: 'final-review', terminal_status: 'timed_out', failure_class: 'timeout' }),
    setup: Object.freeze({ progress: Object.freeze({ 'gates.final-review.timeout_minutes': Number(process.env.REAL_E2E_FINAL_REVIEW_TIMEOUT_MINUTES || 0.001) }) }),
  }),
  'pipeline-review-timeout': Object.freeze({
    terminal: DEGRADED_EVIDENCE_TERMINAL_CONTRACT,
    setup: Object.freeze({ progress: Object.freeze({ 'pipeline_review.timeout_minutes': Number(process.env.REAL_E2E_PIPELINE_REVIEW_TIMEOUT_MINUTES || 0.001) }) }),
  }),
  'pipeline-cancelled': Object.freeze({
    terminal: terminalContract({ event_type: 'pipeline_run.halted', step_type: 'pipeline', step_id: 'user_cancellation', terminal_status: 'cancelled', failure_class: 'PIPELINE_CANCELLED_BY_SIGTERM' }),
  }),
  'multi-module-dependency-blocked': Object.freeze({
    terminal: MODULE_TEST_FAILURE_EXHAUSTED_TERMINAL_CONTRACT,
    setup: Object.freeze({
      progress: Object.freeze({
        'modules.01-nginx.max_fails': 1,
        'modules.01-nginx.test_config.unit.test_cmd': expectedFailUnitCommand('REAL_E2E_EXPECTED_MULTI_MODULE_DEPENDENCY_BLOCKED'),
        'modules.02-nginx.depends_on.0': '01-nginx',
        'real_e2e.multi_module.modules.0': '01-nginx',
        'real_e2e.multi_module.modules.1': '02-nginx',
      }),
    }),
  }),
});

export function expectedFailureContractForScenario(scenario) {
  const contract = FAILURE_CONTRACTS[scenario.id];
  if (!contract) {
    throw new Error(`missing real E2E failure contract for scenario: ${scenario.id}`);
  }
  const setup = realE2EScenarioSetupContract(scenario.id);
  return {
    ...contract,
    setup: Object.keys(setup).length > 0 ? setup : contract.setup,
  };
}

export const evidenceSchemaTestHooks = Object.freeze({
  assertOrderedContracts,
  pipelineEventContract,
  pipelineEventSchemaFields,
  redisRecordSchemaFields,
  requiredValuesMissing,
  assertBusterFailureReasonContract,
  requireApprovalFailureEvidence,
  requireBusterFailureArtifact,
  requireDeterministicMalformedOutputEvidence,
  requireNormalizedForgeCompletionEvidence,
  requireMalformedOutputProductionRejectionEvidence,
  requireNoCleanSuccessAfterFatalConfigFailure,
  requireNoDownstreamSuccessAfterMalformedOutput,
  requireObservabilityDegradedEvidence,
  requireDiscordDeliveryReceipt,
  requirePipelineLifecycleFailureEvidence,
  requireCrashResumeEvidence,
  requireMultiModuleEvidence,
  requireMultiModuleDependencyBlockedEvidence,
  requireRetryFixCycleEvidence,
  requireScenarioFailureContract,
  requireScenarioSetupContract,
  requireAgentObservabilityTelemetryEvidence,
  requireBusterStreamEvidence,
  requirePipelineTelemetryStreamEvidence,
  validateArchitectureResultsForWorkspace,
  validateApprovalDecisionForScenario,
  validateBusterOutputForWorkspace,
  validateEchoReviewForWorkspace,
  validateForgeCompletionForWorkspace,
  validateLatestPointerForWorkspace,
  validatePipelineReviewForWorkspace,
  validateSummaryForWorkspace,
});

function readPathValue(value, dottedPath) {
  const parts = String(dottedPath).split('.');
  const resolve = (current, index) => {
    if (current == null) return undefined;
    if (index >= parts.length) return current;
    if (Array.isArray(current) && /^\d+$/.test(parts[index])) return resolve(current[Number(parts[index])], index + 1);
    if (typeof current !== 'object') return undefined;
    for (let end = parts.length; end > index; end--) {
      const key = parts.slice(index, end).join('.');
      if (Object.hasOwn(current, key)) return resolve(current[key], end);
    }
    return undefined;
  };
  return resolve(value, 0);
}

function setupFieldFailures(source, expected = {}) {
  return Object.entries(expected)
    .map(([field, expectedValue]) => {
      const actual = readPathValue(source, field);
      return JSON.stringify(actual) === JSON.stringify(expectedValue)
        ? null
        : { field, expected: expectedValue, actual: actual ?? null };
    })
    .filter(Boolean);
}

function setupAbsentFailures(source, fields = []) {
  return fields
    .map((field) => {
      const actual = readPathValue(source, field);
      return actual === undefined
        ? null
        : { field, expected_absent: true, actual };
    })
    .filter(Boolean);
}

function setupPathSuffixFailures(source, expected = {}) {
  return Object.entries(expected)
    .map(([field, expectedSuffix]) => {
      const actual = readPathValue(source, field);
      return typeof actual === 'string' && actual.endsWith(expectedSuffix)
        ? null
        : { field, expected_path_suffix: expectedSuffix, actual: actual ?? null };
    })
    .filter(Boolean);
}

function requireScenarioSetupContract(workspace, scenario) {
  const contract = expectedFailureContractForScenario(scenario);
  const progressPath = path.join(workspace.swarmDir, 'progress.json');
  let progress;
  let config;
  try {
    progress = readJson(progressPath);
    config = readJson(workspace.runConfigPath);
  } catch (error) {
    return evidenceFail('expected_failure_setup_contract', 'REAL_E2E_FAILURE_SETUP_CONTRACT_READ_FAILED', {
      scenario: scenario.id,
      progress_path: rel(workspace, progressPath),
      config_path: workspace.runConfigPath,
      error: error?.message || String(error),
    });
  }
  const baseExpected = {
    'real_e2e.scenario_id': scenario.id,
    'real_e2e.expected_pipeline_exit': scenario.expectedPipelineExit,
    'real_e2e.expected_evidence': scenario.expectedEvidence,
  };
  const failures = [
    ...setupFieldFailures(progress, baseExpected),
    ...setupFieldFailures(progress, contract.setup?.progress || {}),
    ...setupFieldFailures(config, contract.setup?.config || {}),
    ...setupAbsentFailures(progress, contract.setup?.progress_absent || []),
    ...setupAbsentFailures(config, contract.setup?.config_absent || []),
    ...setupPathSuffixFailures(progress, contract.setup?.progress_path_suffix || {}),
    ...setupPathSuffixFailures(config, contract.setup?.config_path_suffix || {}),
  ];
  for (const [relativePath, expectedLine] of Object.entries(contract.setup?.file_exact_line || {})) {
    const filePath = path.join(workspace.projectSrc, relativePath);
    const text = readTextIfPresent(filePath);
    const lines = text == null ? [] : text.split(/\r?\n/);
    if (!lines.includes(expectedLine)) {
      failures.push({
        field: `file:${relativePath}`,
        expected_line: expectedLine,
        actual: text == null ? null : 'present_without_expected_line',
      });
    }
  }
  return failures.length === 0
    ? evidencePass('expected_failure_setup_contract', {
      scenario: scenario.id,
      expected_evidence: scenario.expectedEvidence,
    })
    : evidenceFail('expected_failure_setup_contract', 'REAL_E2E_FAILURE_SETUP_CONTRACT_MISMATCH', {
      scenario: scenario.id,
      field_failures: failures,
    });
}

function requirePipelineLifecycleSuccessEvidence(workspace) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  const expectedRunId = primaryExpectedRunId(workspace);
  const orderedContracts = assertOrderedContracts(scoped, [
    pipelineEventContract('pipeline_run.started', { event_type: 'pipeline_run.started', run_id: expectedRunId }),
    pipelineEventContract('pipeline_run.completed', { event_type: 'pipeline_run.completed', run_id: expectedRunId, terminal_status: 'succeeded' }),
  ], 'REAL_E2E_PIPELINE_LIFECYCLE_ORDER_MISMATCH');
  const started = orderedContracts.ok ? orderedContracts.matches[0].record : null;
  const completed = orderedContracts.ok ? orderedContracts.matches[1].record : null;
  const modules = Array.isArray(started?.data?.modules) ? started.data.modules : [];
  const gates = Array.isArray(started?.data?.gates) ? started.data.gates : [];
  const hasModule = modules.some((entry) => entry?.module_id === '01-nginx');
  const hasReviewGate = gates.some((entry) => entry?.gate_id === 'module-review' && entry?.gate_type === 'review');
  const hasApprovalGate = gates.some((entry) => entry?.gate_id === 'operator-approval' && entry?.gate_type === 'approval');
  const hasBusterGate = gates.some((entry) => entry?.gate_id === 'final-buster' && entry?.gate_type === 'buster');
  const hasFinalReview = gates.some((entry) => entry?.gate_id === 'final-review' && entry?.gate_type === 'review');
  const ok = scoped.length > 0 && orderedContracts.ok && hasModule && hasReviewGate && hasApprovalGate && hasBusterGate && hasFinalReview;
  return ok
    ? evidencePass('pipeline_lifecycle_contract', {
      event_count: scoped.length,
      started_event_id: terminalEventIdFromEvent(started),
      completed_event_id: terminalEventIdFromEvent(completed),
      has_module: hasModule,
      has_review_gate: hasReviewGate,
      has_approval_gate: hasApprovalGate,
      has_buster_gate: hasBusterGate,
      has_final_review: hasFinalReview,
    })
    : evidenceFail('pipeline_lifecycle_contract', 'REAL_E2E_PIPELINE_LIFECYCLE_CONTRACT_INCOMPLETE', {
      event_count: scoped.length,
      has_module: hasModule,
      has_review_gate: hasReviewGate,
      has_approval_gate: hasApprovalGate,
      has_buster_gate: hasBusterGate,
      has_final_review: hasFinalReview,
      lifecycle_order: orderedContracts,
      read_failures: readFailures,
    });
}

function requirePipelineLifecycleFailureEvidence(workspace, scenario) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  let summary = null;
  try {
    summary = readJson(path.join(workspace.swarmDir, 'logs/pipeline/summary.json'));
  } catch (_error) {
    summary = null;
  }
  const expectedTerminal = expectedFailureTerminalContract(scenario);
  const terminalEvents = scoped.filter((entry) => entry.type === expectedTerminal.event_type && terminalStatusFromEvent(entry) && terminalStatusFromEvent(entry) !== 'succeeded');
  const halted = terminalEvents.at(-1) || null;
  const terminalStatuses = [...scoped.map((entry) => terminalStatusFromEvent(entry)).filter(Boolean), summary?.terminal_status || null].filter(Boolean);
  const hasBlockingTerminal = terminalStatuses.some((status) => status !== 'succeeded');
  const expectedRunId = primaryExpectedRunId(workspace);
  const summaryRunMatches = !summary?.run_id || summary.run_id === expectedRunId;
  const summaryProjectMatches = !summary?.project || summary.project === workspace.projectName;
  const terminalPresentCheck = halted
    ? assertPresentFields(pipelineEventSchemaFields(halted), ['event_id', 'event_type', 'run_id', 'terminal_status'], 'REAL_E2E_PIPELINE_FAILURE_TERMINAL_FIELD_MISSING')
    : { ok: false, reason: 'REAL_E2E_PIPELINE_FAILURE_TERMINAL_EVENT_MISSING' };
  return scoped.length > 0 && hasBlockingTerminal && summaryRunMatches && summaryProjectMatches && terminalPresentCheck.ok
    ? evidencePass('pipeline_failure_lifecycle_contract', {
      event_count: scoped.length,
      terminal_statuses: terminalStatuses,
      scenario: scenario.id,
      halted_event_id: terminalEventIdFromEvent(halted),
      halted_step_type: halted?.data?.step_type || null,
      halted_step_id: halted?.data?.step_id || null,
    })
    : evidenceFail('pipeline_failure_lifecycle_contract', 'REAL_E2E_PIPELINE_FAILURE_CONTRACT_INCOMPLETE', {
      event_count: scoped.length,
      terminal_statuses: terminalStatuses,
      has_blocking_terminal: hasBlockingTerminal,
      summary_run_matches: summaryRunMatches,
      summary_project_matches: summaryProjectMatches,
      scenario: scenario.id,
      expected_evidence: scenario.expectedEvidence,
      terminal_present_check: terminalPresentCheck,
      read_failures: readFailures,
    });
}

function requireApprovalFailureEvidence(workspace, { status, decisionViaPattern, timeoutPolicyPattern }, code) {
  const candidates = [
    path.join(workspace.swarmDir, 'operator-approval-gate-status.json'),
    path.join(workspace.swarmDir, 'logs/gates/operator-approval/approval-decision.json'),
  ];
  for (const filePath of candidates) {
    const text = readTextIfPresent(filePath);
    if (!text) continue;
    try {
      const data = JSON.parse(text);
      const normalizedStatus = String(data.status || '').toUpperCase();
      const decisionVia = String(data.decision_via || '');
      const timeoutPolicy = String(data.timeout_policy || data.on_timeout || '');
      const statusOk = normalizedStatus === status;
      const decisionOk = !decisionViaPattern || decisionViaPattern.test(decisionVia);
      const timeoutOk = !timeoutPolicyPattern || timeoutPolicyPattern.test(timeoutPolicy);
      if (statusOk && decisionOk && timeoutOk) {
        return evidencePass(code, {
          path: rel(workspace, filePath),
          status: normalizedStatus,
          decision_via: decisionVia || null,
          timeout_policy: timeoutPolicy || null,
        });
      }
    } catch {
      // Keep looking; some logs are not JSON state files.
    }
  }
  return evidenceFail(code, 'REAL_E2E_EXPECTED_FAILURE_ARTIFACT_MISSING', {
    expected_status: status,
    expected_any_path: candidates.map((candidate) => rel(workspace, candidate)),
  });
}

function requireBusterFailureArtifact(workspace, relativePath, code, expected = {}) {
  return requireJsonFile(workspace, relativePath, code, (data) => {
    if (!isPlainObject(data)) return { ok: false, reason: 'REAL_E2E_BUSTER_FAILURE_ARTIFACT_NOT_OBJECT' };
    const status = String(data.status || '').toUpperCase();
    if (status !== 'FAIL') return { ok: false, reason: 'REAL_E2E_BUSTER_FAILURE_ARTIFACT_NOT_FAIL', status: data.status || null };
    const expectedFields = {
      artifact_type: 'buster_output',
      run_id: primaryExpectedRunId(workspace),
      ...expected,
    };
    const fieldCheck = assertTypedFields(data, expectedFields, 'REAL_E2E_BUSTER_FAILURE_ARTIFACT_FIELD_MISMATCH');
    if (!fieldCheck.ok) return fieldCheck;
    const reasonContract = assertBusterFailureReasonContract(data, code);
    if (reasonContract.ok === false) return reasonContract;
    return {
      status,
      reason: data.reason || null,
      module_id: data.module_id || null,
      gate_id: data.gate_id || null,
      reason_contract: reasonContract,
    };
  });
}

function requireDeliveryLintFailureEvidence(workspace, code, {
  module_id: moduleId = '01-nginx',
  marker = null,
  validation_code = null,
} = {}) {
  const readModels = readLifecycleReadModels(workspace);
  if (!readModels.ok) return evidenceFail(code, readModels.reason, readModels);
  const moduleState = readModels.data?.modules?.[moduleId] || null;
  if (!isPlainObject(moduleState)) {
    return evidenceFail(code, 'REAL_E2E_DELIVERY_LINT_MODULE_READ_MODEL_MISSING', {
      path: readModels.path,
      module_id: moduleId,
    });
  }
  const blockedPhase = moduleState.blocked_phase ?? moduleState.blockedPhase ?? null;
  const fieldCheck = assertTypedFields(moduleState, {
    status: 'BLOCKED',
  }, 'REAL_E2E_DELIVERY_LINT_READ_MODEL_MISMATCH');
  if (!fieldCheck.ok) return evidenceFail(code, fieldCheck.reason, { ...fieldCheck, path: readModels.path });
  if (blockedPhase !== 'delivery_lint') {
    return evidenceFail(code, 'REAL_E2E_DELIVERY_LINT_READ_MODEL_MISMATCH', {
      path: readModels.path,
      field_failures: [{
        field: 'blocked_phase',
        expected: 'delivery_lint',
        actual: blockedPhase,
      }],
    });
  }
  if (moduleState.validation?.delivery_lint_passed !== false) {
    return evidenceFail(code, 'REAL_E2E_DELIVERY_LINT_VALIDATION_STATE_MISMATCH', {
      path: readModels.path,
      expected_delivery_lint_passed: false,
      actual_delivery_lint_passed: moduleState.validation?.delivery_lint_passed ?? null,
    });
  }
  const failSummaries = Array.isArray(moduleState.fail_summaries) ? moduleState.fail_summaries : [];
  const deliveryLintSummary = failSummaries.find((entry) => entry?.phase === 'delivery_lint' && String(entry?.summary || '').includes(validation_code || ''));
  const { events } = readPipelineEvents(workspace);
  const scopedEvents = scopedPipelineEvents(workspace, events);
  const deliveryLintEvents = scopedEvents.filter((entry) => (
    entry.type === 'module_attempt.blocked'
    && entry.refs?.module_id === moduleId
    && (entry.data?.blocked_phase === 'delivery_lint' || entry.data?.completion?.phase === 'delivery_lint')
  ));
  const completionEvidenceText = deliveryLintEvents
    .map((entry) => [
      entry.data?.reason,
      entry.data?.summary,
      entry.data?.completion?.summary,
      entry.data?.completion?.reason_code,
      entry.data?.completion?.metadata?.reason,
    ].filter(Boolean).join('\n'))
    .join('\n');
  const deliveryLintEvidenceText = [
    deliveryLintSummary?.summary,
    completionEvidenceText,
  ].filter(Boolean).join('\n');
  if (!deliveryLintSummary && !deliveryLintEvidenceText) {
    return evidenceFail(code, 'REAL_E2E_DELIVERY_LINT_FAILURE_SUMMARY_MISSING', {
      path: readModels.path,
      validation_code,
      fail_summaries: failSummaries,
    });
  }
  if (validation_code && !deliveryLintEvidenceText.includes(validation_code)) {
    return evidenceFail(code, 'REAL_E2E_DELIVERY_LINT_VALIDATION_CODE_MISSING', {
      path: readModels.path,
      validation_code,
      summary: deliveryLintEvidenceText,
    });
  }
  if (marker && !deliveryLintEvidenceText.includes(marker)) {
    return evidenceFail(code, 'REAL_E2E_DELIVERY_LINT_MARKER_MISSING', {
      path: readModels.path,
      marker,
      summary: deliveryLintEvidenceText,
    });
  }
  return evidencePass(code, {
    path: readModels.path,
    module_id: moduleId,
    blocked_phase: blockedPhase,
    validation_code,
    marker,
  });
}

function expectedFailureTerminalContract(scenario) {
  return expectedFailureContractForScenario(scenario).terminal;
}

function requireScenarioFailureContract(workspace, scenario) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  const expected = expectedFailureTerminalContract(scenario);
  const terminalEvents = scoped.filter((entry) => entry.type === expected.event_type && terminalStatusFromEvent(entry) && terminalStatusFromEvent(entry) !== 'succeeded');
  const halted = terminalEvents[terminalEvents.length - 1] || null;
  const actual = pipelineEventSchemaFields(halted);
  const expectedFields = Object.fromEntries(Object.entries(expected).filter(([field, value]) => value != null && !['require_event_id', 'reason_contains'].includes(field)));
  const fieldCheck = assertTypedFields(actual, expectedFields, 'REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH');
  const reasonContains = expected.reason_contains || null;
  const reasonContainsOk = !reasonContains || String(actual.reason || '').includes(reasonContains);
  const missingRequired = [];
  if (expected.require_event_id === true && !actual.event_id) missingRequired.push('event_id');
  if (!halted || !fieldCheck.ok || !reasonContainsOk || missingRequired.length > 0) {
    return evidenceFail('expected_failure_terminal_contract', fieldCheck.reason || (!reasonContainsOk ? 'REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISMATCH' : 'REAL_E2E_FAILURE_TERMINAL_CONTRACT_MISSING'), {
      scenario: scenario.id,
      expected: expectedFields,
      actual,
      event_count: scoped.length,
      matching_terminal_event_count: terminalEvents.length,
      read_failures: readFailures,
      ...(missingRequired.length > 0 ? { missing_required_fields: missingRequired } : {}),
      ...(fieldCheck.field_failures ? { field_failures: fieldCheck.field_failures } : {}),
      ...(!reasonContainsOk ? { reason_contains: reasonContains } : {}),
    });
  }
  return evidencePass('expected_failure_terminal_contract', {
    scenario: scenario.id,
    event_id: actual.event_id,
    terminal_status: terminalStatusFromEvent(halted),
    ...actual,
  });
}

function requireDeterministicMalformedOutputEvidence(workspace, scenario) {
  const config = malformedOutputScenarioConfig(scenario.id);
  if (!config) return evidencePass('deterministic_malformed_output_not_required', { scenario: scenario.id });

  const manifestRelativePath = path.join('logs', 'real-e2e', `malformed-output-publisher-${scenario.id}.json`);
  return requireJsonFile(workspace, manifestRelativePath, 'deterministic_malformed_output', (manifest) => {
    const expectedFields = {
      artifact_type: 'real_e2e_malformed_output_publication',
      scenario: scenario.id,
      run_id: workspace.runId,
      project: workspace.projectName,
      trigger: config.trigger,
      target: config.target,
      target_artifact_type: config.artifactType,
      raw_base64: Buffer.from(config.raw).toString('base64'),
      raw_sha256: sha256(config.raw),
      raw_bytes: Buffer.byteLength(config.raw, 'utf8'),
    };
    const fieldCheck = assertTypedFields(manifest, expectedFields, 'REAL_E2E_MALFORMED_OUTPUT_MANIFEST_FIELD_MISMATCH');
    if (!fieldCheck.ok) return fieldCheck;

    const targetPath = path.join(workspace.swarmDir, config.target);
    const targetRaw = readTextIfPresent(targetPath);
    if (config.normalizable === true && targetRaw == null) {
      return {
        ok: false,
        reason: 'REAL_E2E_MALFORMED_OUTPUT_RAW_PAYLOAD_MISMATCH',
        target: config.target,
        expected_sha256: sha256(config.raw),
        actual_sha256: null,
        expected_bytes: Buffer.byteLength(config.raw, 'utf8'),
        actual_bytes: null,
        target_rewritten: false,
      };
    }
    const raw = config.normalizable === true
      ? Buffer.from(String(manifest.raw_base64 || ''), 'base64').toString('utf8')
      : targetRaw;
    const expectedHash = sha256(config.raw);
    const expectedBytes = Buffer.byteLength(config.raw, 'utf8');
    const actualHash = raw == null ? null : sha256(raw);
    const actualBytes = raw == null ? null : Buffer.byteLength(raw, 'utf8');
    if (raw !== config.raw) {
      return {
        ok: false,
        reason: 'REAL_E2E_MALFORMED_OUTPUT_RAW_PAYLOAD_MISMATCH',
        target: config.target,
        expected_sha256: expectedHash,
        actual_sha256: actualHash,
        expected_bytes: expectedBytes,
        actual_bytes: actualBytes,
        target_rewritten: config.normalizable === true && targetRaw !== config.raw,
      };
    }
    let parsed = null;
    let parseError = null;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      parseError = error;
    }
    if (config.invalidJson !== false) {
      if (!parseError) return { ok: false, reason: 'REAL_E2E_MALFORMED_OUTPUT_PAYLOAD_WAS_VALID_JSON', target: config.target };
      return {
        target: config.target,
        trigger: config.trigger,
        payload_kind: 'invalid_json',
        raw_sha256: actualHash,
        raw_bytes: actualBytes,
        parse_error: parseError?.message || String(parseError),
      };
    }
    if (parseError) {
      return { ok: false, reason: 'REAL_E2E_BAD_OUTPUT_PAYLOAD_JSON_PARSE_FAILED', target: config.target, parse_error: parseError?.message || String(parseError) };
    }
    const expectedJson = config.expectedJson || {};
    const payloadFieldCheck = assertTypedFields(parsed, expectedJson, 'REAL_E2E_BAD_OUTPUT_PAYLOAD_FIELD_MISMATCH');
    if (!payloadFieldCheck.ok) return payloadFieldCheck;
    return {
      target: config.target,
      trigger: config.trigger,
      payload_kind: 'valid_json_contract_violation',
      raw_sha256: actualHash,
      raw_bytes: actualBytes,
      ...(config.normalizable === true ? {
        target_rewritten: targetRaw !== config.raw,
        target_sha256: targetRaw == null ? null : sha256(targetRaw),
      } : {}),
      payload_fields: Object.keys(expectedJson).sort(),
    };
  });
}

function requireNormalizedForgeCompletionEvidence(workspace, scenario) {
  const config = malformedOutputScenarioConfig(scenario.id);
  if (!config?.normalizable) return evidencePass('forge_completion_normalized_not_required', { scenario: scenario.id });

  return requireJsonFile(workspace, config.target, 'forge_completion_normalized', (artifact) => {
    const expected = {
      artifact_type: 'forge_completion',
      run_id: workspace.runId,
      module_id: '01-nginx',
      attempt: 2,
      status: 'READY_FOR_TESTING',
      normalized: true,
    };
    const fieldCheck = assertTypedFields(artifact, expected, 'REAL_E2E_FORGE_COMPLETION_NORMALIZED_FIELD_MISMATCH');
    if (!fieldCheck.ok) return fieldCheck;
    const normalizedFields = Array.isArray(artifact.normalized_fields) ? artifact.normalized_fields : [];
    const missing = requiredValuesMissing(normalizedFields, ['artifact_type', 'run_id', 'module_id', 'attempt']);
    return missing.length === 0
      ? {
        normalized_fields: normalizedFields,
        target: config.target,
      }
      : {
        ok: false,
        reason: 'REAL_E2E_FORGE_COMPLETION_NORMALIZED_FIELDS_MISSING',
        target: config.target,
        missing_fields: missing,
        normalized_fields: normalizedFields,
      };
  });
}

function downstreamSuccessArtifactChecks(workspace, scenario) {
  if (scenario.id === 'forge-malformed-output') {
    return [
      ['modules/01-nginx/buster-output.json', 'module_buster_output'],
      ['buster-test/FINAL-BUSTER-RESULT.json', 'final_buster_output'],
      ['logs/echo-review/MODULE-REVIEW.json', 'module_echo_review'],
      ['logs/echo-review/FINAL-REVIEW.json', 'final_echo_review'],
    ];
  }
  if (scenario.id === 'echo-malformed-output') {
    return [
      ['logs/echo-review/MODULE-REVIEW.json', 'module_echo_review'],
      ['logs/echo-review/FINAL-REVIEW.json', 'final_echo_review'],
    ];
  }
  return [];
}

function requireNoDownstreamSuccessAfterMalformedOutput(workspace, scenario) {
  const config = malformedOutputScenarioConfig(scenario.id);
  if (!config) return evidencePass('malformed_output_downstream_absence_not_required', { scenario: scenario.id });
  const unexpectedArtifacts = downstreamSuccessArtifactChecks(workspace, scenario)
    .map(([relativePath, artifact]) => {
      const filePath = path.join(workspace.swarmDir, relativePath);
      return pathExists(filePath) ? { artifact, path: rel(workspace, filePath) } : null;
    })
    .filter(Boolean);
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = events.filter((entry) => eventRunId(entry) === workspace.runId && (!eventProject(entry) || eventProject(entry) === workspace.projectName));
  const pipelineSuccess = scoped.find((entry) => entry.type === 'pipeline_run.completed' && terminalStatusFromEvent(entry) === 'succeeded') || null;
  if (unexpectedArtifacts.length > 0 || pipelineSuccess) {
    return evidenceFail('malformed_output_no_downstream_success', 'REAL_E2E_MALFORMED_OUTPUT_DOWNSTREAM_SUCCESS_OBSERVED', {
      scenario: scenario.id,
      target: config.target,
      unexpected_artifacts: unexpectedArtifacts,
      pipeline_success_event_id: terminalEventIdFromEvent(pipelineSuccess),
      read_failures: readFailures,
    });
  }
  return evidencePass('malformed_output_no_downstream_success', {
    scenario: scenario.id,
    target: config.target,
    checked_artifacts: downstreamSuccessArtifactChecks(workspace, scenario).map(([relativePath]) => `.swarm/${relativePath}`),
    scoped_event_count: scoped.length,
  });
}

const FATAL_CONFIG_FAILURE_SCENARIOS = Object.freeze(new Set([
  'redis-unavailable',
  'k8s-context-invalid',
  'git-credential-failure',
  'git-non-fast-forward',
  'git-merge-conflict',
  'git-commit-failure',
  'forge-timeout',
  'buster-module-timeout',
  'echo-gate-timeout',
  'final-review-timeout',
  'pipeline-review-timeout',
  'pipeline-cancelled',
]));

function requireNoCleanSuccessAfterFatalConfigFailure(workspace, scenario) {
  if (!FATAL_CONFIG_FAILURE_SCENARIOS.has(scenario.id)) {
    return evidencePass('fatal_config_no_clean_success_not_required', { scenario: scenario.id });
  }
  const forbiddenArtifacts = scenario.id === 'pipeline-review-timeout'
    ? [['logs/pipeline-review/PIPELINE-REVIEW.json', 'pipeline_review_json']]
    : [
        ['logs/echo-review/FINAL-REVIEW.json', 'final_echo_review'],
        ['logs/pipeline-review/PIPELINE-REVIEW.json', 'pipeline_review_json'],
      ];
  const unexpectedArtifacts = forbiddenArtifacts
    .map(([relativePath, artifact]) => {
      const filePath = path.join(workspace.swarmDir, relativePath);
      return pathExists(filePath) ? { artifact, path: rel(workspace, filePath) } : null;
    })
    .filter(Boolean);
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = events.filter((entry) => eventRunId(entry) === workspace.runId && (!eventProject(entry) || eventProject(entry) === workspace.projectName));
  const pipelineSuccess = scoped.find((entry) => entry.type === 'pipeline_run.completed' && terminalStatusFromEvent(entry) === 'succeeded') || null;
  if (unexpectedArtifacts.length > 0 || pipelineSuccess) {
    return evidenceFail('fatal_config_no_clean_success', 'REAL_E2E_FATAL_CONFIG_DOWNSTREAM_SUCCESS_OBSERVED', {
      scenario: scenario.id,
      unexpected_artifacts: unexpectedArtifacts,
      pipeline_success_event_id: terminalEventIdFromEvent(pipelineSuccess),
      read_failures: readFailures,
    });
  }
  return evidencePass('fatal_config_no_clean_success', {
    scenario: scenario.id,
    checked_artifacts: forbiddenArtifacts.map(([relativePath]) => `.swarm/${relativePath}`),
    scoped_event_count: scoped.length,
  });
}

function requireObservabilityDegradedEvidence(workspace, scenario, expected = {}) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events)
    .filter((entry) => entry.type === 'observability.degraded');
  const matching = scoped.find((entry) => typedFieldFailures({
    component: entry.component ?? entry.data?.component ?? null,
    surface: entry.surface ?? entry.data?.surface ?? null,
    reason: entry.reason ?? entry.data?.reason ?? null,
    run_id: eventRunId(entry),
    project: eventProject(entry),
  }, {
    component: expected.component,
    surface: expected.surface,
    reason: expected.reason,
    run_id: workspace.runId,
    project: workspace.projectName,
  }).length === 0) || null;
  return matching
    ? evidencePass('observability_degraded_contract', {
      scenario: scenario.id,
      event_id: terminalEventIdFromEvent(matching),
      component: matching.component ?? matching.data?.component ?? null,
      surface: matching.surface ?? matching.data?.surface ?? null,
      reason: matching.reason ?? matching.data?.reason ?? null,
    })
    : evidenceFail('observability_degraded_contract', 'REAL_E2E_OBSERVABILITY_DEGRADED_CONTRACT_MISSING', {
      scenario: scenario.id,
      expected: {
        component: expected.component,
        surface: expected.surface,
        reason: expected.reason,
        run_id: workspace.runId,
        project: workspace.projectName,
      },
      scoped_degraded_count: scoped.length,
      observed: scoped.map((entry) => ({
        event_id: terminalEventIdFromEvent(entry),
        component: entry.component ?? entry.data?.component ?? null,
        surface: entry.surface ?? entry.data?.surface ?? null,
        reason: entry.reason ?? entry.data?.reason ?? null,
      })),
      read_failures: readFailures,
    });
}

function requireMalformedOutputProductionRejectionEvidence(workspace, scenario) {
  const config = malformedOutputScenarioConfig(scenario.id);
  if (!config) return evidencePass('malformed_output_production_rejection_not_required', { scenario: scenario.id });
  const terminalCheck = requireScenarioFailureContract(workspace, scenario);
  if (!terminalCheck.ok) {
    return evidenceFail('malformed_output_production_rejection', 'REAL_E2E_MALFORMED_OUTPUT_TERMINAL_REJECTION_MISMATCH', {
      scenario: scenario.id,
      terminal: terminalCheck,
    });
  }
  return evidencePass('malformed_output_production_rejection', {
    scenario: scenario.id,
    component: terminalCheck.component,
    error_code: terminalCheck.failure_class,
    failure_class: terminalCheck.failure_class,
    artifact_path: config.target,
    terminal_event_id: terminalCheck.event_id,
  });
}

const DEGRADED_OBSERVABILITY_SCENARIO_CONTRACTS = Object.freeze({
  'discord-unavailable': Object.freeze({
    component: 'discord',
    surface: 'webhook',
    reason: 'webhook_delivery_failed',
  }),
});

function pushScenarioDegradedObservabilityChecks(checks, workspace, scenario) {
  const contract = DEGRADED_OBSERVABILITY_SCENARIO_CONTRACTS[scenario?.id];
  if (!contract) return;
  checks.push(requireObservabilityDegradedEvidence(workspace, scenario, contract));
}

function decodeStreamEntry(entry) {
  const [id, fields] = entry;
  const record = { _id: id };
  for (let index = 0; index < fields.length; index += 2) {
    record[String(fields[index])] = fields[index + 1];
  }
  return record;
}

function decodeStreamDataField(entry) {
  return parseJsonObject(entry?.data);
}

function decodeTaskPayload(entry) {
  return parseJsonObject(entry?.payload);
}

function redisRecordSchemaFields({ entry, payload, event } = {}) {
  const data = event || payload || {};
  return {
    redis_id: entry?._id || null,
    schema_version: entry?.schema_version || null,
    stream_role: entry?.stream_role || null,
    type: entry?.type || data?.type || null,
    project: entry?.project || data?.project || data?.identity?.project || null,
    run_id: data?.run_id || data?.identity?.run_id || entry?.run_id || null,
    target_kind: entry?.target_kind || null,
    target_id: entry?.target_id || null,
    module: entry?.module || null,
    module_id: entry?.module_id || data?.module_id || data?.identity?.module_id || null,
    gate_id: entry?.gate_id || data?.gate_id || data?.identity?.gate_id || null,
    gate_type: entry?.gate_type || data?.gate_type || data?.identity?.gate_type || null,
    attempt: Number.isFinite(Number(data?.attempt ?? entry?.attempt)) ? Number(data?.attempt ?? entry?.attempt) : null,
    task_type: data?.task_type || null,
    output_file: data?.output_file || null,
    source: data?.source || null,
    terminal_status: data?.terminal_status || null,
    version: data?.v || data?.version || null,
  };
}

function canonicalBusterOutputPath(workspace, relativeOutputPath) {
  if (workspace?.worktreePath && workspace?.projectSrc) {
    return `${path.relative(workspace.worktreePath, workspace.projectSrc).split(path.sep).join('/')}/.swarm/${relativeOutputPath}`;
  }
  return relativeOutputPath;
}

async function readRedisStream(stream) {
  const redisTool = (await import('../../../skills/nova/pipeline/tools/redis.ts')).default;
  const redis = redisTool.client;
  try {
    if (redis.status !== 'ready') {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Redis ready timeout')), 10000);
        redis.once('ready', () => { clearTimeout(timeout); resolve(); });
        redis.once('error', reject);
      });
    }
    const raw = await redis.xrange(stream, '-', '+');
    return { stream, entries: raw.map(decodeStreamEntry) };
  } catch (error) {
    return { stream, entries: [], error: error?.message || String(error) };
  }
}

async function readBusterTaskStream(workspace) {
  const runConfig = readJson(workspace.runConfigPath);
  const stream = runConfig?.buster?.runtime?.task_stream;
  if (!stream) return { stream: null, entries: [], error: 'missing task stream in run config' };
  return readRedisStream(stream);
}

async function readDecodedBusterTasks(workspace) {
  if (Array.isArray(workspace?.__testDecodedBusterTasks)) {
    return {
      stream: 'test:e2e:buster:tasks',
      entries: workspace.__testDecodedBusterTasks.map((record, index) => record.entry || { _id: `test-${index}` }),
      decoded: workspace.__testDecodedBusterTasks,
    };
  }
  const streamState = await readBusterTaskStream(workspace);
  if (streamState.error) return { ...streamState, decoded: [] };
  return {
    ...streamState,
    decoded: streamState.entries
      .map((entry) => ({ entry, payload: decodeTaskPayload(entry) }))
      .filter((record) => isPlainObject(record.payload)),
  };
}

async function readBusterDeadLetterStream(workspace) {
  const runConfig = readJson(workspace.runConfigPath);
  const taskStream = runConfig?.buster?.runtime?.task_stream;
  if (!taskStream) return { stream: null, entries: [], error: 'missing task stream in run config' };
  return readRedisStream(`${taskStream}:dead-letter`);
}

async function requireBusterDeadLetterEvidence(workspace, scenario, expected, code) {
  const streamState = await readBusterDeadLetterStream(workspace);
  if (streamState.error) {
    return evidenceFail(code, 'REAL_E2E_BUSTER_DEAD_LETTER_READ_FAILED', streamState);
  }
  const matching = streamState.entries.find((entry) => {
    const actual = {
      reason: entry.reason || null,
      effective_type: entry.effective_type || null,
      project: entry.project || null,
      run_id: entry.run_id || null,
      module_id: entry.module_id || null,
      gate_id: entry.gate_id || null,
    };
    return typedFieldFailures(actual, {
      project: workspace.projectName,
      run_id: workspace.runId,
      ...expected,
    }).length === 0;
  });
  return matching
    ? evidencePass(code, {
      scenario: scenario.id,
      stream: streamState.stream,
      redis_id: matching._id,
      reason: matching.reason || null,
    })
    : evidenceFail(code, 'REAL_E2E_BUSTER_DEAD_LETTER_CONTRACT_MISSING', {
      scenario: scenario.id,
      stream: streamState.stream,
      entry_count: streamState.entries.length,
      expected: {
        project: workspace.projectName,
        run_id: workspace.runId,
        ...expected,
      },
    });
}

async function requireBusterStreamEvidence(workspace, { requireModuleTask = true } = {}) {
  const streamState = await readDecodedBusterTasks(workspace);
  if (streamState.error) {
    return evidenceFail('buster_task_stream', 'REAL_E2E_BUSTER_STREAM_READ_FAILED', streamState);
  }
  const pipelineRunId = primaryExpectedRunId(workspace);
  const contracts = [
    ...(requireModuleTask ? [{
      name: 'module_test:01-nginx',
      expected: {
        schema_version: 'v1',
        stream_role: 'task',
        type: 'module_test',
        project: workspace.projectName,
        run_id: pipelineRunId,
        target_kind: 'module',
        target_id: '01-nginx',
        module: '01-nginx',
        task_type: 'module_test',
        module_id: '01-nginx',
        output_file: canonicalBusterOutputPath(workspace, 'modules/01-nginx/buster-output.json'),
      },
      presentFields: ['redis_id'],
      map: redisRecordSchemaFields,
    }] : []),
    {
      name: 'gate_test:final-buster',
      expected: {
        schema_version: 'v1',
        stream_role: 'task',
        type: 'gate_test',
        project: workspace.projectName,
        run_id: pipelineRunId,
        target_kind: 'gate',
        target_id: 'final-buster',
        module: 'final-buster',
        gate_id: 'final-buster',
        task_type: 'gate_test',
        module_id: 'final-buster',
        output_file: canonicalBusterOutputPath(workspace, 'buster-test/FINAL-BUSTER-RESULT.json'),
      },
      presentFields: ['redis_id'],
      map: redisRecordSchemaFields,
    },
  ];
  const orderedTasks = assertOrderedContracts(streamState.decoded, contracts, 'REAL_E2E_BUSTER_STREAM_TASK_ORDER_MISMATCH');
  const moduleTask = orderedTasks.ok && requireModuleTask
    ? orderedTasks.matches.find((match) => match.name === 'module_test:01-nginx')?.record || null
    : null;
  const gateTask = orderedTasks.ok
    ? orderedTasks.matches.find((match) => match.name === 'gate_test:final-buster')?.record || null
    : null;
  const gateSuites = Array.isArray(gateTask?.payload?.suites) ? gateTask.payload.suites : [];
  const missingGateSuites = requiredValuesMissing(gateSuites, ['k8s']);
  const hasGateK8sSuite = missingGateSuites.length === 0;
  const hasPreviewContract = gateTask?.payload?.test_config?.k8s?.purpose === 'final-preview'
    && gateTask?.payload?.test_config?.k8s?.preview?.expected_text === 'REAL_E2E_NGINX_OK';
  if ((requireModuleTask && !moduleTask) || !gateTask || !hasGateK8sSuite || !hasPreviewContract) {
    return evidenceFail('buster_task_stream', 'REAL_E2E_BUSTER_STREAM_MISSING_REQUIRED_TASKS', {
      stream: streamState.stream,
      entry_count: streamState.entries.length,
      decoded_task_count: streamState.decoded.length,
      has_module_task: Boolean(moduleTask),
      has_gate_task: Boolean(gateTask),
      has_gate_k8s_suite: hasGateK8sSuite,
      missing_gate_suites: missingGateSuites,
      has_preview_contract: hasPreviewContract,
      task_order_contract: orderedTasks,
    });
  }
  return evidencePass('buster_task_stream', {
    stream: streamState.stream,
    entry_count: streamState.entries.length,
    decoded_task_count: streamState.decoded.length,
    module_task_id: moduleTask?.entry?._id || null,
    gate_task_id: gateTask.entry._id,
    restored_checkpoint: restoredCheckpointName(workspace),
  });
}

function retryLifecycleEventFields(event = {}) {
  return {
    event_id: terminalEventIdFromEvent(event),
    event_type: event?.type || null,
    run_id: eventRunId(event),
    project: eventProject(event),
    module_id: event?.refs?.module_id || event?.module_id || event?.data?.module_id || null,
    attempt: attemptFromEvent(event),
    fail_count_before: Number.isFinite(Number(event?.data?.fail_count_before)) ? Number(event.data.fail_count_before) : null,
  };
}

function retryAttemptStartedSkippedByCheckpoint(workspace, attempt) {
  return Number(attempt) === 1 && restoredCheckpointSkipsPhase(workspace, 'forge');
}

function assertRetryLifecycleOrder(workspace, scopedEvents, {
  passedAttempt = 2,
  failedAttempts = [1],
  failedAttemptsWithTesting = [1],
} = {}) {
  const expectedRunId = primaryExpectedRunId(workspace);
  const contracts = [];
  const addAttemptStarted = (attempt) => contracts.push({
    name: `module_attempt.started:${attempt}`,
    expected: { event_type: 'module_attempt.started', run_id: expectedRunId, project: workspace.projectName, module_id: '01-nginx', attempt, fail_count_before: Math.max(0, attempt - 1) },
    presentFields: ['event_id'],
    map: retryLifecycleEventFields,
  });
  const addAttemptTestingStarted = (attempt) => contracts.push({
    name: `module_attempt.testing_started:${attempt}`,
    expected: { event_type: 'module_attempt.testing_started', run_id: expectedRunId, project: workspace.projectName, module_id: '01-nginx', attempt },
    presentFields: ['event_id'],
    map: retryLifecycleEventFields,
  });
  const addAttemptFailed = (attempt) => contracts.push({
    name: `module_attempt.failed:${attempt}`,
    expected: { event_type: 'module_attempt.failed', run_id: expectedRunId, project: workspace.projectName, module_id: '01-nginx', attempt },
    presentFields: ['event_id'],
    map: retryLifecycleEventFields,
  });

  for (const attempt of failedAttempts) {
    if (!retryAttemptStartedSkippedByCheckpoint(workspace, attempt)) addAttemptStarted(attempt);
    if (failedAttemptsWithTesting.includes(attempt)) addAttemptTestingStarted(attempt);
    addAttemptFailed(attempt);
  }

  if (passedAttempt != null) {
    addAttemptStarted(passedAttempt);
    contracts.push(
      {
        name: `module_attempt.testing_started:${passedAttempt}`,
        expected: { event_type: 'module_attempt.testing_started', run_id: expectedRunId, project: workspace.projectName, module_id: '01-nginx', attempt: passedAttempt },
        presentFields: ['event_id'],
        map: retryLifecycleEventFields,
      },
      {
        name: `module_attempt.passed:${passedAttempt}`,
        expected: { event_type: 'module_attempt.passed', run_id: expectedRunId, project: workspace.projectName, module_id: '01-nginx', attempt: passedAttempt },
        presentFields: ['event_id'],
        map: retryLifecycleEventFields,
      },
    );
  }
  const order = assertOrderedContracts(scopedEvents, contracts, 'REAL_E2E_RETRY_LIFECYCLE_ORDER_MISMATCH');
  const firstPassedIndex = scopedEvents.findIndex((event) => retryLifecycleEventFields(event).event_type === 'module_attempt.passed'
    && retryLifecycleEventFields(event).module_id === '01-nginx');
  const failedIndexes = failedAttempts.map((attempt) => scopedEvents.findIndex((event) => retryLifecycleEventFields(event).event_type === 'module_attempt.failed'
      && retryLifecycleEventFields(event).module_id === '01-nginx'
      && retryLifecycleEventFields(event).attempt === attempt));
  const missingFailedIndex = failedIndexes.findIndex((index) => index < 0);
  const latestFailedIndex = Math.max(...failedIndexes);
  if (firstPassedIndex >= 0 && missingFailedIndex < 0 && firstPassedIndex < latestFailedIndex) {
    return {
      ok: false,
      reason: 'REAL_E2E_RETRY_SUCCESS_BEFORE_FAILED_ATTEMPT_RECORDED',
      first_passed_index: firstPassedIndex,
      failed_attempt_index: latestFailedIndex,
      order_contract: order,
    };
  }
  return order;
}

function moduleRetryReadModelEvidence(workspace, {
  expectedStatus,
  expectedFailCount,
  expectedCurrentAttempt = 2,
  expectedFailedAttempts = [1],
  requiredFailureMarkers = [],
} = {}) {
  const readModels = readLifecycleReadModels(workspace);
  if (!readModels.ok) return readModels;
  const moduleState = readModels.data?.modules?.['01-nginx'] || null;
  if (!isPlainObject(moduleState)) {
    return { ok: false, reason: 'REAL_E2E_RETRY_MODULE_READ_MODEL_MISSING', path: readModels.path };
  }
  const allowedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!allowedStatuses.includes(moduleState.status)) {
    return {
      ok: false,
      reason: 'REAL_E2E_RETRY_MODULE_READ_MODEL_STATUS_MISMATCH',
      path: readModels.path,
      expected_status: allowedStatuses,
      actual_status: moduleState.status ?? null,
    };
  }
  const fieldCheck = assertTypedFields(moduleState, {
    fail_count: expectedFailCount,
    current_attempt: expectedCurrentAttempt,
  }, 'REAL_E2E_RETRY_MODULE_READ_MODEL_MISMATCH');
  if (!fieldCheck.ok) return { ...fieldCheck, path: readModels.path };
  const failSummaries = Array.isArray(moduleState.fail_summaries) ? moduleState.fail_summaries : [];
  const missingAttempts = requiredValuesMissing(failSummaries.map((entry) => entry?.attempt), expectedFailedAttempts);
  if (missingAttempts.length > 0) {
    return {
      ok: false,
      reason: 'REAL_E2E_RETRY_FAIL_HISTORY_ATTEMPT_MISSING',
      path: readModels.path,
      missing_attempts: missingAttempts,
      fail_summaries: failSummaries,
    };
  }
  const missingMarkers = requiredFailureMarkers.filter((marker) => !failSummaries.some((entry) => String(entry?.summary || '').includes(marker)));
  if (missingMarkers.length > 0) {
    return {
      ok: false,
      reason: 'REAL_E2E_RETRY_FAIL_HISTORY_MARKER_MISSING',
      path: readModels.path,
      missing_markers: missingMarkers,
      fail_summaries: failSummaries,
    };
  }
  return {
    ok: true,
    path: readModels.path,
    module_status: moduleState.status,
    current_attempt: moduleState.current_attempt,
    fail_count: moduleState.fail_count,
    fail_summaries: failSummaries.map((entry) => ({
      attempt: entry?.attempt ?? null,
      phase: entry?.phase ?? null,
      failure_class: entry?.failure_class ?? null,
      summary: entry?.summary ?? null,
    })),
  };
}

function requireRetryForgePromptEvidence(workspace, {
  requiredFailureMarkers = [],
  promptContracts = [{ attempt: 2, requiredFailureMarkers }],
} = {}) {
  const checked = [];
  for (const contract of promptContracts) {
    const attempt = Number(contract.attempt);
    const markers = contract.requiredFailureMarkers || requiredFailureMarkers;
    const filePath = path.join(workspace.swarmDir, 'logs', 'modules', '01-nginx', `forge-prompt-attempt-${attempt}.md`);
    const text = readTextIfPresent(filePath);
    if (text == null) {
      return evidenceFail('retry_forge_fix_prompt', 'REAL_E2E_RETRY_FORGE_FIX_PROMPT_MISSING', {
        expected_path: rel(workspace, filePath),
        attempt,
      });
    }
    const missingMarkers = markers.filter((marker) => !text.includes(marker));
    if (missingMarkers.length > 0) {
      return evidenceFail('retry_forge_fix_prompt', 'REAL_E2E_RETRY_FORGE_FIX_PROMPT_MISSING_FAILURE_EVIDENCE', {
        path: rel(workspace, filePath),
        attempt,
        missing_failure_markers: missingMarkers,
      });
    }
    checked.push({ attempt, path: rel(workspace, filePath), failure_markers: markers });
  }
  return evidencePass('retry_forge_fix_prompt', { prompts: checked });
}

function requireRetryProjectSummaryEvidence(workspace, {
  expectedModuleStatus = 'PASS',
  expectedFailCount = 1,
  expectedAttempts = 2,
  expectedFailedAttempts = [1],
  requiredFailureMarkers = [],
} = {}) {
  const filePath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'project-summary.json');
  if (!pathExists(filePath)) {
    return evidenceFail('retry_project_summary', 'REAL_E2E_RETRY_PROJECT_SUMMARY_MISSING', {
      expected_path: rel(workspace, filePath),
    });
  }
  let data;
  try {
    data = readJson(filePath);
  } catch (error) {
    return evidenceFail('retry_project_summary', 'REAL_E2E_RETRY_PROJECT_SUMMARY_INVALID_JSON', {
      path: rel(workspace, filePath),
      error: error?.message || String(error),
    });
  }
  const moduleStats = Array.isArray(data?.pipeline?.moduleStats) ? data.pipeline.moduleStats : [];
  const module = moduleStats.find((entry) => entry?.id === '01-nginx') || null;
  if (!module) {
    return evidenceFail('retry_project_summary', 'REAL_E2E_RETRY_PROJECT_SUMMARY_MODULE_MISSING', {
      path: rel(workspace, filePath),
      module_ids: moduleStats.map((entry) => entry?.id).filter(Boolean),
    });
  }
  const allowedStatuses = Array.isArray(expectedModuleStatus) ? expectedModuleStatus : [expectedModuleStatus];
  const failSummaries = Array.isArray(module.failSummaries) ? module.failSummaries : [];
  const fieldFailures = [
    ...(allowedStatuses.includes(module.status) ? [] : [{ field: 'status', expected: allowedStatuses, actual: module.status ?? null }]),
    ...(module.failCount === expectedFailCount ? [] : [{ field: 'failCount', expected: expectedFailCount, actual: module.failCount ?? null }]),
    ...(module.attempts === expectedAttempts ? [] : [{ field: 'attempts', expected: expectedAttempts, actual: module.attempts ?? null }]),
  ];
  const missingAttempts = requiredValuesMissing(failSummaries.map((entry) => entry?.attempt), expectedFailedAttempts);
  const missingMarkers = requiredFailureMarkers.filter((marker) => !failSummaries.some((entry) => String(entry?.summary || '').includes(marker)));
  if (fieldFailures.length > 0 || missingAttempts.length > 0 || missingMarkers.length > 0) {
    return evidenceFail('retry_project_summary', 'REAL_E2E_RETRY_PROJECT_SUMMARY_MISMATCH', {
      path: rel(workspace, filePath),
      field_failures: fieldFailures,
      missing_failed_attempts: missingAttempts,
      missing_failure_markers: missingMarkers,
      module,
    });
  }
  return evidencePass('retry_project_summary', {
    path: rel(workspace, filePath),
    module_status: module.status,
    attempts: module.attempts,
    fail_count: module.failCount,
    fail_summaries: failSummaries.map((entry) => ({
      attempt: entry?.attempt ?? null,
      summary: entry?.summary ?? null,
    })),
  });
}

async function requireRetryTaskStreamEvidence(workspace, { expectedModuleTaskAttempts = [1, 2], expectFinalGateTask = false } = {}) {
  const streamState = await readDecodedBusterTasks(workspace);
  if (streamState.error) {
    return evidenceFail('retry_buster_task_stream', 'REAL_E2E_BUSTER_STREAM_READ_FAILED', streamState);
  }
  const expectedRunId = primaryExpectedRunId(workspace);
  const contracts = expectedModuleTaskAttempts.map((attempt) => ({
      name: `module_test:01-nginx:attempt-${attempt}`,
      expected: {
        schema_version: 'v1',
        stream_role: 'task',
        type: 'module_test',
        project: workspace.projectName,
        run_id: expectedRunId,
        target_kind: 'module',
        target_id: '01-nginx',
        module_id: '01-nginx',
        attempt,
        output_file: canonicalBusterOutputPath(workspace, 'modules/01-nginx/buster-output.json'),
      },
      presentFields: ['redis_id'],
      map: redisRecordSchemaFields,
    }));
  if (expectFinalGateTask) {
    contracts.push({
      name: 'gate_test:final-buster:after-retry',
      expected: {
        schema_version: 'v1',
        stream_role: 'task',
        type: 'gate_test',
        project: workspace.projectName,
        run_id: expectedRunId,
        target_kind: 'gate',
        target_id: 'final-buster',
        gate_id: 'final-buster',
        attempt: 1,
        output_file: canonicalBusterOutputPath(workspace, 'buster-test/FINAL-BUSTER-RESULT.json'),
      },
      presentFields: ['redis_id'],
      map: redisRecordSchemaFields,
    });
  }
  const ordered = assertOrderedContracts(streamState.decoded, contracts, 'REAL_E2E_RETRY_BUSTER_TASK_ORDER_MISMATCH');
  if (!ordered.ok) {
    return evidenceFail('retry_buster_task_stream', ordered.reason, {
      stream: streamState.stream,
      entry_count: streamState.entries.length,
      decoded_task_count: streamState.decoded.length,
      task_order_contract: ordered,
    });
  }
  return evidencePass('retry_buster_task_stream', {
    stream: streamState.stream,
    pipeline_run_id: expectedRunId,
    seed_run_id: workspace.runId,
    entry_count: streamState.entries.length,
    decoded_task_count: streamState.decoded.length,
    ordered_tasks: ordered.matches.map((match) => ({
      name: match.name,
      redis_id: match.record.entry._id,
      attempt: redisRecordSchemaFields(match.record).attempt,
    })),
  });
}

async function requireRetryFixCycleEvidence(workspace, {
  code = 'retry_fix_cycle',
  expectedModuleStatus = 'PASS',
  expectedFailCount = 1,
  expectedAttempts = 2,
  expectedCurrentAttempt = expectedAttempts,
  expectedFailedAttempts = [1],
  readModelFailedAttempts = expectedFailedAttempts,
  failedAttemptsWithTesting = [1],
  passedAttempt = 2,
  expectedModuleTaskAttempts = [1, 2],
  expectFinalGateTask = false,
  expectProjectSummary = false,
  requiredFailureMarkers = ['REAL_E2E_EXPECTED_RETRYABLE_FORGE_CODE_FAILURE'],
  promptContracts = [{ attempt: 2, requiredFailureMarkers }],
} = {}) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  const lifecycleOrder = assertRetryLifecycleOrder(workspace, scoped, { passedAttempt, failedAttempts: expectedFailedAttempts, failedAttemptsWithTesting });
  const readModel = moduleRetryReadModelEvidence(workspace, {
    expectedStatus: expectedModuleStatus,
    expectedFailCount,
    expectedCurrentAttempt,
    expectedFailedAttempts: readModelFailedAttempts,
    requiredFailureMarkers,
  });
  const fixPrompt = requireRetryForgePromptEvidence(workspace, { requiredFailureMarkers, promptContracts });
  const taskStream = await requireRetryTaskStreamEvidence(workspace, { expectedModuleTaskAttempts, expectFinalGateTask });
  const checks = [
    lifecycleOrder.ok
      ? evidencePass('retry_lifecycle_order', {
        ordered_events: lifecycleOrder.matches.map((match) => ({
          name: match.name,
          event_id: terminalEventIdFromEvent(match.record),
          attempt: attemptFromEvent(match.record),
        })),
      })
      : evidenceFail('retry_lifecycle_order', lifecycleOrder.reason, {
        order_contract: lifecycleOrder,
        read_failures: readFailures,
      }),
    readModel.ok
      ? evidencePass('retry_lifecycle_read_model', readModel)
      : evidenceFail('retry_lifecycle_read_model', readModel.reason, readModel),
    fixPrompt,
    taskStream,
    ...(expectProjectSummary ? [requireRetryProjectSummaryEvidence(workspace, {
      expectedModuleStatus,
      expectedFailCount,
      expectedAttempts,
      expectedFailedAttempts,
      requiredFailureMarkers,
    })] : []),
  ];
  const failures = checks.filter((check) => !check.ok);
  return failures.length === 0
    ? evidencePass(code, { checks })
    : evidenceFail(code, 'REAL_E2E_RETRY_FIX_CYCLE_EVIDENCE_FAILED', { checks, failures });
}

function requireCrashInjectionMarker(workspace, scenario) {
  const point = scenario?.crashPoint || null;
  if (!point) return evidenceFail('crash_injection_marker', 'REAL_E2E_CRASH_POINT_MISSING', { scenario: scenario?.id || null });
  const relativePath = path.join('logs', 'pipeline', 'runs', workspace.runId, 'real-e2e-crash-injection', `${point}.json`);
  return requireJsonFile(workspace, relativePath, 'crash_injection_marker', (data) => {
    if (!isPlainObject(data)) return { ok: false, reason: 'REAL_E2E_CRASH_MARKER_NOT_OBJECT' };
    const fieldCheck = assertTypedFields(data, {
      schema_version: 'real_e2e_crash_injection.v1',
      artifact_type: 'real_e2e_crash_injection',
      point,
      run_id: workspace.runId,
      project: workspace.projectName,
      scenario: scenario.id,
      exit_code: 86,
    }, 'REAL_E2E_CRASH_MARKER_FIELD_MISMATCH');
    if (!fieldCheck.ok) return fieldCheck;
    return {
      point,
      marker_path: relativePath,
      details: data.details || null,
    };
  });
}

function requireCrashCheckpointEvidence(workspace, scenario) {
  const point = scenario?.crashPoint || null;
  if (!point) return evidenceFail('crash_checkpoint', 'REAL_E2E_CRASH_POINT_MISSING', { scenario: scenario?.id || null });
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  const checkpoints = scoped.filter((entry) => entry.type === 'pipeline.checkpoint' && entry?.data?.point === point);
  return checkpoints.length === 1
    ? evidencePass('crash_checkpoint', {
      point,
      event_id: terminalEventIdFromEvent(checkpoints[0]),
    })
    : evidenceFail('crash_checkpoint', 'REAL_E2E_CRASH_CHECKPOINT_NOT_REACHED', {
      scenario: scenario.id,
      point,
      checkpoint_count: checkpoints.length,
      read_failures: readFailures,
    });
}

function moduleLifecycleFields(event = {}) {
  return retryLifecycleEventFields(event);
}

function requireModuleLifecycleContract(workspace, {
  moduleId,
  expectedStartedAttempts = [1],
  expectedFailedAttempts = [],
  expectedPassedAttempts = [1],
} = {}) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  const moduleEvents = scoped.filter((entry) => moduleLifecycleFields(entry).module_id === moduleId);
  const uniqueAttempts = (attempts) => [...new Set(attempts)];
  const startedAttempts = uniqueAttempts(moduleEvents
    .filter((entry) => moduleLifecycleFields(entry).event_type === 'module_attempt.started')
    .map(attemptFromEvent)
    .filter((attempt) => attempt != null));
  const failedAttempts = uniqueAttempts(moduleEvents
    .filter((entry) => moduleLifecycleFields(entry).event_type === 'module_attempt.failed')
    .map(attemptFromEvent)
    .filter((attempt) => attempt != null));
  const passedAttempts = uniqueAttempts(moduleEvents
    .filter((entry) => moduleLifecycleFields(entry).event_type === 'module_attempt.passed')
    .map(attemptFromEvent)
    .filter((attempt) => attempt != null));
  const fieldFailures = [
    ...(JSON.stringify(startedAttempts) === JSON.stringify(expectedStartedAttempts)
      ? []
      : [{ field: `${moduleId}.module_attempt.started`, expected: expectedStartedAttempts, actual: startedAttempts }]),
    ...(JSON.stringify(failedAttempts) === JSON.stringify(expectedFailedAttempts)
      ? []
      : [{ field: `${moduleId}.module_attempt.failed`, expected: expectedFailedAttempts, actual: failedAttempts }]),
    ...(JSON.stringify(passedAttempts) === JSON.stringify(expectedPassedAttempts)
      ? []
      : [{ field: `${moduleId}.module_attempt.passed`, expected: expectedPassedAttempts, actual: passedAttempts }]),
  ];
  return fieldFailures.length === 0
    ? evidencePass(`module_lifecycle:${moduleId}`, {
      module_id: moduleId,
      started_attempts: startedAttempts,
      failed_attempts: failedAttempts,
      passed_attempts: passedAttempts,
    })
    : evidenceFail(`module_lifecycle:${moduleId}`, 'REAL_E2E_MODULE_LIFECYCLE_CONTRACT_MISMATCH', {
      module_id: moduleId,
      field_failures: fieldFailures,
      read_failures: readFailures,
    });
}

function requireDependencyOrderingEvidence(workspace, { dependency = '01-nginx', dependent = '02-nginx' } = {}) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  const dependencyPassIndex = scoped.findIndex((entry) => moduleLifecycleFields(entry).event_type === 'module_attempt.passed'
    && moduleLifecycleFields(entry).module_id === dependency);
  const dependentStartIndex = scoped.findIndex((entry) => moduleLifecycleFields(entry).event_type === 'module_attempt.started'
    && moduleLifecycleFields(entry).module_id === dependent);
  const ok = dependencyPassIndex >= 0 && dependentStartIndex >= 0 && dependencyPassIndex < dependentStartIndex;
  return ok
    ? evidencePass('multi_module_dependency_order', {
      dependency,
      dependent,
      dependency_pass_index: dependencyPassIndex,
      dependent_start_index: dependentStartIndex,
    })
    : evidenceFail('multi_module_dependency_order', 'REAL_E2E_MULTI_MODULE_DEPENDENCY_ORDER_MISMATCH', {
      dependency,
      dependent,
      dependency_pass_index: dependencyPassIndex,
      dependent_start_index: dependentStartIndex,
      read_failures: readFailures,
    });
}

function requireParallelStartEvidence(workspace, moduleIds = ['01-nginx', '02-nginx']) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  const firstStart = Object.fromEntries(moduleIds.map((moduleId) => [
    moduleId,
    scoped.findIndex((entry) => moduleLifecycleFields(entry).event_type === 'module_attempt.started'
      && moduleLifecycleFields(entry).module_id === moduleId),
  ]));
  const firstPass = Object.fromEntries(moduleIds.map((moduleId) => [
    moduleId,
    scoped.findIndex((entry) => moduleLifecycleFields(entry).event_type === 'module_attempt.passed'
      && moduleLifecycleFields(entry).module_id === moduleId),
  ]));
  const allStarted = Object.values(firstStart).every((index) => index >= 0);
  const earliestPass = Math.min(...Object.values(firstPass).filter((index) => index >= 0));
  const latestStart = Math.max(...Object.values(firstStart));
  const ok = allStarted && Number.isFinite(earliestPass) && latestStart < earliestPass;
  return ok
    ? evidencePass('multi_module_parallel_start', { module_ids: moduleIds, first_start_indexes: firstStart, first_pass_indexes: firstPass })
    : evidenceFail('multi_module_parallel_start', 'REAL_E2E_MULTI_MODULE_PARALLEL_START_CONTRACT_MISMATCH', {
      module_ids: moduleIds,
      first_start_indexes: firstStart,
      first_pass_indexes: firstPass,
      read_failures: readFailures,
    });
}

function requireNoModuleStarted(workspace, moduleId) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  const started = scoped.filter((entry) => moduleLifecycleFields(entry).event_type === 'module_attempt.started'
    && moduleLifecycleFields(entry).module_id === moduleId);
  return started.length === 0
    ? evidencePass(`module_not_started:${moduleId}`, { module_id: moduleId })
    : evidenceFail(`module_not_started:${moduleId}`, 'REAL_E2E_UNEXPECTED_DOWNSTREAM_MODULE_STARTED', {
      module_id: moduleId,
      started_event_ids: started.map(terminalEventIdFromEvent),
      read_failures: readFailures,
    });
}

function requireMultiModuleReadModels(workspace, expected = {}) {
  const readModel = readLifecycleReadModels(workspace);
  if (!readModel.ok) return evidenceFail('multi_module_read_models', readModel.reason, readModel);
  const failures = [];
  for (const [moduleId, expectedState] of Object.entries(expected)) {
    const actual = readModel.data?.modules?.[moduleId] || null;
    for (const [field, expectedValue] of Object.entries(expectedState || {})) {
      if (actual?.[field] !== expectedValue) {
        failures.push({ field: `modules.${moduleId}.${field}`, expected: expectedValue, actual: actual?.[field] ?? null });
      }
    }
  }
  return failures.length === 0
    ? evidencePass('multi_module_read_models', { modules: Object.keys(expected), path: readModel.path })
    : evidenceFail('multi_module_read_models', 'REAL_E2E_MULTI_MODULE_READ_MODEL_MISMATCH', {
      field_failures: failures,
      path: readModel.path,
    });
}

function requireMultiModuleProjectSummary(workspace, moduleIds = ['01-nginx', '02-nginx']) {
  const filePath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'project-summary.json');
  if (!pathExists(filePath)) return evidenceFail('multi_module_project_summary', 'REAL_E2E_PROJECT_SUMMARY_MISSING', { path: rel(workspace, filePath) });
  let data;
  try {
    data = readJson(filePath);
  } catch (error) {
    return evidenceFail('multi_module_project_summary', 'REAL_E2E_PROJECT_SUMMARY_INVALID_JSON', { path: rel(workspace, filePath), error: error?.message || String(error) });
  }
  const moduleStats = Array.isArray(data?.pipeline?.moduleStats) ? data.pipeline.moduleStats : [];
  const ids = moduleStats.map((entry) => entry?.id).filter(Boolean);
  const sortedIds = [...ids].sort();
  const expectedIds = [...moduleIds].sort();
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missing = requiredValuesMissing(ids, moduleIds);
  const unexpected = ids.filter((id) => !moduleIds.includes(id));
  const ok = JSON.stringify(sortedIds) === JSON.stringify(expectedIds) && duplicateIds.length === 0;
  return ok
    ? evidencePass('multi_module_project_summary', {
      path: rel(workspace, filePath),
      module_ids: ids,
    })
    : evidenceFail('multi_module_project_summary', 'REAL_E2E_MULTI_MODULE_PROJECT_SUMMARY_MISMATCH', {
      path: rel(workspace, filePath),
      module_ids: ids,
      missing,
      unexpected,
      duplicate_ids: duplicateIds,
    });
}

function validateModuleBusterOutputForWorkspace(workspace, moduleId) {
  return (data) => {
    if (!isPlainObject(data)) return { ok: false, reason: 'REAL_E2E_MODULE_BUSTER_OUTPUT_NOT_OBJECT' };
    const status = String(data.status || '').toUpperCase();
    if (status !== 'PASS') return { ok: false, reason: 'REAL_E2E_MODULE_BUSTER_OUTPUT_NOT_PASS', status: data.status || null };
    const expectedRunId = primaryExpectedRunId(workspace);
    if (data.run_id !== expectedRunId) {
      return {
        ok: false,
        reason: 'REAL_E2E_MODULE_BUSTER_OUTPUT_RUN_ID_MISMATCH',
        expected_run_id: expectedRunId,
        actual_run_id: data.run_id || null,
      };
    }
    const fieldCheck = assertTypedFields(data, {
      artifact_type: 'buster_output',
      module_id: moduleId,
    }, 'REAL_E2E_MODULE_BUSTER_OUTPUT_FIELD_MISMATCH');
    if (!fieldCheck.ok) return fieldCheck;
    return { module_id: moduleId, status, run_id: data.run_id };
  };
}

async function requireMultiModuleBusterTaskStream(workspace, {
  moduleIds = ['01-nginx', '02-nginx'],
  attemptsByModule = {},
  expectFinalGate = true,
} = {}) {
  const streamState = await readDecodedBusterTasks(workspace);
  if (streamState.error) return evidenceFail('multi_module_buster_task_stream', 'REAL_E2E_BUSTER_STREAM_READ_FAILED', streamState);
  const contracts = [];
  const expectedRunId = primaryExpectedRunId(workspace);
  const normalizeTaskFields = (record) => {
    return redisRecordSchemaFields(record);
  };
  for (const moduleId of moduleIds) {
    const attempts = attemptsByModule[moduleId] || [1];
    for (const attempt of attempts) {
      contracts.push({
        name: `module_test:${moduleId}:attempt-${attempt}`,
        expected: {
          schema_version: 'v1',
          stream_role: 'task',
          type: 'module_test',
          project: workspace.projectName,
          run_id: expectedRunId,
          target_kind: 'module',
          target_id: moduleId,
          module_id: moduleId,
          attempt,
          output_file: `modules/${moduleId}/buster-output.json`,
        },
        presentFields: ['redis_id'],
        map: normalizeTaskFields,
      });
    }
  }
  if (expectFinalGate) {
    contracts.push({
      name: 'gate_test:final-buster',
      expected: {
        schema_version: 'v1',
        stream_role: 'task',
        type: 'gate_test',
        project: workspace.projectName,
        run_id: expectedRunId,
        target_kind: 'gate',
        target_id: 'final-buster',
        gate_id: 'final-buster',
        output_file: 'buster-test/FINAL-BUSTER-RESULT.json',
      },
      presentFields: ['redis_id'],
      map: normalizeTaskFields,
    });
  }
  const ordered = assertOrderedContracts(streamState.decoded, contracts, 'REAL_E2E_MULTI_MODULE_BUSTER_TASK_ORDER_MISMATCH');
  if (!ordered.ok) {
    return evidenceFail('multi_module_buster_task_stream', ordered.reason, {
      stream: streamState.stream,
      decoded_task_count: streamState.decoded.length,
      task_order_contract: ordered,
    });
  }
  return evidencePass('multi_module_buster_task_stream', {
    stream: streamState.stream,
    decoded_task_count: streamState.decoded.length,
    ordered_tasks: ordered.matches.map((match) => ({
      name: match.name,
      redis_id: match.record.entry._id,
      module_id: redisRecordSchemaFields(match.record).module_id,
      attempt: redisRecordSchemaFields(match.record).attempt,
    })),
  });
}

async function requireMultiModuleEvidence(workspace, scenario, {
  dependency = false,
  retryUnlock = false,
  finalGateFailure = false,
} = {}) {
  const moduleIds = ['01-nginx', '02-nginx'];
  const checks = [
    requireMultiModuleReadModels(workspace, {
      '01-nginx': { status: 'PASS' },
      '02-nginx': { status: 'PASS' },
    }),
    requireJsonFile(workspace, 'modules/01-nginx/buster-output.json', 'module_buster_output:01-nginx', validateModuleBusterOutputForWorkspace(workspace, '01-nginx')),
    requireJsonFile(workspace, 'modules/02-nginx/buster-output.json', 'module_buster_output:02-nginx', validateModuleBusterOutputForWorkspace(workspace, '02-nginx')),
  ];
  if (!finalGateFailure) checks.push(requireMultiModuleProjectSummary(workspace, moduleIds));
  if (dependency || retryUnlock) {
    checks.push(requireDependencyOrderingEvidence(workspace));
  } else {
    checks.push(requireParallelStartEvidence(workspace, moduleIds));
  }
  if (retryUnlock || finalGateFailure) {
    checks.push(requireModuleLifecycleContract(workspace, {
      moduleId: '01-nginx',
      expectedStartedAttempts: [1, 2],
      expectedFailedAttempts: [1],
      expectedPassedAttempts: [2],
    }));
  } else {
    checks.push(requireModuleLifecycleContract(workspace, { moduleId: '01-nginx' }));
  }
  checks.push(requireModuleLifecycleContract(workspace, { moduleId: '02-nginx' }));
  checks.push(await requireMultiModuleBusterTaskStream(workspace, {
    moduleIds,
    attemptsByModule: {
      '01-nginx': retryUnlock || finalGateFailure ? [1, 2] : [1],
      '02-nginx': [1],
    },
    expectFinalGate: true,
  }));
  if (finalGateFailure) {
    checks.push(requireBusterFailureArtifact(workspace, 'buster-test/FINAL-BUSTER-RESULT.json', scenario.expectedEvidence, { module_id: 'final-buster', gate_id: 'final-buster' }));
  }
  const failures = checks.filter((check) => !check.ok);
  return failures.length === 0
    ? evidencePass(scenario.expectedEvidence, { checks })
    : evidenceFail(scenario.expectedEvidence, 'REAL_E2E_MULTI_MODULE_EVIDENCE_FAILED', { checks, failures });
}

async function requireMultiModuleDependencyBlockedEvidence(workspace, scenario) {
  const checks = [
    requireBusterFailureArtifact(workspace, 'modules/01-nginx/buster-output.json', scenario.expectedEvidence, { module_id: '01-nginx' }),
    requireNoModuleStarted(workspace, '02-nginx'),
  ];
  const failures = checks.filter((check) => !check.ok);
  return failures.length === 0
    ? evidencePass(scenario.expectedEvidence, { checks })
    : evidenceFail(scenario.expectedEvidence, 'REAL_E2E_MULTI_MODULE_DEPENDENCY_BLOCK_EVIDENCE_FAILED', { checks, failures });
}

function requireCrashResumeLifecycleEvidence(workspace, scenario, { retry = false } = {}) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  const started = scoped.filter((entry) => entry.type === 'pipeline_run.started');
  const completed = scoped.filter((entry) => entry.type === 'pipeline_run.completed' && terminalStatusFromEvent(entry) === 'succeeded');
  const halted = scoped.filter((entry) => entry.type === 'pipeline_run.halted');
  const crashes = scoped.filter((entry) => entry.type === 'real_e2e.crash_injected' && entry?.data?.point === scenario.crashPoint);
  const moduleStarted = scoped.filter((entry) => retryLifecycleEventFields(entry).event_type === 'module_attempt.started'
    && retryLifecycleEventFields(entry).module_id === '01-nginx');
  const modulePassed = scoped.filter((entry) => retryLifecycleEventFields(entry).event_type === 'module_attempt.passed'
    && retryLifecycleEventFields(entry).module_id === '01-nginx');
  const moduleFailed = scoped.filter((entry) => retryLifecycleEventFields(entry).event_type === 'module_attempt.failed'
    && retryLifecycleEventFields(entry).module_id === '01-nginx');
  const expectedStartedAttempts = retry ? [1, 2] : [1];
  const expectedFailedAttempts = retry ? [1] : [];
  const expectedPassedAttempt = retry ? 2 : 1;
  const actualStartedAttempts = moduleStarted.map(attemptFromEvent).filter((attempt) => attempt != null);
  const actualFailedAttempts = moduleFailed.map(attemptFromEvent).filter((attempt) => attempt != null);
  const actualPassedAttempts = modulePassed.map(attemptFromEvent).filter((attempt) => attempt != null);
  const readModel = readLifecycleReadModels(workspace);
  const moduleState = readModel.ok ? readModel.data?.modules?.['01-nginx'] || null : null;
  const fieldFailures = [
    ...(started.length === 1 ? [] : [{ field: 'pipeline_run.started.count', expected: 1, actual: started.length }]),
    ...(completed.length === 1 ? [] : [{ field: 'pipeline_run.completed.count', expected: 1, actual: completed.length }]),
    ...(halted.length === 0 ? [] : [{ field: 'pipeline_run.halted.count', expected: 0, actual: halted.length }]),
    ...(crashes.length === 1 ? [] : [{ field: 'real_e2e.crash_injected.count', expected: 1, actual: crashes.length }]),
    ...(JSON.stringify(actualStartedAttempts) === JSON.stringify(expectedStartedAttempts)
      ? []
      : [{ field: 'module_attempt.started.attempts', expected: expectedStartedAttempts, actual: actualStartedAttempts }]),
    ...(JSON.stringify(actualFailedAttempts) === JSON.stringify(expectedFailedAttempts)
      ? []
      : [{ field: 'module_attempt.failed.attempts', expected: expectedFailedAttempts, actual: actualFailedAttempts }]),
    ...(JSON.stringify(actualPassedAttempts) === JSON.stringify([expectedPassedAttempt])
      ? []
      : [{ field: 'module_attempt.passed.attempts', expected: [expectedPassedAttempt], actual: actualPassedAttempts }]),
    ...(moduleState?.status === 'PASS' ? [] : [{ field: 'read_model.modules.01-nginx.status', expected: 'PASS', actual: moduleState?.status ?? null }]),
  ];
  return fieldFailures.length === 0
    ? evidencePass('crash_resume_lifecycle', {
      scenario: scenario.id,
      crash_point: scenario.crashPoint,
      started_event_id: terminalEventIdFromEvent(started[0]),
      completed_event_id: terminalEventIdFromEvent(completed[0]),
      crash_event_id: terminalEventIdFromEvent(crashes[0]),
      started_attempts: actualStartedAttempts,
      failed_attempts: actualFailedAttempts,
      passed_attempts: actualPassedAttempts,
      read_model_path: readModel.path || null,
    })
    : evidenceFail('crash_resume_lifecycle', 'REAL_E2E_CRASH_RESUME_LIFECYCLE_CONTRACT_MISMATCH', {
      scenario: scenario.id,
      crash_point: scenario.crashPoint,
      field_failures: fieldFailures,
      read_failures: readFailures,
      read_model: readModel,
    });
}

async function requireCrashResumeBusterQueueEvidence(workspace, scenario, { retry = false } = {}) {
  const streamState = await readDecodedBusterTasks(workspace);
  if (streamState.error) {
    return evidenceFail('crash_resume_buster_queue', 'REAL_E2E_CRASH_RESUME_BUSTER_TASK_STREAM_READ_FAILED', streamState);
  }
  const moduleTasks = streamState.decoded
    .filter((record) => {
      const fields = redisRecordSchemaFields(record);
      return fields.type === 'module_test'
        && fields.run_id === workspace.runId
        && fields.project === workspace.projectName
        && fields.module_id === '01-nginx';
    });
  const gateTasks = streamState.decoded
    .filter((record) => {
      const fields = redisRecordSchemaFields(record);
      return fields.type === 'gate_test'
        && fields.run_id === workspace.runId
        && fields.project === workspace.projectName
        && fields.gate_id === 'final-buster';
    });
  const attempts = moduleTasks.map((record) => redisRecordSchemaFields(record).attempt).filter((attempt) => attempt != null);
  const gateAttempts = gateTasks.map((record) => redisRecordSchemaFields(record).attempt).filter((attempt) => attempt != null);
  const expectedAttempts = retry ? [1, 2] : [1];
  const redisIds = moduleTasks.map((record) => redisRecordSchemaFields(record).redis_id).filter(Boolean);
  const uniqueRedisIds = new Set(redisIds);
  const fieldFailures = [
    ...(JSON.stringify(attempts) === JSON.stringify(expectedAttempts)
      ? []
      : [{ field: 'module_test.task_attempts', expected: expectedAttempts, actual: attempts }]),
    ...(redisIds.length === uniqueRedisIds.size
      ? []
      : [{ field: 'module_test.redis_ids_unique', expected: true, actual: false, redis_ids: redisIds }]),
    ...(JSON.stringify(gateAttempts) === JSON.stringify([1])
      ? []
      : [{ field: 'gate_test.task_attempts', expected: [1], actual: gateAttempts }]),
  ];
  return fieldFailures.length === 0
    ? evidencePass('crash_resume_buster_queue', {
      stream: streamState.stream,
      module_task_attempts: attempts,
      gate_task_attempts: gateAttempts,
      redis_ids: redisIds,
    })
    : evidenceFail('crash_resume_buster_queue', 'REAL_E2E_CRASH_RESUME_BUSTER_QUEUE_CONTRACT_MISMATCH', {
      stream: streamState.stream,
      decoded_task_count: streamState.decoded.length,
      field_failures: fieldFailures,
    });
}

async function requireCrashResumeEvidence(workspace, scenario, { retry = false } = {}) {
  const checks = [
    requireCrashCheckpointEvidence(workspace, scenario),
    requireCrashInjectionMarker(workspace, scenario),
    requireCrashResumeLifecycleEvidence(workspace, scenario, { retry }),
    await requireCrashResumeBusterQueueEvidence(workspace, scenario, { retry }),
    requireJsonFile(workspace, 'logs/pipeline/summary.json', 'crash_resume_pipeline_summary', validateSummaryForWorkspace(workspace)),
    requireJsonFile(workspace, 'logs/pipeline/latest.json', 'crash_resume_latest_pointer', validateLatestPointerForWorkspace(workspace)),
  ];
  if (retry) {
    checks.push(await requireRetryFixCycleEvidence(workspace, {
      code: 'crash_resume_retry_cycle',
      expectedModuleStatus: 'PASS',
      expectedFailCount: 1,
      expectFinalGateTask: true,
      expectProjectSummary: true,
    }));
  }
  const failures = checks.filter((check) => !check.ok);
  return failures.length === 0
    ? evidencePass('crash_resume_contract', { checks })
    : evidenceFail('crash_resume_contract', 'REAL_E2E_CRASH_RESUME_EVIDENCE_FAILED', { checks, failures });
}

function telemetryStreamKey(workspace) {
  const summary = readJson(path.join(workspace.swarmDir, 'logs/pipeline/summary.json'));
  return summary?.telemetry_stream_key || null;
}

function telemetryContractsForWorkspace(workspace, pipelineRunId) {
  const restoredCheckpoint = restoredCheckpointName(workspace);
  if (restoredCheckpoint) {
    return [
      ...(!restoredCheckpointSkipsPhase(workspace, 'final-buster') ? [{
        name: 'gate.started:final-buster',
        expected: { version: 1, source: 'pipeline', type: 'gate.started', run_id: pipelineRunId, project: workspace.projectName, gate_id: 'final-buster' },
        presentFields: ['redis_id'],
        map: redisRecordSchemaFields,
      }] : []),
      {
        name: 'pipeline.completed',
        expected: { version: 1, source: 'pipeline', type: 'pipeline.completed', run_id: pipelineRunId, project: workspace.projectName, terminal_status: 'succeeded' },
        presentFields: ['redis_id'],
        map: redisRecordSchemaFields,
      },
    ];
  }
  return [
    {
      name: 'pipeline.started',
      expected: { version: 1, source: 'pipeline', type: 'pipeline.started', run_id: pipelineRunId, project: workspace.projectName },
      presentFields: ['redis_id'],
      map: redisRecordSchemaFields,
    },
    {
      name: 'module.started:01-nginx',
      expected: { version: 1, source: 'pipeline', type: 'module.started', run_id: pipelineRunId, project: workspace.projectName, module_id: '01-nginx' },
      presentFields: ['redis_id'],
      map: redisRecordSchemaFields,
    },
    {
      name: 'gate.started:final-buster',
      expected: { version: 1, source: 'pipeline', type: 'gate.started', run_id: pipelineRunId, project: workspace.projectName, gate_id: 'final-buster' },
      presentFields: ['redis_id'],
      map: redisRecordSchemaFields,
    },
    {
      name: 'pipeline.completed',
      expected: { version: 1, source: 'pipeline', type: 'pipeline.completed', run_id: pipelineRunId, project: workspace.projectName, terminal_status: 'succeeded' },
      presentFields: ['redis_id'],
      map: redisRecordSchemaFields,
    },
  ];
}

async function requirePipelineTelemetryStreamEvidence(workspace) {
  const pipelineRunId = primaryExpectedRunId(workspace);
  let stream = null;
  try {
    stream = telemetryStreamKey(workspace);
  } catch (error) {
    return evidenceFail('pipeline_telemetry_stream', 'REAL_E2E_TELEMETRY_SUMMARY_READ_FAILED', { error: error?.message || String(error) });
  }
  if (!stream) {
    return evidenceFail('pipeline_telemetry_stream', 'REAL_E2E_TELEMETRY_STREAM_KEY_MISSING');
  }
  const streamState = Array.isArray(workspace.__testTelemetryEvents)
    ? {
      stream,
      entries: workspace.__testTelemetryEvents.map((event, index) => ({
        _id: `telemetry-${index}`,
        data: JSON.stringify(event),
      })),
    }
    : await readRedisStream(stream);
  if (streamState.error) {
    return evidenceFail('pipeline_telemetry_stream', 'REAL_E2E_TELEMETRY_STREAM_READ_FAILED', streamState);
  }
  const decoded = streamState.entries
    .map((entry) => ({ entry, event: decodeStreamDataField(entry) }))
    .filter((record) => isPlainObject(record.event));
  const scoped = decoded.filter((record) => {
    const fields = redisRecordSchemaFields(record);
    return fields.version === 1
      && fields.source === 'pipeline'
      && fields.run_id === pipelineRunId
      && fields.project === workspace.projectName;
  });
  const restoredCheckpoint = restoredCheckpointName(workspace);
  const orderedTelemetry = assertOrderedContracts(scoped, telemetryContractsForWorkspace(workspace, pipelineRunId), 'REAL_E2E_TELEMETRY_STREAM_ORDER_MISMATCH');
  const pipelineStarted = orderedTelemetry.ok && !restoredCheckpoint
    ? orderedTelemetry.matches.find((match) => match.name === 'pipeline.started')?.record.event || null
    : null;
  const startedModuleIds = Array.isArray(pipelineStarted?.modules) ? pipelineStarted.modules.map((module) => module?.id) : [];
  const startedGateIds = Array.isArray(pipelineStarted?.gates) ? pipelineStarted.gates.map((gate) => gate?.id) : [];
  const missingStartedModules = restoredCheckpoint ? [] : requiredValuesMissing(startedModuleIds, ['01-nginx']);
  const missingStartedGates = restoredCheckpoint ? [] : requiredValuesMissing(startedGateIds, ['module-review', 'operator-approval', 'final-buster', 'final-review']);
  if (!orderedTelemetry.ok || missingStartedModules.length > 0 || missingStartedGates.length > 0) {
    return evidenceFail('pipeline_telemetry_stream', 'REAL_E2E_TELEMETRY_STREAM_MISSING_RUN_EVENTS', {
      stream,
      entry_count: streamState.entries.length,
      decoded_event_count: decoded.length,
      scoped_event_count: scoped.length,
      telemetry_order_contract: orderedTelemetry,
      missing_started_modules: missingStartedModules,
      missing_started_gates: missingStartedGates,
    });
  }
  return evidencePass('pipeline_telemetry_stream', {
    stream,
    entry_count: streamState.entries.length,
    scoped_event_count: scoped.length,
    ordered_events: orderedTelemetry.matches.map((match) => ({ name: match.name, redis_id: match.record.entry._id })),
    pipeline_started_modules: startedModuleIds,
    pipeline_started_gates: startedGateIds,
    restored_checkpoint: restoredCheckpoint,
  });
}

function requireAgentObservabilityTelemetryEvidence(workspace) {
  const eventPath = path.join(workspace.swarmDir, 'logs', 'pipeline', 'pipeline.jsonl');
  const events = readJsonLines(eventPath).filter((event) => event?.project === workspace.projectName);
  const agentEvents = events.filter((event) => String(event?.type || '').startsWith('agent.'));
  const typeSet = new Set(agentEvents.map((event) => event.type).filter(Boolean));
  const requiredTypes = ['agent.spawned', 'agent.session.started', 'agent.ended', 'agent.tool.started', 'agent.tool.finished'];
  const missingTypes = requiredValuesMissing([...typeSet], requiredTypes);
  const labels = agentEvents.map((event) => event.label).filter(Boolean);
  const requiredLabels = ['forge-01-nginx', 'echo-echo-codex-module-review', 'case-study', 'pipeline-review'];
  const missingLabels = requiredLabels.filter((label) => !labels.some((actual) => String(actual).startsWith(label)));
  const invalidEvents = agentEvents
    .filter((event) => event.v !== 1
      || event.source !== 'pipeline'
      || event.emitter !== 'nova/pipeline/services/agent-observability-ingester'
      || event.event_id == null
      || event.ts == null)
    .map((event) => ({
      event_id: event.event_id || null,
      type: event.type || null,
      source: event.source || null,
      emitter: event.emitter || null,
    }));

  return agentEvents.length > 0 && missingTypes.length === 0 && missingLabels.length === 0 && invalidEvents.length === 0
    ? evidencePass('agent_observability_pipeline_events', {
      path: rel(workspace, eventPath),
      event_count: events.length,
      agent_event_count: agentEvents.length,
      types: [...typeSet].sort(),
      labels: labels.slice(0, 20),
    })
    : evidenceFail('agent_observability_pipeline_events', 'REAL_E2E_AGENT_OBSERVABILITY_TELEMETRY_EVIDENCE_FAILED', {
      path: rel(workspace, eventPath),
      event_count: events.length,
      agent_event_count: agentEvents.length,
      missing_types: missingTypes,
      missing_labels: missingLabels,
      invalid_events: invalidEvents,
      expected: {
        source: 'pipeline',
        emitter: 'nova/pipeline/services/agent-observability-ingester',
        project: workspace.projectName,
      },
    });
}

function requireDirtyWorktreePreserved(workspace) {
  const filePath = path.join(workspace.projectSrc, '..', '..', '..', 'REAL_E2E_DIRTY_WORKTREE_PRESERVE.txt');
  if (!pathExists(filePath)) {
    return evidenceFail('git_dirty_worktree_preserved', 'REAL_E2E_DIRTY_WORKTREE_FILE_MISSING', {
      path: path.relative(workspace.projectSrc, filePath),
    });
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const required = [`run_id=${workspace.runId}`, `project=${workspace.projectName}`];
  const missing = required.filter((marker) => !content.includes(marker));
  if (missing.length > 0) {
    return evidenceFail('git_dirty_worktree_preserved', 'REAL_E2E_DIRTY_WORKTREE_FILE_CONTENT_MISMATCH', {
      path: path.relative(workspace.projectSrc, filePath),
      missing,
    });
  }
  return evidencePass('git_dirty_worktree_preserved', {
    path: path.relative(workspace.projectSrc, filePath),
  });
}

function realE2EExecutionBoundaryFromProgress(workspace) {
  const progress = readJsonIfPresent(path.join(workspace.swarmDir, 'progress.json'));
  return progress?.real_e2e?.execution_boundary || 'full';
}

function requireModuleBoundarySuccessEvidence(workspace, scenario) {
  const readModels = readLifecycleReadModels(workspace);
  if (!readModels.ok) return evidenceFail('module_boundary_success', readModels.reason, readModels);
  const moduleIds = ['01-nginx', '02-nginx', '03-nginx', '04-nginx'];
  const modules = readModels.data?.modules || {};
  const fieldFailures = moduleIds.flatMap((moduleId) => {
    const state = modules[moduleId] || null;
    return state?.status === 'PASS'
      ? []
      : [{ field: `modules.${moduleId}.status`, expected: 'PASS', actual: state?.status ?? null }];
  });
  if (fieldFailures.length > 0) {
    return evidenceFail('module_boundary_success', 'REAL_E2E_MODULE_BOUNDARY_SUCCESS_MISMATCH', {
      path: readModels.path,
      field_failures: fieldFailures,
    });
  }
  return evidencePass('module_boundary_success', {
    scenario: scenario?.id || null,
    module_ids: moduleIds,
    statuses: Object.fromEntries(moduleIds.map((moduleId) => [moduleId, modules[moduleId]?.status || null])),
  });
}

function requirePipelineLifecycleModuleBoundarySuccess(workspace) {
  const { events, readFailures } = readPipelineEvents(workspace);
  const scoped = scopedPipelineEvents(workspace, events);
  const expectedRunId = primaryExpectedRunId(workspace);
  const orderedContracts = assertOrderedContracts(scoped, [
    pipelineEventContract('pipeline_run.started', { event_type: 'pipeline_run.started', run_id: expectedRunId }),
    pipelineEventContract('pipeline_run.completed', { event_type: 'pipeline_run.completed', run_id: expectedRunId, terminal_status: 'succeeded' }),
  ], 'REAL_E2E_PIPELINE_LIFECYCLE_ORDER_MISMATCH');
  const started = orderedContracts.ok ? orderedContracts.matches[0].record : null;
  const modules = Array.isArray(started?.data?.modules) ? started.data.modules : [];
  const missingModules = requiredValuesMissing(modules.map((entry) => entry?.module_id), ['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
  return scoped.length > 0 && orderedContracts.ok && missingModules.length === 0
    ? evidencePass('pipeline_module_boundary_lifecycle_contract', {
      event_count: scoped.length,
      started_event_id: terminalEventIdFromEvent(started),
      completed_event_id: terminalEventIdFromEvent(orderedContracts.matches[1].record),
      module_ids: modules.map((entry) => entry?.module_id).filter(Boolean),
    })
    : evidenceFail('pipeline_module_boundary_lifecycle_contract', 'REAL_E2E_PIPELINE_MODULE_BOUNDARY_LIFECYCLE_INCOMPLETE', {
      event_count: scoped.length,
      missing_modules: missingModules,
      lifecycle_order: orderedContracts,
      read_failures: readFailures,
    });
}

async function verifyModuleBoundarySuccessAfterRetry(workspace, { mode = 'full', scenario = null } = {}) {
  const checks = [
    requireScenarioSetupContract(workspace, scenario),
    requirePipelineLifecycleModuleBoundarySuccess(workspace),
    requireModuleBoundarySuccessEvidence(workspace, scenario),
    await requireRetryFixCycleEvidence(workspace, {
      code: 'success_after_retry',
      expectedModuleStatus: 'PASS',
      expectedFailCount: 1,
      expectFinalGateTask: false,
      expectProjectSummary: false,
    }),
    requireFile(workspace, 'logs/real-e2e-retry-marker.txt', 'forge_retry_marker'),
    requireDiscordAudit(workspace),
    requireDiscordDeliveryReceipt(workspace),
    await requirePipelineTelemetryStreamEvidence(workspace),
    requireAgentObservabilityTelemetryEvidence(workspace),
  ];
  const failures = checks.filter((check) => !check.ok);
  return {
    ok: failures.length === 0,
    mode,
    checks,
    failures,
  };
}

async function verifyModuleBoundarySuccessAfterMalformedRetry(workspace, { mode = 'full', scenario = null } = {}) {
  const base = await verifyModuleBoundarySuccessAfterRetry(workspace, { mode, scenario });
  const checks = [
    ...base.checks,
    requireDeterministicMalformedOutputEvidence(workspace, scenario),
    requireNormalizedForgeCompletionEvidence(workspace, scenario),
  ];
  const failures = checks.filter((check) => !check.ok);
  return {
    ok: failures.length === 0,
    mode,
    checks,
    failures,
  };
}

export async function verifyRealRunEvidence(workspace, { mode = 'full', scenario = null } = {}) {
  if (scenario?.expectedEvidence === 'retry_fix_malformed_output' && realE2EExecutionBoundaryFromProgress(workspace) === 'modules') {
    return verifyModuleBoundarySuccessAfterMalformedRetry(workspace, { mode, scenario });
  }
  if (scenario?.expectedEvidence === 'success_after_retry' && realE2EExecutionBoundaryFromProgress(workspace) === 'modules') {
    return verifyModuleBoundarySuccessAfterRetry(workspace, { mode, scenario });
  }
  const pipelineRunId = primaryExpectedRunId(workspace);
  const requireModuleBusterTask = !restoredCheckpointSkipsPhase(workspace, 'module-buster');
  const checks = [
    requireJsonFile(workspace, 'modules/01-nginx/forge-completion.json', 'forge_completion', validateForgeCompletionForWorkspace(workspace)),
    requireJsonFile(workspace, 'logs/architecture-validator/results.json', 'architecture_validator_results', validateArchitectureResultsForWorkspace(workspace)),
    requireFile(workspace, 'logs/architecture-validator/summary.md', 'architecture_validator_summary'),
    requireJsonFile(workspace, 'buster-test/FINAL-BUSTER-RESULT.json', 'final_buster_output', validateBusterOutputForWorkspace(workspace)),
    requireJsonFile(workspace, 'logs/echo-review/MODULE-REVIEW.json', 'module_echo_gate_output', validateEchoReviewForWorkspace(workspace, { gateId: 'module-review' })),
    requireJsonFile(workspace, 'logs/echo-review/FINAL-REVIEW.json', 'final_echo_gate_output', validateEchoReviewForWorkspace(workspace, { gateId: 'final-review' })),
    requireJsonFile(workspace, 'logs/gates/operator-approval/approval-request.json', 'approval_request'),
    requireJsonFile(workspace, 'logs/gates/operator-approval/approval-decision.json', 'approval_decision', validateApprovalDecisionForScenario(scenario)),
    requireFile(workspace, 'logs/pipeline-review/PIPELINE-REVIEW.md', 'pipeline_review_markdown'),
    requireJsonFile(workspace, 'logs/pipeline-review/PIPELINE-REVIEW.json', 'pipeline_review_json', validatePipelineReviewForWorkspace(workspace)),
    requireFile(workspace, 'logs/pipeline/case-study.md', 'pipeline_case_study'),
    requireJsonFile(workspace, 'logs/pipeline/summary.json', 'pipeline_summary', validateSummaryForWorkspace(workspace)),
    requireJsonFile(workspace, `logs/pipeline/runs/${pipelineRunId}/summary.json`, 'pipeline_run_summary', validateSummaryForWorkspace(workspace)),
    requireFile(workspace, 'logs/pipeline/case-study.base.json', 'pipeline_case_study_base'),
    requireJsonFile(workspace, 'logs/pipeline/latest.json', 'pipeline_latest_pointer', validateLatestPointerForWorkspace(workspace)),
    requireAnyFile(workspace, [
      `logs/pipeline/runs/${pipelineRunId}/lifecycle/canonical-events.jsonl`,
      'logs/pipeline/pipeline.jsonl',
      'logs/pipeline/runs/latest/pipeline.jsonl',
    ], 'pipeline_lifecycle_log'),
    requirePipelineLifecycleSuccessEvidence(workspace),
    requireDiscordAudit(workspace),
    requireDiscordDeliveryReceipt(workspace),
    await requireBusterStreamEvidence(workspace, { requireModuleTask: requireModuleBusterTask }),
    await requirePipelineTelemetryStreamEvidence(workspace),
    requireAgentObservabilityTelemetryEvidence(workspace),
  ];

  if (scenario?.id === 'forge-retry-then-success') {
    checks.push(await requireRetryFixCycleEvidence(workspace, {
      code: 'success_after_retry',
      expectedModuleStatus: 'PASS',
      expectedFailCount: 1,
      expectFinalGateTask: true,
      expectProjectSummary: true,
    }));
    checks.push(requireFile(workspace, 'logs/real-e2e-retry-marker.txt', 'forge_retry_marker'));
  }
  if (scenario?.crashResume) {
    checks.push(await requireCrashResumeEvidence(workspace, scenario, {
      retry: scenario.expectedEvidence === 'success_after_crash_resume_retry',
    }));
  }
  if (scenario?.id === 'git-dirty-worktree-preserved') {
    checks.push(requireDirtyWorktreePreserved(workspace));
  }
  if (scenario?.id === 'multi-module-independent-success') {
    checks.push(await requireMultiModuleEvidence(workspace, scenario));
  }
  if (scenario?.id === 'multi-module-dependent-success') {
    checks.push(await requireMultiModuleEvidence(workspace, scenario, { dependency: true }));
  }
  pushScenarioDegradedObservabilityChecks(checks, workspace, scenario);

  const failures = checks.filter((check) => !check.ok);
  return {
    ok: failures.length === 0,
    mode,
    checks,
    failures,
  };
}

export async function verifyExpectedFailureEvidence(workspace, scenario) {
  const checks = [
    requireScenarioSetupContract(workspace, scenario),
    requirePipelineLifecycleFailureEvidence(workspace, scenario),
    requireScenarioFailureContract(workspace, scenario),
    requireNovaHandoffDeliveryAcknowledgement(workspace, { required: scenario?.expectedEvidence === 'needs_nova' }),
  ];
  if (FATAL_CONFIG_FAILURE_SCENARIOS.has(scenario.id)) {
    checks.push(requireNoCleanSuccessAfterFatalConfigFailure(workspace, scenario));
  }
  if (scenario.id === 'approval-deny') {
    checks.push(requireApprovalFailureEvidence(workspace, {
      status: 'REJECTED',
      decisionViaPattern: /real-e2e-auto-deny/,
    }, 'approval_rejected'));
  } else if (scenario.id === 'approval-timeout-block') {
    checks.push(requireApprovalFailureEvidence(workspace, {
      status: 'TIMED_OUT',
      timeoutPolicyPattern: /BLOCK/i,
    }, 'approval_timeout_block'));
  } else if (scenario.id === 'buster-module-failure') {
    checks.push(requireBusterFailureArtifact(workspace, 'modules/01-nginx/buster-output.json', 'buster_module_failure', { module_id: '01-nginx' }));
  } else if (scenario.id === 'buster-module-infra-failure') {
    checks.push(requireBusterFailureArtifact(workspace, 'modules/01-nginx/buster-output.json', 'buster_module_infra_failure', { module_id: '01-nginx' }));
  } else if (scenario.id === 'needs-nova-code-failure') {
    checks.push(requireBusterFailureArtifact(workspace, 'modules/01-nginx/buster-output.json', 'needs_nova_code_failure', { module_id: '01-nginx' }));
  } else if (scenario.id === 'retry-budget-exhausted') {
    checks.push(await requireRetryFixCycleEvidence(workspace, {
      code: 'retry_budget_exhausted_cycle',
      expectedModuleStatus: ['FAIL', 'BLOCKED'],
      expectedFailCount: 2,
      expectedFailedAttempts: [1, 2],
      failedAttemptsWithTesting: [1, 2],
      passedAttempt: null,
      requiredFailureMarkers: ['REAL_E2E_EXPECTED_RETRY_BUDGET_EXHAUSTED'],
    }));
    checks.push(requireBusterFailureArtifact(workspace, 'modules/01-nginx/buster-output.json', 'retry_budget_exhausted', { module_id: '01-nginx' }));
  } else if (scenario.id === 'retry-buster-pass-echo-rejects') {
    checks.push(await requireRetryFixCycleEvidence(workspace, {
      code: 'retry_buster_pass_echo_rejects_cycle',
      expectedModuleStatus: 'PASS',
      expectedFailCount: 1,
      expectFinalGateTask: false,
    }));
  } else if (scenario.id === 'forge-malformed-output') {
    checks.push(requireDeterministicMalformedOutputEvidence(workspace, scenario));
    checks.push(requireMalformedOutputProductionRejectionEvidence(workspace, scenario));
    checks.push(requireNoDownstreamSuccessAfterMalformedOutput(workspace, scenario));
  } else if (scenario.id === 'echo-malformed-output') {
    checks.push(requireDeterministicMalformedOutputEvidence(workspace, scenario));
    checks.push(requireMalformedOutputProductionRejectionEvidence(workspace, scenario));
    checks.push(requireNoDownstreamSuccessAfterMalformedOutput(workspace, scenario));
  } else if (scenario.id === 'buster-invalid-completion-identity') {
    checks.push(requireBusterFailureArtifact(workspace, 'modules/01-nginx/buster-output.json', 'buster_invalid_completion_identity', { module_id: '01-nginx' }));
  } else if (scenario.id === 'buster-gate-failure') {
    checks.push(requireBusterFailureArtifact(workspace, 'buster-test/FINAL-BUSTER-RESULT.json', 'buster_gate_failure', { module_id: 'final-buster', gate_id: 'final-buster' }));
  } else if (scenario.id === 'multi-module-dependency-blocked') {
    checks.push(await requireMultiModuleDependencyBlockedEvidence(workspace, scenario));
  } else if ([
    'k8s-pod-never-ready',
    'namespace-lease-denied',
    'tailscale-preview-url-unreachable',
    'tailscale-preview-wrong-deployment',
    'k8s-context-invalid',
    'registry-pull-failure',
  ].includes(scenario.id)) {
    checks.push(requireBusterFailureArtifact(workspace, 'buster-test/FINAL-BUSTER-RESULT.json', scenario.expectedEvidence, { module_id: 'final-buster', gate_id: 'final-buster' }));
  }
  pushScenarioDegradedObservabilityChecks(checks, workspace, scenario);

  const failures = checks.filter((check) => !check.ok);
  return {
    ok: failures.length === 0,
    scenario: scenario.id,
    checks,
    failures,
  };
}
