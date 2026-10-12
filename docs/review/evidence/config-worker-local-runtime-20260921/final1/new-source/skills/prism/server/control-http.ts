import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
export async function body(
  request: IncomingMessage,
  maxBytes = 2_000_000,
): Promise<unknown> {
  if (
    !(request.headers["content-type"] ?? "")
      .toString()
      .toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("application/json is required");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("request too large");
    chunks.push(chunk);
  }
  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
    : {};
}
export function json(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}
export function cookies(request: IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    (request.headers.cookie ?? "")
      .split(";")
      .filter(Boolean)
      .map(
        (item) =>
          item.trim().split("=").map(decodeURIComponent) as [string, string],
      ),
  );
}
export const sha256 = (value: string | Uint8Array) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
export const userKey = (identity: string) =>
  `user-${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
