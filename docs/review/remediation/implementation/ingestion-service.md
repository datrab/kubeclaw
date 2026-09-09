# Prism ingestion request boundary

PCR-PRISM-INGESTION-001 is corrected at the actual HTTP request callback. Every
asynchronous handler rejection is observed. A cleanup IO failure returns 503 with
PRISM_INGESTION_IO_FAILED, the original filesystem code and message; structured
stderr records the error and stack. An already-ended/disconnected response is
not written again. Existing authorization, acquisition validation and POST status
behavior are preserved. No quarantine retention changes or new log store.

Before: the unchanged historical prism-ingestion-service-error-probe.mjs creates
an actual directory at a digest path, gets health200, then observes DELETE cause
EISDIR, a failed client connection and service exit1. Root and independent reviewer
both reproduced this original failure.

After: node --test skills/prism/tests/ingestion-service.test.mts passes against
the actual child service and real temporary filesystem. Unauthorized DELETE stays
401 and leaves the entry; authorized failing cleanup returns503 with EISDIR;
health stays200. Replacing the offending directory with an ordinary acquired file
allows retry204 and actually removes the file. Repeated deletion stays204 and
malformed acquisition JSON stays422 without stopping the service. Diagnostics
contain the explicit cause. No replaced unlink, mock service or changed ACL.

Prism TypeScript passes. Canonical ESLint baseline14/current13: the invalid async
HTTP callback warning is removed, existing configuration/default/complexity debt
remains. The new helper and test introduce no lint finding. Independent review
approved this bounded correction; deployed Control-to-ingestion operation and
public HTTPS acquisition remain outside this local service proof.
