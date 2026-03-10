#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

async function mergeReviews(currentProject) {
  const logs = [];
  const log = (msg) => logs.push(msg);

  // 1. Absolute Pfade ermitteln
  let repoRoot;
  try {
    repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch (e) {
    throw new Error('Konnte das Git-Root-Verzeichnis nicht ermitteln. Bist du in einem Git-Repository?');
  }

  const reviewsDir = path.join(repoRoot, 'Projects', currentProject, 'src', '.swarm', 'echo-reviews');
  log(`[Merge] Starte dynamische Konsolidierung für Projekt: '${currentProject}' in ${reviewsDir}`);

  if (!fs.existsSync(reviewsDir)) {
    throw new Error(`Verzeichnis nicht gefunden: ${reviewsDir}`);
  }

  const files = fs.readdirSync(reviewsDir).filter(f => f.startsWith('review-') && f.endsWith('.json'));

  if (files.length === 0) {
    throw new Error('Keine Review-JSON-Dateien gefunden.');
  }

  // 2. Dynamische Daten-Aggregation
  let finalStatus = "GO";
  const mergedData = {}; 
  const evaluatedBy = [];

  for (const file of files) {
    const filePath = path.join(reviewsDir, file);
    const agentName = file.replace('review-', '').replace('.json', '');
    evaluatedBy.push(agentName);
    
    try {
      const rawData = fs.readFileSync(filePath, 'utf8');
      const review = JSON.parse(rawData);

      // Harte Konsens-Regel: Ein einziges NO-GO überstimmt alles
      if (review.status === "NO-GO") {
        finalStatus = "NO-GO";
      }

      // Dynamisches Iterieren über alle JSON-Schlüssel
      for (const [key, value] of Object.entries(review)) {
        if (key === "status") continue; // Status wird separat behandelt

        if (!mergedData[key]) mergedData[key] = []; // Dynamisch Array initialisieren

        // Unterscheidung der Datentypen für saubere spätere Formatierung
        if (Array.isArray(value)) {
          value.forEach(item => mergedData[key].push({ agent: agentName, data: item }));
        } else if (typeof value === 'object' && value !== null) {
          // Bei Objekten (z. B. checklist_results) das gesamte Objekt speichern
          mergedData[key].push({ agent: agentName, data: value });
        } else {
          // Strings, Numbers, Booleans
          if (value !== "" && value !== null) {
            mergedData[key].push({ agent: agentName, data: value });
          }
        }
      }

    } catch (err) {
      throw new Error(`Fehler beim Parsen von ${file}: ${err.message}`);
    }
  }

  // 3. Dynamische Markdown-Generierung
  const timestamp = new Date().toISOString();

  // Hilfsfunktion: "critical_blockers" -> "Critical Blockers"
  const formatHeader = (str) => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  };

  let markdownContent = `# Echo Review (Consensus)\n**Date:** ${timestamp}\n**Evaluated by:** ${evaluatedBy.join(', ')}\n\n## Release Readiness: [${finalStatus}]\n\n`;

  for (const [key, items] of Object.entries(mergedData)) {
    if (items.length === 0) continue;

    markdownContent += `## ${formatHeader(key)}\n`;

    items.forEach(item => {
      // Wenn die Daten ein verschachteltes JSON-Objekt sind (z. B. Array aus Issue-Objekten)
      if (typeof item.data === 'object' && item.data !== null) {
        markdownContent += `- **[${item.agent}]**\n`;
        for (const [subKey, subVal] of Object.entries(item.data)) {
          markdownContent += `  - **${formatHeader(subKey)}**: ${subVal}\n`;
        }
      } else {
        // Normale Textblöcke oder Strings
        markdownContent += `- **[${item.agent}]**: ${item.data}\n`;
      }
    });
    
    markdownContent += `\n`;
  }

  // 4. Datei speichern
  const outputPath = path.join(reviewsDir, 'FINAL-REVIEW.md');
  fs.writeFileSync(outputPath, markdownContent.trim());

  log(`✅ [Merge] Dynamischer Markdown-Bericht erstellt unter: ${outputPath}`);
  log(`✅ [Merge] Finales Konsens-Resultat: ${finalStatus}`);

  fs.writeFileSync(path.join(reviewsDir, '.merge_status'), finalStatus);
  
  return { 
    status: "success", 
    final_consensus: finalStatus, 
    agents_evaluated: evaluatedBy, 
    report_path: outputPath,
    logs 
  };
}

// --- CLI WRAPPER ---
const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryPath = (process.argv[1] && fs.existsSync(process.argv[1])) ? fs.realpathSync(process.argv[1]) : process.argv[1];

if (currentPath === entryPath) {
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

  mergeReviews(currentProject).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch(err => {
    console.log(JSON.stringify({ status: "error", error: err.message }));
    process.exit(1);
  });
}
