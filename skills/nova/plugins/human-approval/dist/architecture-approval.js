import { execute as executeApproval } from './stage.js';
function requiredText(value, label, maximum) {
    if (typeof value !== 'string')
        throw new Error(`ARCHITECTURE_APPROVAL_${label}_INVALID`);
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum || normalized.includes('\0') || /[\r\n]/u.test(normalized)) {
        throw new Error(`ARCHITECTURE_APPROVAL_${label}_INVALID`);
    }
    return normalized;
}
function parseInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('ARCHITECTURE_APPROVAL_INPUT_INVALID');
    }
    const input = value;
    const allowed = new Set(['summary', 'artifactId', 'namespace']);
    const unknown = Object.keys(input).find((key) => !allowed.has(key));
    if (unknown)
        throw new Error(`ARCHITECTURE_APPROVAL_INPUT_UNKNOWN_FIELD:${unknown}`);
    return Object.freeze({
        summary: requiredText(input.summary, 'SUMMARY', 4_096),
        artifactId: requiredText(input.artifactId, 'ARTIFACT_ID', 2_048),
        namespace: requiredText(input.namespace, 'NAMESPACE', 1_024),
    });
}
function reportText(value, label, maximum) {
    if (typeof value !== 'string' || value.includes('\0')) {
        throw new Error(`ARCHITECTURE_APPROVAL_${label}_INVALID`);
    }
    const normalized = value.replace(/\s+/gu, ' ').trim();
    if (!normalized || normalized.length > maximum) {
        throw new Error(`ARCHITECTURE_APPROVAL_${label}_INVALID`);
    }
    return normalized;
}
function findingSummary(value, maximum) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('ARCHITECTURE_APPROVAL_ARTIFACT_INVALID');
    }
    const findings = value.findings;
    if (!Array.isArray(findings))
        throw new Error('ARCHITECTURE_APPROVAL_FINDINGS_INVALID');
    if (findings.length === 0)
        return '';
    const fragments = findings.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`ARCHITECTURE_APPROVAL_FINDING_INVALID:${index}`);
        }
        const finding = entry;
        return [
            reportText(finding.severity, `FINDING_${index}_SEVERITY`, 32).toUpperCase(),
            reportText(finding.id, `FINDING_${index}_ID`, 256),
            reportText(finding.explanation, `FINDING_${index}_EXPLANATION`, 8_192),
            `Remediation: ${reportText(finding.remediation, `FINDING_${index}_REMEDIATION`, 8_192)}`,
        ].join(' · ');
    });
    const prefix = `${findings.length} architecture finding${findings.length === 1 ? '' : 's'}: `;
    let rendered = prefix;
    for (const [index, fragment] of fragments.entries()) {
        const separator = index === 0 ? '' : ' | ';
        const remaining = maximum - rendered.length - separator.length;
        if (remaining <= 0)
            break;
        if (fragment.length <= remaining) {
            rendered += `${separator}${fragment}`;
            continue;
        }
        const suffix = ' … Full details remain in the architecture artifact.';
        const available = Math.max(0, remaining - suffix.length);
        rendered += `${separator}${fragment.slice(0, available).trimEnd()}${suffix}`;
        break;
    }
    return rendered.slice(0, maximum).trimEnd();
}
export async function execute(rawInput, context) {
    const input = parseInput(rawInput);
    const response = await context.invoke('artifacts.read', {
        operation: 'get_latest_json',
        resource: { type: 'artifact.object', canonicalId: input.artifactId },
        payload: { namespace: input.namespace },
    });
    const approvalPrefix = `${input.summary} Findings: `;
    const findings = findingSummary(response.value, 10_000 - approvalPrefix.length);
    if (!findings) {
        return {
            schemaVersion: 'stage-result.v2',
            outcome: 'passed',
            artifacts: [],
        };
    }
    return executeApproval({ summary: `${approvalPrefix}${findings}` }, context);
}
