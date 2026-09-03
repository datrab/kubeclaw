import assert from "node:assert/strict";
import test from "node:test";
import { prismProxyResponseHeaders } from "../server/proxy-headers.ts";

test("Studio preserves every Control Set-Cookie header", () => {
  const headers = new Headers();
  headers.append("content-type", "application/json");
  headers.append("content-length", "2");
  headers.append("set-cookie", "prism_session=signed; HttpOnly; Secure; Path=/");
  headers.append("set-cookie", "prism_csrf=token; Secure; Path=/");

  const forwarded = prismProxyResponseHeaders(headers);
  assert.deepEqual(forwarded.setCookies, [
    "prism_session=signed; HttpOnly; Secure; Path=/",
    "prism_csrf=token; Secure; Path=/",
  ]);
  assert.deepEqual(forwarded.ordinary, [["content-type", "application/json"]]);
});
