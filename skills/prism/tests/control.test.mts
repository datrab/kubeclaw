import assert from "node:assert/strict";
import test from "node:test";
import { exchangeTailscaleIdentity, mintSession, verifySession } from "../control/session.ts";

test("Tailscale exchange requires the trusted ingress path", () => {
  assert.throws(() => exchangeTailscaleIdentity({ "tailscale-user-login": "davide" }, "edge", "session"), /untrusted/);
  const token = exchangeTailscaleIdentity({ "tailscale-user-login": "davide", "x-prism-ingress-secret": "edge" }, "edge", "session");
  assert.equal(verifySession(token, "session").user, "davide");
  const approver=exchangeTailscaleIdentity({"tailscale-user-login":"davide","x-prism-ingress-secret":"edge"},"edge","session",new Set(["davide"]));
  assert(verifySession(approver,"session").roles.includes("approver"));
});
test("session signatures and expiry fail closed", () => {
  const token = mintSession("davide", "secret", 1_000);
  assert.throws(() => verifySession(`${token}x`, "secret", 2_000), /invalid/);
  assert.throws(() => verifySession(token, "secret", 1_000 + 16 * 60_000), /expired/);
});
