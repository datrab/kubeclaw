# Controller closeout — 2026-10-16

The combined controller batch through e3f4ea7fc received independent complete-source review. Accepted P2: selected namespace-deletion timeout did not constrain API requests or polling. Fixed with one deadline context, bounded cancellable timer, and no late404 success. Real HTTP regressions cover long poll, slow response and late404. Original real polling A/B remains intact.

Completed remaining existing controller clock-skew literal (5seconds) in the same central Helm policy and actual refresh consumer. Removed hidden default TTL/maxTTL/poll sources: already centrally authored Helm ENV transport is mandatory and validated; original delivered7200/86400/3000 values unchanged. No new second author. Other string discovery/protocol defaults and resource quota policies are not silently claimed migrated.

Go tests: {'pass': 131, 'fail': 0, 'skip': 0}. Delivery:6/6 including actual Helm render and Go receiving for both charts. No deployment/native Kubernetes claim. Independent autoreview, Codex: initial finding verified and fixed, final review clean; source-only, no reviewer shell/test execution. Source manifest retained. No full repository or historical C0–C6/native acceptance inferred. No paid evals, main merge or production changes.

API request/response/diagnostic byte-bound candidate rows do not correspond to current source literals: current API request marshalling/response reading are unbounded. Adding these would be new runtime hardening, not externalizing existing settings. This distinction is recorded rather than inventing preserved defaults.
