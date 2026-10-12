import fs from 'node:fs';
import path from 'node:path';
export async function readManagedEvidence(
    artifactRoot: string,
    storageUrl: string,
    maximumBytes: number,
  ): Promise<Buffer> {
    const source = new URL(storageUrl);
    if (source.protocol !== "file:")
      throw new Error(
        `OBSERVABILITY_EVIDENCE_STORAGE_UNSUPPORTED:${source.protocol}`,
      );
    const candidate = fs.realpathSync(source);
    const root = artifactRoot;
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`))
      throw new Error("OBSERVABILITY_EVIDENCE_PATH_FORBIDDEN");
    const handle = await fs.promises.open(
      candidate,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    try {
      const opened = await handle.stat();
      const currentPath = fs.realpathSync(candidate);
      if (currentPath !== root && !currentPath.startsWith(`${root}${path.sep}`))
        throw new Error("OBSERVABILITY_EVIDENCE_PATH_FORBIDDEN");
      const current = fs.statSync(currentPath);
      if (
        !opened.isFile() ||
        opened.dev !== current.dev ||
        opened.ino !== current.ino
      )
        throw new Error("OBSERVABILITY_EVIDENCE_PATH_FORBIDDEN");
      if (opened.size > maximumBytes)
        throw new Error("OBSERVABILITY_EVIDENCE_OBJECT_TOO_LARGE");
      const content = await handle.readFile();
      if (content.byteLength > maximumBytes)
        throw new Error("OBSERVABILITY_EVIDENCE_OBJECT_TOO_LARGE");
      return content;
    } finally {
      await handle.close();
    }
  }

