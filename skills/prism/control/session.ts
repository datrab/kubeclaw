import { createHmac, timingSafeEqual } from "node:crypto";

export type Session = { user: string; audience: "prism"; roles: string[]; expiresAt: number };
const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");
export function mintSession(user: string, secret: string, now = Date.now(), roles=["editor"]): string {
  const payload = encode({ user, audience:"prism", roles, expiresAt: now + 15 * 60_000 });
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifySession(token: string, secret: string, now = Date.now()): Session {
  const [payload, supplied] = token.split("."); if (!payload || !supplied) throw new Error("invalid session");
  const expected = createHmac("sha256", secret).update(payload).digest(); const actual = Buffer.from(supplied, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("invalid session");
  const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
  if (!session.user || session.audience!=="prism" || !Array.isArray(session.roles) || session.expiresAt <= now) throw new Error("expired session"); return session;
}
export function exchangeTailscaleIdentity(headers: Record<string, string | undefined>, ingressSecret: string, sessionSecret: string): string {
  if (!ingressSecret || headers["x-prism-ingress-secret"] !== ingressSecret) throw new Error("untrusted ingress");
  const user = headers["tailscale-user-login"]?.trim(); if (!user) throw new Error("missing Tailscale identity");
  return mintSession(user, sessionSecret);
}
