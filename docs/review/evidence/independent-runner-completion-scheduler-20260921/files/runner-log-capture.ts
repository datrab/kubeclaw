import fs from 'node:fs';
import path from 'node:path';
import type { DeclaredEvidenceV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { TestProviderExecutionContext } from '@kubeclaw/plugin-sdk';
interface LogCapture {
 readonly contextLog: TestProviderExecutionContext['log'];
 readonly bytes: () => number;
 readonly exceeded: () => boolean;
 readonly write: (directory: string) => DeclaredEvidenceV1 | null;
}
export function createLogCapture(
  limit: number,
  onExceeded: () => void = () => undefined,
): LogCapture {
  let total = 0;
  let overLimit = false;
  const chunks: string[] = [];
  const contextLog: TestProviderExecutionContext["log"] = (stream, value) => {
    if (overLimit) return;
    const content =
      typeof value === "string" ? value : Buffer.from(value).toString("utf8");
    const line = `[${stream}] ${content}`;
    const size = Buffer.byteLength(line);
    total += size;
    if (total > limit) {
      if (!overLimit) {
        overLimit = true;
        onExceeded();
      }
      return;
    }
    chunks.push(line);
  };
  return {
    contextLog,
    bytes: () => total,
    exceeded: () => overLimit,
    write: (directory) => {
      if (chunks.length === 0) return null;
      fs.writeFileSync(path.join(directory, "provider.log"), chunks.join(""));
      return {
        evidenceId: "runner-log",
        type: "log",
        file: "provider.log",
        mediaType: "text/plain; charset=utf-8",
      };
    },
  };
}

