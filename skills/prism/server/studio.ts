import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { prismProxyResponseHeaders } from "./proxy-headers.ts";
const root = process.env.STUDIO_ROOT ?? new URL("../dist-studio", import.meta.url).pathname;
const control = new URL(process.env.PRISM_CONTROL_URL ?? "http://prism-control:8080");
const ingressSecret = process.env.PRISM_INGRESS_SECRET ?? "";
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://studio");
  if (requestUrl.pathname === "/health" || requestUrl.pathname === "/ready") { response.writeHead(200, { "content-type": "application/json" }); return response.end('{"status":"ready"}'); }
  if (requestUrl.pathname.startsWith("/v1/")) {
    if (!ingressSecret) { response.writeHead(503); return response.end("Studio proxy is not configured"); }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 2_000_000) { response.writeHead(413); return response.end(); } chunks.push(chunk); }
    const headers = new Headers();
    for (const name of ["content-type", "cookie", "x-prism-csrf", "tailscale-user-login", "tailscale-user-name", "tailscale-user-profile-pic"]) {
      const value = request.headers[name]; if (typeof value === "string") headers.set(name, value);
    }
    headers.set("x-prism-ingress-secret", ingressSecret);
    const upstream = await fetch(new URL(`${requestUrl.pathname}${requestUrl.search}`, control), { method: request.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: "manual" });
    response.statusCode = upstream.status;
    const forwarded = prismProxyResponseHeaders(upstream.headers);
    for (const [name, value] of forwarded.ordinary) response.setHeader(name, value);
    if (forwarded.setCookies.length) response.setHeader("set-cookie", forwarded.setCookies);
    return response.end(Buffer.from(await upstream.arrayBuffer()));
  }
  const requested = normalize(decodeURIComponent(requestUrl.pathname)).replace(/^\/+/, "");
  let path = join(root, requested || "index.html"); if (!path.startsWith(root)) { response.writeHead(403); return response.end(); }
  try { if (statSync(path).isDirectory()) path = join(path, "index.html"); } catch { path = join(root, "index.html"); }
  response.setHeader("content-type", types[extname(path)] ?? "application/octet-stream");
  response.setHeader("content-security-policy", "default-src 'self'; frame-src 'self'; connect-src 'self' https:; object-src 'none'; base-uri 'none'");
  createReadStream(path).on("error", () => { response.writeHead(404); response.end(); }).pipe(response);
}).listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
