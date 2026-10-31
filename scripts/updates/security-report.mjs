import fs from 'node:fs';
import path from 'node:path';
import { runtimeImages } from './runtime-components.mjs';

const immutable = value => typeof value === 'string' && /^\S+@sha256:[a-f0-9]{64}$/u.test(value);
const cell = value => String(value ?? '').replaceAll('|', '\\|').replace(/[\r\n<>]/gu, ' ');

export function scanInventory(root) {
  const versions = JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8'));
  const images = new Map(), errors = [];
  const add = (reference, source, category) => {
    if (!immutable(reference)) { errors.push(`Invalid immutable image at ${source}`); return; }
    const item = images.get(reference) ?? { reference, sources: [], categories: [] };
    item.sources.push(source);
    if (!item.categories.includes(category)) item.categories.push(category);
    images.set(reference, item);
  };
  const walk = (value, source, category) => {
    if (typeof value === 'string' && value.includes('@sha256:')) add(value, source, category);
    else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) walk(child, `${source}.${key}`, category);
  };
  for (const key of ['buildArgs', 'imageOverrides']) walk(versions[key], `versions.json:${key}`, 'Build input');
  walk(versions.infrastructure, 'versions.json:infrastructure', 'Infrastructure');
  walk(versions.automation, 'versions.json:automation', 'CI / test');
  for (const key of ['redisProduction', 'postgresqlProduction', 'litellmProduction']) walk(versions[key], `versions.json:${key}`, 'Production service');
  add(`ghcr.io/openclaw/openclaw:${versions.openclaw.version}@${versions.openclaw.digest}`, 'versions.json:openclaw', 'Build input');
  for (const [family, names] of [['runtime', runtimeImages], ['ops', ['codex-ops', 'ops-mcp']]]) {
    const file = `releases/${family}-images.json`;
    try {
      const release = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      if (release.schemaVersion !== 1 || !/^[a-f0-9]{40}$/u.test(release.commit)
        || JSON.stringify(Object.keys(release.images ?? {}).sort()) !== JSON.stringify([...names].sort())) throw new Error('invalid release identity or image slots');
      for (const [name, reference] of Object.entries(release.images)) add(reference, `${file}:images.${name}`, 'Selected release');
    } catch (error) { errors.push(`${file}: ${error.code === 'ENOENT' ? 'no release selected; promote a successful main build' : error.message}`); }
  }
  return { images: [...images.values()], errors };
}

export function readScan(item, reportDir, exitCode) {
  const report = `${item.reference.split('@sha256:')[1]}.json`;
  const entry = { ...item, report, exitCode, findings: [] };
  try {
    const data = JSON.parse(fs.readFileSync(path.join(reportDir, report), 'utf8'));
    // An empty Results array is valid for an image with no detected packages.
    if (data.SchemaVersion !== 2 || data.ArtifactType !== 'container_image' || !Array.isArray(data.Results)) throw new Error('invalid Trivy image report');
    const expected = item.reference.split('@')[1];
    if (!data.Metadata?.RepoDigests?.some(digest => digest.endsWith(`@${expected}`))) throw new Error('report does not identify the requested digest');
    for (const result of data.Results) for (const v of result.Vulnerabilities ?? []) {
      if (!['HIGH', 'CRITICAL'].includes(v.Severity)) continue;
      if (!v.VulnerabilityID || !v.PkgName || !v.InstalledVersion) throw new Error('incomplete vulnerability record');
      entry.findings.push({ id: v.VulnerabilityID, severity: v.Severity, package: v.PkgName,
        installed: v.InstalledVersion, fixed: typeof v.FixedVersion === 'string' ? v.FixedVersion.trim() || null : null, status: v.Status || 'unknown',
        target: result.Target, type: result.Type, packagePath: v.PkgPath || null });
    }
    if (exitCode !== 0 && !(exitCode === 1 && entry.findings.length)) throw new Error(`scanner exit ${exitCode} is not a completed vulnerability scan`);
    entry.status = entry.findings.length ? 'vulnerable' : 'clean';
  } catch (error) {
    entry.status = 'error';
    entry.error = error.code === 'ENOENT' ? 'No JSON report produced; inspect scanner logs' : error.message;
    const diagnostics = path.join(reportDir, report.replace(/\.json$/u, '.stderr.log'));
    if (fs.existsSync(diagnostics)) entry.error += `: ${fs.readFileSync(diagnostics, 'utf8').trim().slice(-2000)}`;
  }
  return entry;
}

