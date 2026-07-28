import path from 'node:path';
function safePath(value, label) {
    if (value.length === 0
        || value.includes('\0')
        || /[\r\n]/.test(value)
        || value.startsWith('/')
        || /^[A-Za-z]:[\\/]/.test(value)
        || value.split(/[\\/]+/).includes('..'))
        throw new Error(`${label} must be a non-empty repository-relative path without traversal`);
    return value.replaceAll('\\', '/').replace(/\/+$/, '');
}
function normalizeComparablePath(value) {
    return value.replaceAll('\\', '/').replace(/^\/+/, '').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '').trim();
}
function ownsPath(ownedPaths, reference) {
    const candidate = normalizeComparablePath(reference);
    return ownedPaths
        .map(normalizeComparablePath)
        .filter(Boolean)
        .some((owned) => candidate === owned || candidate.endsWith(`/${owned}`));
}
async function readText(context, file) {
    const response = await context.invoke('git.repository.read', {
        operation: 'read_text',
        resource: { type: 'git.repository.path', canonicalId: file },
        payload: {},
    });
    if (typeof response.content !== 'string')
        throw new Error('repository adapter returned non-text content');
    return response.content;
}
async function readBlueprint(input, context) {
    const moduleRoot = safePath(input.modulePath, 'modulePath');
    if (input.substeps !== undefined) {
        if (input.substeps.length === 0)
            throw new Error('FORGE_SUBSTEP_INVALID:at least one substep is required');
        const parts = [];
        for (const raw of input.substeps) {
            const substep = safePath(raw, 'substep');
            try {
                parts.push(await readText(context, `${moduleRoot}/${substep}/FORGE.md`));
            }
            catch (error) {
                throw new Error(`FORGE_BLUEPRINT_MISSING:${substep}:${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return parts.join('\n\n---\n\n');
    }
    try {
        return await readText(context, `${moduleRoot}/FORGE.md`);
    }
    catch (error) {
        throw new Error(`FORGE_BLUEPRINT_MISSING:${error instanceof Error ? error.message : String(error)}`);
    }
}
export function validateDeclarations(input, content) {
    const failures = [];
    if (input.serveDockerfile && ownsPath(input.ownedPaths, input.serveDockerfile)) {
        const name = path.posix.basename(normalizeComparablePath(input.serveDockerfile));
        if (!content.includes(name))
            failures.push({
                code: 'preflight_contract.serve_dockerfile_not_declared',
                message: `Owned serve Dockerfile '${name}' is not declared in the Forge blueprint.`,
                nextStep: `Add '${name}' to the required deliverables before retrying Forge.`,
            });
    }
    if (input.apiSpecFile) {
        const name = path.posix.basename(normalizeComparablePath(input.apiSpecFile));
        if (!content.includes(name))
            failures.push({
                code: 'preflight_contract.api_spec_not_declared',
                message: `API specification '${name}' is not declared in the Forge blueprint.`,
                nextStep: `Add '${name}' to the required deliverables before retrying Forge.`,
            });
    }
    return failures;
}
async function report(context, input, failures) {
    const stored = await context.invoke('artifacts.write', {
        operation: 'put_json',
        resource: { type: 'artifact.object', canonicalId: `preflight-contract:${input.moduleId}` },
        payload: {
            namespace: 'kubeclaw.preflight-contract',
            mediaType: 'application/json',
            value: { moduleId: input.moduleId, passed: failures.length === 0, failures },
        },
    });
    return stored.artifact;
}
export async function execute(input, context) {
    let content;
    try {
        content = await readBlueprint(input, context);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = message.startsWith('FORGE_SUBSTEP_INVALID')
            ? 'preflight_contract.substep_invalid'
            : message.includes('must be a non-empty repository-relative')
                ? 'preflight_contract.path_invalid'
                : 'preflight_contract.blueprint_missing';
        const failure = { code, message, nextStep: 'Provide readable, repository-local Forge blueprint files.' };
        return {
            schemaVersion: 'stage-result.v2',
            outcome: 'blocked',
            reason: { code, message },
            artifacts: [await report(context, input, [failure])],
        };
    }
    const failures = validateDeclarations(input, content);
    const artifact = await report(context, input, failures);
    if (failures.length > 0)
        return {
            schemaVersion: 'stage-result.v2',
            outcome: 'request_fix',
            reason: { code: failures[0].code, message: failures[0].message },
            artifacts: [artifact],
        };
    return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [artifact] };
}
