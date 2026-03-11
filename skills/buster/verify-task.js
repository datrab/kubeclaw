#!/usr/bin/env node

// =============================================================================
// VERIFY-TASK.JS — Agent Scope Firewall + Controlled Push
// =============================================================================
//
// Validates that an agent only modified files within its allowed scope,
// reverts violations, checks memory compliance, then commits and pushes.
//
// Called by redis.js (complete action) as part of the completion chain:
//   Subagent → redis.js → verify-task.js → git push → Redis completion
//
// Security: All external commands use execFileSync (array args, no shell).
//
// Agent scope rules:
//   forge  → project code + .swarm/{STATUS.md, FORGE.md}
//   buster → .swarm/ only (anything inside, NO app code outside)
//   echo   → .swarm/echo-reviews/ only
//
// =============================================================================

import { execFileSync } from 'child_process';
import process from 'process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Git Helpers (shell-free) ───────────────────────────────────────────────

function gitExec(repoRoot, args, opts = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000 };
  const result = execFileSync('git', ['-C', repoRoot, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}

function getRepoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function verifyAndPush(agentRole, currentProject, opts = {}) {
  const logs = [];
  const log = (msg) => logs.push(msg);

  const requireMemory = opts.requireMemory ?? true;
  const commitMessage = opts.commitMessage
    || `[${agentRole.toUpperCase()}] Update task via verify-task.js`;

  const projectRoot = `Projects/${currentProject}`;
  const swarmRoot = `${projectRoot}/src/.swarm`;
  const echoRoot = `${swarmRoot}/echo-reviews`;

  log(`[Verify] Validiere Task für Rolle: '${agentRole}' im Projekt: '${currentProject}'`);

  // ── 1. Geänderte Dateien via Git ermitteln ──

  let changedFiles = [];
  let repoRoot = '';
  try {
    repoRoot = getRepoRoot();
    const statusOut = gitExec(repoRoot, ['status', '--porcelain']);

    if (statusOut) {
      changedFiles = statusOut.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
          // Git porcelain: XY filename  oder  XY old -> new (bei rename)
          const filePart = line.substring(3).trim();
          if (filePart.includes(' -> ')) return filePart.split(' -> ')[1].replace(/^"|"$/g, '');
          return filePart.replace(/^"|"$/g, '');
        })
        .filter(Boolean);
    }
  } catch (e) {
    throw new Error(`Kritischer Fehler beim Auslesen des Git-Status: ${e.message}`);
  }

  if (changedFiles.length === 0) {
    log('⚠️ [Verify] Keine ungespeicherten Änderungen gefunden. Nichts zu tun.');
    return { status: 'success', action: 'none', logs };
  }

  // ── 2. STUFE 1: Harte Firewall-Regeln (Selective Revert) ──

  const violations = [];
  const badFiles = [];

  for (const file of changedFiles) {
    let isViolation = false;
    let reason = '';

    // Cross-project check — universell für alle Rollen
    if (!file.startsWith(projectRoot)) {
      isViolation = true;
      reason = `[CROSS-PROJECT] Nur Dateien innerhalb von ${projectRoot}/ erlaubt.`;
    } else {
      const isSwarmFile = file.startsWith(swarmRoot);

      if (agentRole.includes('forge')) {
        // Forge darf Projekt-Code UND bestimmte .swarm Files ändern
        if (isSwarmFile && !file.endsWith('/STATUS.md') && !file.endsWith('/FORGE.md')) {
          isViolation = true;
          reason = `[FORGE-RESTRICTION] Forge darf in .swarm/ NUR STATUS.md und FORGE.md bearbeiten.`;
        }
      }
      else if (agentRole.includes('buster') || agentRole.includes('test')) {
        // Buster darf ALLES innerhalb von .swarm/ (status.json, Testresultate, BUSTER.md, etc.)
        // Aber KEINEN Applikations-Code außerhalb von .swarm/
        if (!isSwarmFile) {
          isViolation = true;
          reason = `[BUSTER-RESTRICTION] Buster darf KEINEN Applikations-Code ändern. Nur Dateien innerhalb von ${swarmRoot}/ sind erlaubt.`;
        }
      }
      else if (agentRole.includes('echo') || agentRole.includes('review')) {
        // Echo darf nur in echo-reviews/
        if (!file.startsWith(echoRoot)) {
          isViolation = true;
          reason = `[ECHO-RESTRICTION] Echo darf AUSSCHLIESSLICH im Ordner ${echoRoot}/ arbeiten.`;
        }
      }
    }

    if (isViolation) {
      violations.push(`${file} -> ${reason}`);
      badFiles.push(file);
    }
  }

  // Gezieltes Zurücksetzen verbotener Dateien
  if (badFiles.length > 0) {
    log('⚠️ STUFE 1 WARNUNG: OUT OF SCOPE MODIFICATIONS DETECTED.');
    violations.forEach(v => log(`  - ${v}`));
    log('[Verify] Bereinige verbotene Änderungen...');

    for (const file of badFiles) {
      try {
        const absPath = path.join(repoRoot, file);
        // Versuch 1: Git checkout (für getrackte Dateien)
        try {
          gitExec(repoRoot, ['checkout', 'HEAD', '--', file], { stdio: 'ignore' });
        } catch {
          // Versuch 2: Datei löschen (für untracked files)
          if (fs.existsSync(absPath)) {
            fs.rmSync(absPath, { force: true, recursive: true });
          }
        }
        log(`  -> ⏪ Reverted/Deleted: ${file}`);
      } catch (e) {
        log(`  -> ❌ Konnte ${file} nicht bereinigen: ${e.message}`);
      }
    }
  } else {
    log('✅ [Verify] Stufe 1 Passed (Scope Check).');
  }

  // ── 3. STUFE 2: Qdrant Memory Check ──

  if (requireMemory) {
    try {
      const memoryOutput = execFileSync(
        'node', ['/app/skills/memory.js', 'recall', '--query', 'recent task', '--limit', '1'],
        { encoding: 'utf8', timeout: 15000, env: process.env }
      );
      const memories = JSON.parse(memoryOutput);

      if (!Array.isArray(memories) || memories.length === 0) {
        throw new Error('No recent memories found');
      }
      log('✅ [Verify] Stufe 2 Passed (Memory Check). Qdrant-Eintrag gefunden.');
    } catch (memoryErr) {
      throw new Error(
        'FEHLENDER MEMORY-EINTRAG. Nutze `node /app/skills/memory.js remember ...` ' +
        'um deine Erkenntnisse zu sichern, bevor du verify aufrufst.'
      );
    }
  } else {
    log('ℹ️ [Verify] Stufe 2 Skipped (Memory Check disabled).');
  }

  // ── 4. Scoped Git Add + Commit + Push ──

  log('✅ [Verify] Alle Bedingungen erfüllt. Führe Commit und Push aus...');
  try {
    const remainingChanges = gitExec(repoRoot, ['status', '--porcelain']);
    if (!remainingChanges) {
      log('⚠️ [Verify] Nach der Bereinigung gab es keine Änderungen mehr zu pushen.');
      return { status: 'success', action: 'reverted_all_bad_files', logs };
    }

    // Scoped add — nur das Projekt-Verzeichnis, nicht das ganze Repo
    gitExec(repoRoot, ['add', projectRoot], { stdio: 'ignore' });
    gitExec(repoRoot, ['commit', '-m', commitMessage], { stdio: 'ignore' });

    // Push mit einfachem Retry (Netzwerk-Transienten)
    let pushed = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        gitExec(repoRoot, ['push', 'origin', 'HEAD'], { stdio: 'ignore', timeout: 60000 });
        pushed = true;
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        log(`⚠️ [Verify] Push attempt ${attempt}/3 failed: ${e.message?.split('\n')[0]}`);
        // Kurzer synchroner Wait
        execFileSync('sleep', ['3']);
      }
    }

    // Commit hash nach Push erfassen
    const commitHash = gitExec(repoRoot, ['rev-parse', '--short', 'HEAD']);

    log(`✅ [Verify] Push erfolgreich! (${commitHash})`);
    return {
      status: 'success',
      action: 'pushed',
      files_pushed: remainingChanges.split('\n').filter(l => l.trim()).length,
      commit_hash: commitHash,
      logs,
    };
  } catch (gitErr) {
    throw new Error(`Fehler beim Git Push (Konflikte?): ${gitErr.message}`);
  }
}

// ─── CLI Wrapper ────────────────────────────────────────────────────────────

const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (currentPath === entryPath) {
  const args = process.argv.slice(2);

  const getArg = (name) => {
    const i = args.indexOf(`--${name}`);
    return i > -1 && args[i + 1] ? args[i + 1] : null;
  };
  const hasFlag = (name) => args.includes(`--${name}`);

  const agentRole = (getArg('role') || process.env.AGENT_ROLE || process.env.AGENT_NAME || 'unknown').toLowerCase();
  const currentProject = getArg('project') || process.env.CURRENT_PROJECT;
  const requireMemory = !hasFlag('no-memory-check');
  const commitMessage = getArg('message');

  if (!currentProject) {
    console.log(JSON.stringify({ status: 'error', error: 'Kein Projekt definiert. Nutze --project <name>.' }));
    process.exit(1);
  }

  verifyAndPush(agentRole, currentProject, { requireMemory, commitMessage }).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch(err => {
    console.log(JSON.stringify({ status: 'error', error: err.message }));
    process.exit(1);
  });
}

export default verifyAndPush;
