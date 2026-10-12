/** Diagnostic observation only; original tests, assertions and deadlines are unchanged. */
import { BusterRemotePlanService } from '../../../../../skills/buster/engine/test-gates/remote-plan-service.ts';
const prototype = BusterRemotePlanService.prototype;
for (const name of ['submit', 'cancel', 'recover', 'shutdown'] as const) {
  const original = prototype[name] as (...args: unknown[]) => Promise<unknown>;
  Object.defineProperty(prototype, name, { value: async function (this: BusterRemotePlanService, ...args: unknown[]) {
    process.stderr.write(`CONFIG_DIAG_BEGIN:${name}\n`);
    try {
      const result = await original.apply(this, args);
      process.stderr.write(`CONFIG_DIAG_END:${name}:${JSON.stringify(result)}\n`);
      if (name === 'submit' && result && typeof result === 'object' && 'jobId' in result) {
        process.stderr.write(`CONFIG_DIAG_STATUS:${JSON.stringify(await this.status(String(result.jobId)))}\n`);
      }
      return result;
    } catch (error) {
      process.stderr.write(`CONFIG_DIAG_ERROR:${name}:${String(error)}\n`);
      throw error;
    }
  } });
}
