#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

async function mergeReviews(currentProject) {
  const logs = [];
  const log = (msg) => logs.push(msg);

  // 1. Determine absolute paths
  let repoRoot;
  try {
    repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch (e) {
    throw new Error('Could not determine Git root directory. Are you inside a Git repository?');
  }

  const reviewsDir = path.join(repoRoot, 'Projects', currentProject, 'src', '.swarm', 'echo-reviews');
  log(`[Merge] Starting dynamic consolidation for project: '${currentProject}' in ${reviewsDir}`);

  if (!fs.existsSync(reviewsDir)) {
    throw new Error(`Directory not found: ${reviewsDir}`);
  }

  const files = fs.readdirSync(reviewsDir).filter(f => f.startsWith('review-') && f.endsWith('.json'));

  if (files.length === 0) {
    throw new Error('No review JSON files found.');
  }

  // 2. Dynamic data aggregation
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

      // Hard consensus rule: a single NO-GO overrides everything
      if (review.status === "NO-GO") {
        finalStatus = "NO-GO";
      }

      // Dynamically iterate over all JSON keys
      for (const [key, value] of Object.entries(review)) {
        if (key === "status") continue; // Status is handled separately

        if (!mergedData[key]) mergedData[key] = []; // Dynamically initialize array

        // Distinguish data types for clean formatting later
        if (Array.isArray(value)) {
          value.forEach(item => mergedData[key].push({ agent: agentName, data: item }));
        } else if (typeof value === 'object' && value !== null) {
          // For objects (e.g. checklist_results) store the entire object
          mergedData[key].push({ agent: agentName, data: value });
        } else {
          // Strings, Numbers, Booleans
          if (value !== "" && value !== null) {
            mergedData[key].push({ agent: agentName, data: value });
          }
        }
      }

    } catch (err) {
      throw new Error(`Error parsing ${file}: ${err.message}`);
    }
  }

  // 3. Dynamic Markdown generation
  const timestamp = new Date().toISOString();

  // Helper: "critical_blockers" -> "Critical Blockers"
  const formatHeader = (str) => {
    return str.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  };

  let markdownContent = `# Echo Review (Consensus)\n**Date:** ${timestamp}\n**Evaluated by:** ${evaluatedBy.join(', ')}\n\n## Release Readiness: [${finalStatus}]\n\n`;

  for (const [key, items] of Object.entries(mergedData)) {
    if (items.length === 0) continue;

    markdownContent += `## ${formatHeader(key)}\n`;

    items.forEach(item => {
      // If the data is a nested JSON object (e.g. array of issue objects)
      if (typeof item.data === 'object' && item.data !== null) {
        markdownContent += `- **[${item.agent}]**\n`;
        for (const [subKey, subVal] of Object.entries(item.data)) {
          markdownContent += `  - **${formatHeader(subKey)}**: ${subVal}\n`;
        }
      } else {
        // Normal text blocks or strings
        markdownContent += `- **[${item.agent}]**: ${item.data}\n`;
      }
    });
    
    markdownContent += `\n`;
  }

  // 4. Save file
  const outputPath = path.join(reviewsDir, 'FINAL-REVIEW.md');
  fs.writeFileSync(outputPath, markdownContent.trim());

  log(`✅ [Merge] Dynamic Markdown report created at: ${outputPath}`);
  log(`✅ [Merge] Final consensus result: ${finalStatus}`);

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
    console.log(JSON.stringify({ status: "error", error: "No project defined. Use --project <name>." }));
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
