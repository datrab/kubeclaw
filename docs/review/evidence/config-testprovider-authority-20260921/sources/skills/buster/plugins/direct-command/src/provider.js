import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PROTECTED_ENVIRONMENT = /^(?:BUSTER_|NOVA_|KUBECLAW_|OPENAI_|AWS_|AZURE_|GOOGLE_|GITHUB_|CI$|PATH$|HOME$|USER$|SHELL$|NODE_OPTIONS$|NODE_PATH$|LD_|DYLD_|SSL_CERT_|SSH_|GIT_|NPM_TOKEN$|.*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL).*)/u;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`DIRECT_COMMAND_CONFIG_INVALID:${label}`);
  return value;
}

function relativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || value.includes('\0')
    || path.isAbsolute(value) || value.split(/[\\/]/u).some((part) => part === '..' || part === '')) {
    throw new Error(`DIRECT_COMMAND_PATH_INVALID:${label}`);
  }
  return value === '.' ? '.' : value.split(/[\\/]/u).join('/');
}

function inside(root, relative, label, mustExist = true) {
  const candidate = path.resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) throw new Error(`DIRECT_COMMAND_PATH_ESCAPE:${label}`);
  if (!mustExist) return candidate;
  const canonical = fs.realpathSync(candidate);
  if (canonical !== root && !canonical.startsWith(`${root}${path.sep}`)) throw new Error(`DIRECT_COMMAND_SYMLINK_DENIED:${label}`);
  return canonical;
}

function declarations(value, kind) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > (kind === 'report' ? 16 : 8)) throw new Error(`DIRECT_COMMAND_CONFIG_INVALID:${kind}s`);
  const ids = new Set();
  const paths = new Set();
  return value.map((raw, index) => {
    const item = object(raw, `${kind}s.${index}`);
    const id = item.id;
    const file = relativePath(item.path, `${kind}s.${index}.path`);
    if (typeof id !== 'string' || !STABLE_ID.test(id) || ids.has(id) || paths.has(file)) {
      throw new Error(`DIRECT_COMMAND_DECLARATION_DUPLICATE:${kind}:${String(id)}`);
    }
    ids.add(id); paths.add(file);
    if (kind === 'report' && (item.format !== 'junit'
      || !['application/junit+xml', 'application/xml', 'text/xml'].includes(item.mediaType))) {
      throw new Error(`DIRECT_COMMAND_REPORT_INVALID:${id}`);
    }
    if (kind === 'coverage' && (item.format !== 'lcov' || item.mediaType !== 'text/lcov')) {
      throw new Error(`DIRECT_COMMAND_COVERAGE_INVALID:${id}`);
    }
    if (kind === 'artifact' && !['application/octet-stream', 'application/x-tar', 'application/gzip',
      'application/vnd.kubeclaw.build-output.tar', 'application/vnd.kubeclaw.checked-kubernetes-yaml',
      'application/vnd.kubeclaw.size-budget-baseline+json'].includes(item.mediaType)) throw new Error(`DIRECT_COMMAND_ARTIFACT_INVALID:${id}`);
    return { id, path: file, format: item.format, mediaType: item.mediaType };
  });
}

