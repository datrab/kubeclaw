import { runCaseStudy } from './case-study-run.ts';

export async function generateCaseStudy(
  config: any,
  progress: any,
  opts: any = {}
) {
  return runCaseStudy(config, progress, opts);
}
