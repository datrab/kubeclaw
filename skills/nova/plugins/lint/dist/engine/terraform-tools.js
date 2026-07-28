import fs from 'fs';
import os from 'os';
import path from 'path';
import { configuredTargetPaths, findFiles } from './discovery.js';
import { requireToolExecution, safeExec } from './execution.js';
import { tryParseJson } from './parsers.js';
import { policyIncludesFile } from './policy.js';
import { failConfigMissing, failParse, notApplicable } from './report.js';
function commandOutput(result) {
    const output = [result.stdout, result.stderr].find((value) => typeof value === 'string' && value.length > 0);
    return typeof output === 'string' ? output : '';
}
function findingsResult(findings) {
    return {
        errors: findings.filter((finding) => finding.severity === 'error').length,
        warnings: findings.filter((finding) => finding.severity === 'warning').length,
        findings,
    };
}
function terraformRoots(ctx) {
    const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
    return ctx.policyProject.terraform.roots.map((root) => path.resolve(projectRoot, root));
}
function affectedTerraformRoots(ctx) {
    const roots = terraformRoots(ctx);
    if (!ctx.changedFilesRequested)
        return roots;
    const changes = ctx.changedFiles.map((file) => path.resolve(ctx.repoRoot, file));
    return roots.filter((root) => changes.some((change) => {
        const relative = path.relative(root, change);
        return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    }));
}
function terraformProviderMirror(ctx) {
    const mirror = ctx.policyProject.terraform.provider_mirror;
    if (!mirror || !path.isAbsolute(mirror))
        failConfigMissing('terraform-provider-mirror-invalid', 'Terraform provider mirror must be an absolute configured path.');
    if (!fs.existsSync(mirror) || !fs.statSync(mirror).isDirectory())
        failConfigMissing('terraform-provider-mirror-missing', `Terraform provider mirror does not exist: ${mirror}`);
    return mirror;
}
function writeTerraformCliConfig(dataDir, mirror) {
    const configPath = path.join(dataDir, 'provider-installation.tfrc');
    fs.writeFileSync(configPath, [
        'disable_checkpoint = true',
        'provider_installation {',
        '  filesystem_mirror {',
        `    path = ${JSON.stringify(mirror)}`,
        '    include = ["*/*/*"]',
        '  }',
        '}',
        '',
    ].join('\n'));
    return configPath;
}
function terraformFmtTool() {
    return {
        id: 'terraform-fmt',
        name: 'terraform fmt',
        binary: 'terraform',
        run: (ctx) => {
            const findings = [];
            const roots = affectedTerraformRoots(ctx);
            if (roots.length === 0)
                return notApplicable('No Terraform root is affected by the requested scope.');
            for (const root of roots) {
                const result = requireToolExecution(safeExec('terraform', [`-chdir=${root}`, 'fmt', '-check', '-recursive'], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'terraform-fmt');
                const files = result.stdout.split('\n').filter(Boolean);
                if (result.exitCode !== 0 && files.length === 0)
                    failParse(ctx, 'terraform-fmt', { error: 'non-zero exit without file names' }, result, root);
                findings.push(...files.map((file) => ({ file: path.resolve(root, file), line: null, column: null, severity: 'error', code: 'terraform-format', message: 'Terraform file is not in canonical terraform fmt format.' })));
            }
            return findingsResult(findings);
        },
    };
}
function terraformValidateTool() {
    return {
        id: 'terraform-validate',
        name: 'terraform validate',
        binary: 'terraform',
        run: (ctx) => {
            const findings = [];
            const providerMirror = terraformProviderMirror(ctx);
            for (const root of terraformRoots(ctx))
                validateTerraformRoot(ctx, root, providerMirror, findings);
            return findingsResult(findings);
        },
    };
}
function validateTerraformRoot(ctx, root, providerMirror, findings) {
    const findingsBefore = findings.length;
    const lockfile = path.join(root, '.terraform.lock.hcl');
    if (!fs.existsSync(lockfile))
        failConfigMissing('terraform-lockfile-missing', `Terraform root requires a committed provider lockfile: ${lockfile}`);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terraform-lint-data-'));
    try {
        const cliConfig = writeTerraformCliConfig(dataDir, providerMirror);
        const options = { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms, env: { TF_DATA_DIR: dataDir, TF_CLI_CONFIG_FILE: cliConfig } };
        const initialized = requireToolExecution(safeExec('terraform', [`-chdir=${root}`, 'init', '-backend=false', '-get=false', '-input=false', '-lockfile=readonly', '-no-color'], options), 'terraform-init');
        if (initialized.exitCode !== 0)
            throw Object.assign(new Error(`terraform init -backend=false failed for ${root}: ${commandOutput(initialized).split('\n')[0] || 'no output'}`), { code: 'terraform-init-failed' });
        const result = requireToolExecution(safeExec('terraform', [`-chdir=${root}`, 'validate', '-json'], options), 'terraform-validate');
        const parsed = tryParseJson(result.stdout);
        if (!parsed.ok)
            failParse(ctx, 'terraform-validate', parsed, result, root);
        findings.push(...terraformDiagnostics(parsed.data, root));
        if (!parsed.data?.valid && findings.length === findingsBefore)
            failParse(ctx, 'terraform-validate', { error: 'invalid result without diagnostics' }, result, root);
    }
    finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
    }
}
function terraformDiagnostics(data, root) {
    return (Array.isArray(data?.diagnostics) ? data.diagnostics : []).map((diagnostic) => ({
        file: diagnostic.range?.filename ? path.resolve(root, diagnostic.range.filename) : root,
        line: diagnostic.range?.start?.line ?? null, column: diagnostic.range?.start?.column ?? null,
        severity: diagnostic.severity === 'warning' ? 'warning' : 'error', code: 'terraform-validate',
        message: diagnostic.summary ? `${diagnostic.summary}: ${diagnostic.detail || ''}`.trim() : 'Terraform validation finding',
    }));
}
function tflintTool() {
    return {
        id: 'tflint',
        name: 'TFLint',
        binary: 'tflint',
        run: (ctx) => {
            const findings = [];
            for (const root of terraformRoots(ctx))
                findings.push(...runTflint(ctx, root));
            return findingsResult(findings);
        },
    };
}
function runTflint(ctx, root) {
    const result = requireToolExecution(safeExec('tflint', [`--chdir=${root}`, `--config=${ctx.tool.config_path}`, '--format=json', ...ctx.tool.arguments], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'tflint');
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok)
        failParse(ctx, 'tflint', parsed, result, root);
    const findings = (Array.isArray(parsed.data?.issues) ? parsed.data.issues : []).map((issue) => ({
        file: issue.range?.filename ? path.resolve(root, issue.range.filename) : root,
        line: issue.range?.start?.line ?? null, column: issue.range?.start?.column ?? null,
        severity: issue.rule?.severity === 'warning' ? 'warning' : 'error',
        code: issue.rule?.name || 'tflint', message: issue.message || 'TFLint finding',
    }));
    if (result.exitCode !== 0 && findings.length === 0)
        failParse(ctx, 'tflint', { error: 'non-zero exit without issues' }, result, root);
    return findings;
}
function trivyTerraformTool() {
    return {
        id: 'trivy-terraform',
        name: 'Trivy Terraform',
        binary: 'trivy',
        run: (ctx) => {
            const findings = [];
            for (const root of terraformRoots(ctx))
                findings.push(...runTrivyTerraform(ctx, root));
            return findingsResult(findings);
        },
    };
}
function runTrivyTerraform(ctx, root) {
    const result = requireToolExecution(safeExec('trivy', ['config', '--quiet', '--format', 'json', '--misconfig-scanners', 'terraform', '--severity', 'HIGH,CRITICAL', '--skip-check-update', '--skip-version-check', '--skip-dirs', '.terraform', '--skip-files', '**/*.tfstate*', '--exit-code', '1', ...ctx.tool.arguments, root], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'trivy-terraform');
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok)
        failParse(ctx, 'trivy-terraform', parsed, result, root);
    const findings = (Array.isArray(parsed.data?.Results) ? parsed.data.Results : []).flatMap((entry) => (Array.isArray(entry.Misconfigurations) ? entry.Misconfigurations : []).map((issue) => ({
        file: entry.Target ? path.resolve(root, entry.Target) : root,
        line: issue.CauseMetadata?.StartLine ?? null, column: null, severity: 'error',
        code: issue.ID || 'trivy-terraform', message: issue.Title ?? 'Terraform security misconfiguration',
    })));
    if (result.exitCode !== 0 && findings.length === 0)
        failParse(ctx, 'trivy-terraform', { error: 'non-zero exit without misconfigurations' }, result, root);
    return findings;
}
export function registerTerraformTools(registerTool) {
    registerTool(terraformFmtTool());
    registerTool(terraformValidateTool());
    registerTool(tflintTool());
    registerTool(trivyTerraformTool());
}
