import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import fs from 'fs';
import path from 'path';

const RUNTIME_ROOTS = [
  'skills/nova/pipeline',
  'skills/common/pipeline',
  'skills/buster/pipeline',
];

const CODE_FILE_RE = /\.(?:js|mjs|cjs|ts)$/;
const SKIP_FILE_RE = /\.(?:d\.ts|test\.(?:js|mjs|cjs|ts)|spec\.(?:js|mjs|cjs|ts))$/;


function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.git', '.swarm'].includes(entry.name)) continue;
      walk(abs, out);
    } else if (entry.isFile() && CODE_FILE_RE.test(entry.name) && !SKIP_FILE_RE.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function relPath(sourceRoot, filePath) {
  return path.relative(sourceRoot, filePath).replace(/\\/g, '/');
}

function hasFallbackOperator(line) {
  return line.includes('??') || line.includes('||') || /\bfirstPresent(?:String)?\s*\(/.test(line);
}

function operatorKinds(line) {
  const kinds = [];
  if (line.includes('??')) kinds.push('??');
  if (line.includes('||')) kinds.push('||');
  if (/\bfirstPresent(?:String)?\s*\(/.test(line)) kinds.push('firstPresent');
  return kinds;
}

function compactLine(line) {
  return line.trim().replace(/\s+/g, ' ');
}

function isCommentOnly(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

function looksLikeBooleanGuard(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('||') || trimmed.includes('??') || /\bfirstPresent(?:String)?\s*\(/.test(trimmed)) return false;
  if (/=\s*[^=]/.test(trimmed) || /:\s*[^:]/.test(trimmed)) return false;
  if (!/^(if|while|return)\b/.test(trimmed)) return false;
  return /(?:===|!==|==|!=|>=|<=|>|<|\binstanceof\b|\bincludes\s*\(|\bstartsWith\s*\(|\bendsWith\s*\(|\btest\s*\(|\bhas\s*\()/.test(trimmed);
}

function hasFieldAlias(line) {
  const normalized = line.replace(/\s+/g, ' ');
  if (/[A-Za-z0-9_?.]+\.[a-z]+_[a-z0-9_]+\s*(?:\?\?|\|\|)\s*[A-Za-z0-9_?.]+\.[a-z]+[A-Z][A-Za-z0-9_]*/.test(normalized)) return true;
  if (/[A-Za-z0-9_?.]+\.[a-z]+[A-Z][A-Za-z0-9_]*\s*(?:\?\?|\|\|)\s*[A-Za-z0-9_?.]+\.[a-z]+_[a-z0-9_]*/.test(normalized)) return true;
  if (/\b(?:gateType|gate_type|runId|run_id|moduleId|module_id|gateId|gate_id|dispatchId|dispatch_id|sessionKey|session_key|agentId|agent_id|gatewayLabel|gateway_label|activeStatePath|active_state_path)\b.*(?:\?\?|\|\|).*\b(?:gateType|gate_type|runId|run_id|moduleId|module_id|gateId|gate_id|dispatchId|dispatch_id|sessionKey|session_key|agentId|agent_id|gatewayLabel|gateway_label|activeStatePath|active_state_path)\b/.test(normalized)) return true;
  return false;
}

function hasAuthorityToken(line) {
  return /\b(?:run_id|runId|module_id|moduleId|gate_id|gateId|dispatch_id|dispatchId|session_key|sessionKey|attempt|completion_key|completionKey|output_file|outputFile|artifact|task_id|taskId|project|agentId|agent_id|model|runtime|cwd|label|webhook_url|webhookUrl|source_image|sourceImage|preview_url|previewUrl|namespace|registry_image|registryImage)\b/.test(line);
}

function hasConfigDefaultToken(line) {
  return /\b(?:DEFAULT|DEFAULTS|default[A-Z]|fallback[A-Z]|timeout|Timeout|pollMs|retry|Retry|cooldown|Cooldown|process\.env|envFlag|rawConfig|config|policy|Policy)\b/.test(line);
}

function hasDependencyInjectionToken(line) {
  return /\b(?:opts|options|deps)\.(?:[A-Za-z0-9_?.]+)\b/.test(line)
    && /\b(?:create|load|spawn|poll|logger|signal|budget|execFile|RedisCtor|redisClient|eventBus|sendDiscord|default[A-Z]|[A-Za-z]+Default)\b/.test(line);
}

function hasDisplayPlaceholder(line) {
  return /['"`](?:unknown|Unknown|global|Value|N\/A|unavailable|not_configured|Not available[^'"`]*|not available[^'"`]*)['"`]/.test(line);
}

function hasExplicitNullishAbsence(line) {
  return /(?:\?\?|\|\|)\s*(?:null|undefined)\b/.test(line);
}

function classify(line) {
  if (isCommentOnly(line)) {
    return {
      category: 'comment-or-doc',
      action: 'Ignore for runtime behavior; remove if it documents an obsolete fallback policy.',
    };
  }
  if (looksLikeBooleanGuard(line)) {
    return {
      category: 'boolean-guard',
      action: 'Keep only if this is pure control flow and does not select authority or defaults.',
    };
  }
  if (hasFieldAlias(line)) {
    return {
      category: 'legacy-compat-alias',
      action: 'Choose one canonical field, migrate callers/tests, and delete the multi-field alias.',
    };
  }
  if (hasDisplayPlaceholder(line)) {
    return {
      category: 'display-placeholder',
      action: 'Replace placeholder text with omitted field or typed reason such as not_configured/not_emitted/not_applicable.',
    };
  }
  if (hasDependencyInjectionToken(line)) {
    return {
      category: 'dependency-injection-default',
      action: 'Move default wiring to test harness or composition boundary; runtime should receive concrete dependencies.',
    };
  }
  if (hasAuthorityToken(line)) {
    return {
      category: 'required-authority-review',
      action: 'If authority is required, validate and fail typed at the boundary; otherwise model absence explicitly.',
    };
  }
  if (hasConfigDefaultToken(line)) {
    return {
      category: 'config-default-review',
      action: 'Move real defaults to config/schema normalization and read the normalized required value downstream.',
    };
  }
  if (hasExplicitNullishAbsence(line)) {
    return {
      category: 'optional-absence-review',
      action: 'Confirm the value is optional in the contract; do not use absence to hide missing authority.',
    };
  }
  return {
    category: 'manual-review',
    action: 'Classify manually before changing behavior.',
  };
}

function inventory(sourceRoot) {
  const files = RUNTIME_ROOTS.flatMap((root) => walk(path.join(sourceRoot, root))).sort();
  const candidates = [];
  for (const filePath of files) {
    const rel = relPath(sourceRoot, filePath);
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!hasFallbackOperator(line)) return;
      const classification = classify(line);
      candidates.push({
        file: rel,
        line: index + 1,
        operators: operatorKinds(line),
        category: classification.category,
        action: classification.action,
        code: compactLine(line),
      });
    });
  }
  return candidates;
}

function summarize(candidates) {
  const byCategory = new Map();
  const byFile = new Map();
  for (const candidate of candidates) {
    byCategory.set(candidate.category, (byCategory.get(candidate.category) ?? 0) + 1);
    byFile.set(candidate.file, (byFile.get(candidate.file) ?? 0) + 1);
  }
  return {
    total: candidates.length,
    byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    byFile: [...byFile.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}

function markdown(candidates, args) {
  const summary = summarize(candidates);
  const rowsPerCategory = Number.isInteger(args.markdownRowsPerCategory) && args.markdownRowsPerCategory > 0
    ? args.markdownRowsPerCategory
    : 80;
  const out = [];
  out.push('# Runtime Fallback Authority Ledger');
  out.push('');
  out.push('Generated by `tests/verification/contracts/build-runtime-fallback-authority-ledger.mjs`.');
  out.push('');
  out.push('## Policy');
  out.push('');
  out.push('- Required authority missing: fail loudly with a typed error.');
  out.push('- Product defaults belong in config/schema normalization only.');
  out.push('- Runtime callsites must not silently choose fallback authority.');
  out.push('- Optional absence must be modeled explicitly; avoid display placeholders like `unknown`.');
  out.push('- Dependency defaults belong in tests or composition boundaries, not scattered runtime paths.');
  out.push('- Multiple field names are not canonical; choose one field and migrate callers.');
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push(`- Total runtime fallback candidates: ${summary.total}`);
  out.push('');
  out.push('### By Category');
  out.push('');
  for (const [category, count] of summary.byCategory) {
    out.push(`- ${category}: ${count}`);
  }
  out.push('');
  out.push('### Top Files');
  out.push('');
  for (const [file, count] of summary.byFile.slice(0, 30)) {
    out.push(`- ${file}: ${count}`);
  }
  out.push('');
  out.push('## Review Queue');
  out.push('');
  for (const [category] of summary.byCategory) {
    const entries = candidates.filter((candidate) => candidate.category === category);
    out.push(`### ${category}`);
    out.push('');
    out.push(entries[0]?.action ? `Action: ${entries[0].action}` : 'Action: classify manually.');
    out.push('');
    for (const candidate of entries.slice(0, rowsPerCategory)) {
      out.push(`- ${candidate.file}:${candidate.line} [${candidate.operators.join(', ')}] \`${candidate.code.replace(/`/g, '\\`')}\``);
    }
    if (entries.length > rowsPerCategory) {
      out.push(`- ... ${entries.length - rowsPerCategory} more in full JSON inventory.`);
    }
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

function main() {
  const args = parseSourceRootArgs();
  const candidates = inventory(args.sourceRoot);
  const payload = {
    generated_at: new Date().toISOString(),
    source_root: args.sourceRoot,
    runtime_roots: RUNTIME_ROOTS,
    summary: summarize(candidates),
    candidates,
  };

  if (args.outDir) {
    fs.mkdirSync(args.outDir, { recursive: true });
    fs.writeFileSync(path.join(args.outDir, 'runtime-fallback-authority-ledger.json'), `${JSON.stringify(payload, null, 2)}\n`);
    fs.writeFileSync(path.join(args.outDir, 'runtime-fallback-authority-ledger.md'), markdown(candidates, args));
  } else {
    process.stdout.write(markdown(candidates, args));
  }
}

main();