// Re-evaluated on every scan: a published fix immediately restores blocking.
export function blocksRelease(image) {
  return !['clean', 'vulnerable'].includes(image.status)
    || image.findings.some(finding => Boolean(finding.fixed));
}

export function securityMarkdown(plan, { limit = Infinity } = {}) {
  const vulnerable = plan.images.filter(x => x.status === 'vulnerable');
  const errors = plan.images.filter(x => x.status === 'error');
  const run = plan.runUrl ? `[Scan run and full report artifact](${plan.runUrl})` : 'Local scan; full reports in dist/trivy/';
  let out = `Release security scan: ${plan.generatedAt}\n\n${run}\n\nSource commit: \`${plan.commit || 'local working tree'}\`. ${plan.images.length} unique images: ${vulnerable.length} with HIGH/CRITICAL findings, ${errors.length} scan errors, ${plan.images.filter(x => x.status === 'clean').length} clean.\n\n`;
  out += 'Build inputs, CI images and selected releases are separate scopes; a clean replacement build does not update the selected release. Counts are package/advisory occurrences, not confirmed exploitable paths. No finding or scan failure is suppressed. Gate policy: HIGH/CRITICAL findings with published fixes and scan failures block releases; findings without a published fix are non-blocking and retained for monitoring. Every scan re-evaluates fix availability.\n\n';
  if (plan.errors.length || errors.length) {
    out += '## Scan / configuration failures\n\n';
    for (const error of plan.errors) out += `- ${cell(error)}\n`;
    for (const image of errors) out += `- \`${cell(image.reference)}\`: ${cell(image.error)}; sources: ${image.sources.map(cell).join(', ')}\n`;
    out += '\n';
  }
  out += '## Images to update\n\n| Scope / configuration source | Image | Critical | High | Without published fix | Action |\n| --- | --- | ---: | ---: | ---: | --- |\n';
  for (const image of vulnerable) {
    const action = image.categories.includes('Selected release')
      ? 'Fix source dependencies, build and scan, then promote the verified receipt; do not edit a release digest by hand.'
      : image.categories.includes('Build input') ? 'Update this upstream tag/digest, rebuild its consumers, and scan both the base and final images.'
        : 'Update this pinned upstream image and validate its service before rollout.';
    out += `| ${image.categories.join(', ')}; ${image.sources.map(cell).join('; ')} | \`${cell(image.reference)}\` | ${image.findings.filter(v => v.severity === 'CRITICAL').length} | ${image.findings.filter(v => v.severity === 'HIGH').length} | ${image.findings.filter(v => !v.fixed).length} | ${action} |\n`;
  }
  out += '\n## Package update details\n\nEach row retains the advisory-specific installed/fixed pair. Findings without published fixes remain visible but do not block promotion. They become blocking automatically when a later scan reports a fix. Files and package paths are preserved in `update-plan.json` and the digest-named Trivy JSON reports in the artifact.\n\n';
  let omitted = false;
  for (const image of vulnerable) {
    const grouped = new Map();
    for (const v of image.findings) {
      const key = JSON.stringify([v.package, v.installed, v.fixed, v.severity]);
      const row = grouped.get(key) ?? { ...v, ids: new Set() };
      row.ids.add(v.id); grouped.set(key, row);
    }
    let section = `### ${image.sources.map(cell).join(', ')}\n\n| Package | Installed | Published fixed versions | Severity | Advisories |\n| --- | --- | --- | --- | --- |\n`;
    for (const row of [...grouped.values()].sort((a,b) => a.package.localeCompare(b.package))) {
      section += `| ${cell(row.package)} | ${cell(row.installed)} | ${cell(row.fixed || 'No published fix')} | ${row.severity} | ${[...row.ids].sort().map(cell).join(', ')} |\n`;
    }
    section += '\n';
    if (out.length + section.length + 700 > limit) { omitted = true; continue; }
    out += section;
  }
  if (omitted) out += '\nThe package tables exceed GitHub’s issue size limit. Download the **release-security-reports** artifact from the scan run: **update-plan.md** contains every table; **update-plan.json** contains every advisory, package path, installed version and published fix. The image overview above is complete.\n';
  out += '\nClose only after a complete successful scan of the selected releases and pinned inputs. A new PR or a clean candidate scan alone does not resolve this issue.\n';
  return out;
}

export function writeSecurityReport(plan, directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'update-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'update-plan.md'), securityMarkdown(plan));
  fs.writeFileSync(path.join(directory, 'security-issue.md'), securityMarkdown(plan, { limit: 55000 }));
}
