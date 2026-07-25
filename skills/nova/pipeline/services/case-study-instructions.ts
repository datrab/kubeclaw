import fs from 'fs';
import path from 'path';
import { relPath } from '../core/paths.ts';
import { sanitizeMarkdownText } from '../egress.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import { buildRunFacts } from './run-facts.ts';
import {
  caseStudyInstructionsPath,
  caseStudyOutputPath,
} from './case-study-values.ts';

export function writeCaseStudyInstructions(
  config: any,
  caseStudy: any = {},
  progress: any = null
) {
  const outputPath = caseStudyOutputPath(config, caseStudy);
  const instructionsPath = caseStudyInstructionsPath(config);
  fs.mkdirSync(path.dirname(instructionsPath), { recursive: true });

  const logDir = getPipelineArtifactBundle(config).pipeline_dir;
  const caseStudyBasePath = logDir
    ? path.join(logDir, 'case-study.base.json')
    : null;
  const runFactsPath = logDir
    ? path.join(logDir, 'case-study.run-facts.json')
    : null;
  const projectSummaryPath = logDir
    ? path.join(logDir, 'project-summary.json')
    : null;

  if (runFactsPath) {
    fs.mkdirSync(path.dirname(runFactsPath), { recursive: true });
    fs.writeFileSync(
      runFactsPath,
      JSON.stringify(buildRunFacts(config, progress), null, 2)
    );
  }

  const content = `You are writing a polished, publishable case study for the project: ${config.project}

## Input Data

Read the following pipeline artifacts to gather all project information:
- Canonical run facts: ${runFactsPath}
- Case study base data: ${caseStudyBasePath}
- Project summary: ${projectSummaryPath}

Do NOT read source code files. Only use the pipeline artifacts listed above.

## Output

Write a single markdown file to: ${relPath(config, outputPath)}

The case study must include ALL of the following sections:

### Overview
What was built, in one paragraph. Include the project name, its purpose, and the high-level outcome.

### Architecture
The tech stack, module breakdown, and key architectural decisions made during the project.

### Pipeline Execution
The execution timeline, key decisions made by the pipeline, and any retry patterns observed.

### Challenges & Solutions
Modules that required multiple attempts — what went wrong and how it was resolved. Be specific.

### Results
Final metrics including test coverage, code quality indicators, agent spawn counts, and total cost.

### Lessons Learned
What would be done differently in a future run of this project or similar projects.

## Requirements
- The output must be a standalone markdown document, publishable as-is on a website
- Use clear headings, bullet points where appropriate, and professional language
- Include specific data from the pipeline artifacts (module names, attempt counts, costs, etc.)
- Treat canonical run facts as the authority for terminal status, modules, gates, agents, and durations
- Do NOT fabricate data — only report what is in the artifacts
- The document should read as a professional engineering case study, not a log dump
`;
  fs.writeFileSync(instructionsPath, sanitizeMarkdownText(content));
  return instructionsPath;
}
