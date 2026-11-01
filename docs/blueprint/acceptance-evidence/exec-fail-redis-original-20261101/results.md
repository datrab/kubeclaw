# Original Redis failure/recovery observation

Original EXEC-FAIL-REDIS: signal, state, decision and recovery independently PASS (4/4). Genuine protected Gateway Nova execution at `2068150b6a813b95a1caf262ba109ef578b2d852`; subsequently published instruction and current artifact at `a0514a87313cd0cab5b1b3cbd4936b7281df6675`.

Own authenticated loopback Redis was stopped after complete genuine Nova preflight. Expected Redis-only readiness exit 1 is retained. Three native audits retain the stopped run's same 144 events and journal head; its original pipeline failure is not changed. Restart of the same endpoint/config/AOF preserves the sentinel/old stream and succeeds with new XADD/read and full startup/readiness. Finite deadlines, no reset or unbounded retry; both owned Redis processes stopped and private credential configuration removed.

Author/facilitator local counterpart, not a fresh reader, second Buster role, Kubernetes/PVC test, live workflow recovery, human assistive-technology/contrast approval or whole-gate completion. No new gates or requirements accepted. Original 43 affected prior records retain their independently qualified scopes and limits; no historical reader run is relabelled fresh.

The current 186-page build, five artifact checks, targeted native guards and representative 320/1440 keyboard delivery passed once. Operational raw evidence and prior failures remain under `operations/pr13/evidence/next-original-dependency-fault-selection-20261101`; the public compact receipts index their exact retained bytes without duplicating the raw corpus. No proof-only rebuild is required.