function configuration(invocation) {
  const value = object(invocation.configuration.values, 'root');
  if (typeof value.executable !== 'string' || !STABLE_ID.test(value.executable)) throw new Error('DIRECT_COMMAND_EXECUTABLE_INVALID');
  const args = value.args ?? [];
  if (!Array.isArray(args) || args.length > 256 || args.some((item) => typeof item !== 'string'
    || item.length > 4096 || item.includes('\0'))) throw new Error('DIRECT_COMMAND_ARGUMENTS_INVALID');
  const workingDirectory = relativePath(value.workingDirectory ?? '.', 'workingDirectory');
  const environment = value.environment === undefined ? {} : object(value.environment, 'environment');
  const entries = Object.entries(environment);
  if (entries.length > 64 || entries.some(([name, item]) => !ENVIRONMENT_NAME.test(name) || PROTECTED_ENVIRONMENT.test(name)
    || typeof item !== 'string' || item.length > 4096 || item.includes('\0'))) {
    throw new Error('DIRECT_COMMAND_ENVIRONMENT_DENIED');
  }
  const resultMode = value.resultMode;
  if (!['junit-required', 'exit-code'].includes(resultMode)) throw new Error('DIRECT_COMMAND_RESULT_MODE_INVALID');
  const reports = declarations(value.reports, 'report');
  const coverage = declarations(value.coverage, 'coverage');
  const artifacts = declarations(value.artifacts, 'artifact');
  if (resultMode === 'junit-required' && reports.length === 0) throw new Error('DIRECT_COMMAND_REPORT_REQUIRED');
  if (resultMode === 'exit-code' && reports.length !== 0) throw new Error('DIRECT_COMMAND_REPORTS_FORBIDDEN');
  const all = [...reports, ...coverage, ...artifacts];
  if (new Set(all.map((item) => item.id)).size !== all.length || new Set(all.map((item) => item.path)).size !== all.length) {
    throw new Error('DIRECT_COMMAND_DECLARATION_DUPLICATE');
  }
  return { executable: value.executable, args, workingDirectory, environment: { ...environment, CI: 'true' },
    resultMode, reports, coverage, artifacts };
}

function copyEvidence(sourceRoot, evidenceRoot, declaration, prefix, budget) {
  const source = inside(sourceRoot, declaration.path, `${prefix}:${declaration.id}`);
  const extension = prefix === 'report' ? '.xml' : prefix === 'coverage' ? '.info' : '.bin';
  const file = `${prefix}-${String(declaration.id).replace(/[^A-Za-z0-9._-]/gu, '_')}${extension}`;
  const target = inside(evidenceRoot, file, `${prefix}:${declaration.id}`, false);
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  const sourceFd = fs.openSync(source, fs.constants.O_RDONLY | noFollow);
  let targetFd = null;
  let copied = 0;
  try {
    const stat = fs.fstatSync(sourceFd);
    if (!stat.isFile()) throw new Error(`DIRECT_COMMAND_OUTPUT_NOT_FILE:${prefix}:${declaration.id}`);
    if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > budget.remainingBytes) {
      throw new Error(`DIRECT_COMMAND_ARTIFACT_LIMIT_EXCEEDED:${prefix}:${declaration.id}`);
    }
    targetFd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    const buffer = Buffer.allocUnsafe(64 * 1024);
    for (;;) {
      const read = fs.readSync(sourceFd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      if (copied + read > stat.size || copied + read > budget.remainingBytes) {
        throw new Error(`DIRECT_COMMAND_ARTIFACT_LIMIT_EXCEEDED:${prefix}:${declaration.id}`);
      }
      let offset = 0;
      while (offset < read) offset += fs.writeSync(targetFd, buffer, offset, read - offset);
      copied += read;
    }
    if (copied !== stat.size) throw new Error(`DIRECT_COMMAND_OUTPUT_CHANGED:${prefix}:${declaration.id}`);
  } catch (error) {
    if (targetFd !== null) fs.closeSync(targetFd);
    targetFd = null;
    fs.rmSync(target, { force: true });
    throw error;
  } finally {
    fs.closeSync(sourceFd);
    if (targetFd !== null) fs.closeSync(targetFd);
  }
  budget.remainingBytes -= copied;
  return { file, sizeBytes: copied };
}

function details(values) {
  const schemaId = 'kubeclaw.direct-command-details.v1';
  return { schemaId, schemaDigest: `sha256:${crypto.createHash('sha256').update(schemaId).digest('hex')}`, values };
}

