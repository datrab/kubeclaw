# Lighthouse suite Phase 8 implementation plan

Status: implemented source design  
Audience: provider developers and reviewers  
Owner: Pipeline architecture  
Applicable provider: `kubeclaw.lighthouse@1`

## Goal

Phase 8 replaces the legacy `perf` function with one isolated provider and one trusted `browser.lighthouse` capability. The provider creates policy decisions. The capability owns the real Chrome process and the exact-origin network boundary.

## Work sequence

1. Record the legacy facts and decisions in the baseline.
2. Add strict project configuration and settings schemas.
3. Add separate performance, SEO, and best-practices nodes.
4. Run real Lighthouse with a real Chrome binary.
5. run three sequential performance samples and select the median.
6. Store all reports and identify one representative report.
7. Add the provider and browser capability to the production Buster package.
8. Add the provider node to the real generated workspace.
9. Add a deployed Nova-to-Buster production preflight.

## Authority

The project selects routes, a named profile, a named budget, and exact audit acceptances. The operator controls permitted origins, the Chrome executable, maximum runs, maximum duration, maximum result bytes, and provider concurrency.

The capability accepts a project origin only when operator policy or a typed deployment fixture grants that exact origin. A project cannot add network authority through its settings file.

## Failure rules

An invalid settings file is an execution error. A missing category or metric is an execution error. A budget violation is a failed check. An unaccepted SEO or best-practices audit is a failed check. Browser egress outside the exact target origin is an execution error.

## Exit criteria

The phase closes when the isolated runner uses real Lighthouse and real Chrome, all reports enter evidence storage, the real workspace selects the provider, the production package contains it, and the deployed preflight exists. Production acceptance remains pending until the controlled final cycle.
