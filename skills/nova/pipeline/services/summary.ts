import { runPipelineReview } from './pipeline-review-run.ts';

export { writeSummary } from './summary-writer.ts';
export {
  pipelineReviewJsonPath,
  pipelineReviewOutputPath,
} from './pipeline-review-values.ts';

export async function generatePipelineReview(
  config: any,
  progress: any,
  opts: any = {}
) {
  return runPipelineReview(config, progress, opts);
}

export { generateCaseStudy } from './case-study.ts';
export { generateProjectSummary } from './summary/project-summary.ts';
