#!/usr/bin/env bash
set -euo pipefail
role="${1:?role required}"
image="${2:?image reference required}"
case "$role" in nova|buster-gateway) ;; *) exit 0 ;; esac

# Match Kubernetes root mode: no DAC override, a read-only image, and private
# root-owned state mounted beneath the upstream node user's home directory.
docker run --rm --pull never --network none --read-only --user 0 --cap-drop ALL \
  --tmpfs /tmp:rw,mode=1777 \
  --tmpfs /home/node/.openclaw:rw,mode=0700,uid=0,gid=0 \
  --env HOME=/home/node --env XDG_CACHE_HOME=/tmp/.cache \
  --entrypoint node "$image" --input-type=module -e '
    import fs from "node:fs";
    import { execFileSync } from "node:child_process";
    const capabilities = fs.readFileSync("/proc/self/status", "utf8").match(/^CapEff:\s*([a-f0-9]+)$/m)?.[1];
    if (!capabilities || BigInt(`0x${capabilities}`) !== 0n) throw Error("Proof requires zero effective capabilities");
    const file = "/home/node/.openclaw/openclaw.json";
    fs.writeFileSync(file, JSON.stringify({ gateway: { mode: "local" } }), { mode: 0o600 });
    const value = execFileSync("openclaw", ["config", "get", "gateway.mode"], { encoding: "utf8" }).trim();
    if (value !== "local") throw Error(`Unexpected protected config result: ${value}`);
    console.log("Root OpenClaw CLI reads private mounted state with zero capabilities");
  '
