#!/usr/bin/env node
import { execSync } from 'child_process';
import process from 'process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function verifyAndPush(agentRole, currentProject) {
  const logs = [];
  const log = (msg) => logs.push(msg);
  
  const projectRoot = `Projects/${currentProject}`;
  const swarmRoot = `${projectRoot}/src/.swarm`;
  const echoRoot = `${swarmRoot}/echo-reviews`;

  log(`[Verify] Validiere Task für Rolle: '${agentRole}' im Projekt: '${currentProject}'`);

  // 1. Geänderte Dateien via Git ermitteln
  let changedFiles = [];
  let repoRoot = '';
  try {
    repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
    const statusOut = execSync(`git -C "${repoRoot}" status --porcelain`, { encoding: 'utf8' });
    
    if (statusOut.trim()) {
      changedFiles = statusOut.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
          // Behandelt M, A, D, ?? (untracked)
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
    return { status: "success", action: "none", logs };
  }

  // 2. STUFE 1: Harte Firewall-Regeln anwenden (Selective Revert)
  const violations = [];
  const badFiles = [];

  for (const file of changedFiles) {
    let isViolation = false;
    let reason = '';

    if (!file.startsWith(projectRoot)) {
      isViolation = true;
      reason = `[CROSS-PROJECT] Nur Dateien innerhalb von ${projectRoot}/ erlaubt.`;
    } else {
      const isSwarmFile = file.startsWith(swarmRoot);

      if (agentRole.includes('forge')) {
        if (isSwarmFile && !file.endsWith('/STATUS.md') && !file.endsWith('/FORGE.md')) {
          isViolation = true;
          reason = `[FORGE-RESTRICTION] Forge darf in .swarm/ NUR STATUS.md und FORGE.md bearbeiten.`;
        }
      } 
      else if (agentRole.includes('buster') || agentRole.includes('test')) {
        if (!isSwarmFile) {
          isViolation = true;
          reason = `[BUSTER-RESTRICTION] Buster darf KEINEN Applikations-Code ändern.`;
        } else if (!file.endsWith('/STATUS.md') && !file.endsWith('/BUSTER.md')) {
          isViolation = true;
          reason = `[BUSTER-RESTRICTION] Buster darf in .swarm/ NUR STATUS.md und BUSTER.md bearbeiten.`;
        }
      }
      else if (agentRole.includes('echo') || agentRole.includes('review')) {
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

  // Gezieltes Zurücksetzen der verbotenen Dateien
  if (badFiles.length > 0) {
    log('⚠️ STUFE 1 WARNUNG: OUT OF SCOPE MODIFICATIONS DETECTED.');
    violations.forEach(v => log(`  - ${v}`));
    log('[Verify] Bereinige verbotene Änderungen...');
    
    for (const file of badFiles) {
      try {
        const absPath = path.join(repoRoot, file);
        if (fs.existsSync(absPath)) {
          // Wenn die Datei in Git getrackt ist, checkout nutzen. Sonst löschen (untracked)
          execSync(`git -C "${repoRoot}" checkout HEAD -- "${file}" 2>/dev/null || rm -rf "${absPath}"`);
        }
        log(`  -> ⏪ Reverted/Deleted: ${file}`);
      } catch (e) {
        log(`  -> ❌ Konnte ${file} nicht bereinigen.`);
      }
    }
  } else {
    log('✅ [Verify] Stufe 1 Passed (Scope Check).');
  }

  // 3. STUFE 2: Qdrant Memory Check (Nutzt den recall Befehl von memory.js)
  try {
    // Wir suchen nach Einträgen des aktuellen Agenten aus den letzten Stunden (implizit durch Agent-Scope und Limit 1)
    const memoryOutput = execSync(`node /app/skills/memory.js recall --query "recent task" --limit 1`, { encoding: 'utf8' });
    const memories = JSON.parse(memoryOutput);
    
    if (!Array.isArray(memories) || memories.length === 0) {
       throw new Error("No recent memories found");
    }
    log('✅ [Verify] Stufe 2 Passed (Memory Check). Qdrant-Eintrag gefunden.');
  } catch (memoryErr) {
    throw new Error('FEHLENDER MEMORY-EINTRAG. Nutze `node /app/skills/memory.js remember ...` um deine Erkenntnisse zu sichern, bevor du verify aufrufst.');
  }

  // 4. Automatischer Git Push bei Erfolg
  log('✅ [Verify] Alle Bedingungen erfüllt. Führe Commit und Push aus...');
  try {
    const remainingChanges = execSync(`git -C "${repoRoot}" status --porcelain`, { encoding: 'utf8' }).trim();
    if (!remainingChanges) {
      log('⚠️ [Verify] Nach der Bereinigung gab es keine Änderungen mehr zu pushen.');
      return { status: "success", action: "reverted_all_bad_files", logs };
    }

    execSync(`git -C "${repoRoot}" add .`);
    execSync(`git -C "${repoRoot}" commit -m "[${agentRole.toUpperCase()}] Update task via verify-task.js"`);
    execSync(`git -C "${repoRoot}" push origin HEAD`);
    
    log('✅ [Verify] Push erfolgreich!');
    return { status: "success", action: "pushed", files_pushed: remainingChanges.split('\n').length, logs };
  } catch (gitErr) {
    throw new Error(`Fehler beim Git Push (Konflikte?): ${gitErr.message}`);
  }
}

// --- CLI WRAPPER ---
const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1])) ? fs.realpathSync(process.argv[1]) : process.argv[1];

if (currentPath === entryPath) {
  const agentRole = (process.env.AGENT_ROLE || process.env.AGENT_NAME || 'unknown').toLowerCase();
  let currentProject = process.env.CURRENT_PROJECT;

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      currentProject = args[i + 1];
      break;
    }
  }

  if (!currentProject) {
    console.log(JSON.stringify({ status: "error", error: "Kein Projekt definiert. Nutze --project <name>." }));
    process.exit(1);
  }

  verifyAndPush(agentRole, currentProject).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch(err => {
    console.log(JSON.stringify({ status: "error", error: err.message }));
    process.exit(1);
  });
}

export default verifyAndPush;