export function provider() {
  return {
    async execute(invocation, context) {
      const config = configuration(invocation);
      const workspace = path.resolve(context.workspaceRoot);
      const repository = inside(workspace, invocation.workspace.repository, 'repository');
      const evidence = inside(workspace, invocation.workspace.evidence, 'evidence');
      const workingDirectory = inside(repository, config.workingDirectory, 'workingDirectory');
      const command = await context.invoke('command.execute', {
        operation: 'run',
        resource: { type: 'command.executable', canonicalId: `catalog:${config.executable}` },
        payload: {
          args: config.args,
          workingDirectory,
          writableRoot: repository,
          environment: config.environment,
          limits: {
            maxOutputBytes: invocation.limits.logBytes,
            maxExecutionMs: invocation.timeoutMs,
            maximumProcesses: invocation.limits.processes,
            memoryBytes: invocation.limits.memoryBytes,
            cpuMillis: invocation.limits.cpuMillis,
            openFiles: invocation.limits.artifactFiles + 32
          }
        }
      });
      const records = Array.isArray(command.records) ? command.records : [];
      for (const record of records) {
        if (record && typeof record === 'object' && (record.stream === 'stdout' || record.stream === 'stderr')
          && typeof record.content === 'string') context.log(record.stream, record.content);
      }
      if (records.length === 0) {
        if (typeof command.stdout === 'string' && command.stdout) context.log('stdout', command.stdout);
        if (typeof command.stderr === 'string' && command.stderr) context.log('stderr', command.stderr);
      }
      if (typeof command.errorCode === 'string') throw new Error(command.errorCode);
      const exitCode = Number.isSafeInteger(command.exitCode) ? Number(command.exitCode) : null;
      const signal = typeof command.signal === 'string' ? command.signal : null;
      const evidenceFiles = [];
      const reports = [];
      const declaredFileCount = config.reports.length + config.coverage.length + config.artifacts.length;
      if (declaredFileCount > invocation.limits.artifactFiles) {
        throw new Error('DIRECT_COMMAND_ARTIFACT_FILE_LIMIT_EXCEEDED');
      }
      const artifactBudget = { remainingBytes: invocation.limits.artifactBytes };
      for (const report of config.reports) {
        const copied = copyEvidence(workingDirectory, evidence, report, 'report', artifactBudget);
        evidenceFiles.push({ evidenceId: report.id, type: 'test-report', file: copied.file, mediaType: report.mediaType });
        reports.push({ evidenceId: report.id, format: report.format });
      }
      const outputs = [];
      for (const [index, coverage] of config.coverage.entries()) {
        const copied = copyEvidence(workingDirectory, evidence, coverage, 'coverage', artifactBudget);
        evidenceFiles.push({ evidenceId: coverage.id, type: 'coverage', file: copied.file, mediaType: coverage.mediaType });
        outputs.push({ name: `coverage-${index + 1}`, kind: 'artifact', evidenceId: coverage.id });
      }
      for (const [index, artifact] of config.artifacts.entries()) {
        const copied = copyEvidence(workingDirectory, evidence, artifact, 'artifact', artifactBudget);
        evidenceFiles.push({ evidenceId: artifact.id, type: 'artifact', file: copied.file, mediaType: artifact.mediaType });
        outputs.push({ name: `artifact-${index + 1}`, kind: 'artifact', evidenceId: artifact.id });
      }
      const passed = exitCode === 0 && signal === null;
      return {
        schemaVersion: 'provider-result.v1',
        outcome: passed ? 'passed' : 'failed',
        summary: passed ? 'Direct command completed successfully.' : `Direct command failed with exit code ${String(exitCode)}${signal ? ` and signal ${signal}` : ''}.`,
        counts: { total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1, skipped: 0 },
        findings: [], metrics: [], evidenceFiles, reports, outputs, exitCode, signal,
        providerDetails: details({ executable: config.executable, resultMode: config.resultMode,
          reportCount: reports.length, coverageCount: config.coverage.length, artifactCount: config.artifacts.length,
          commandResources: command.resources && typeof command.resources === 'object' ? command.resources : {} })
      };
    }
  };
}
