# Accessibility provider configuration reference

Status: implemented  
Audience: project authors and operators  
Owner: Pipeline architecture  
Evidence: `skills/buster/plugins/axe/schemas/config.schema.json`  
Applicable version: `kubeclaw.axe@1`  
Verification revision: pending Suite 9 commit

- `url` sets an operator-approved HTTP or HTTPS origin when no typed input exists.
- `endpointName` selects one endpoint from a deployment fixture.
- `routes` lists the paths to scan.
- `profiles` lists built-in or shared profile names.
- `profileFile` names a repository JSON file with `kubeclaw.browser-profiles.v1`.
- `tags` selects Axe rule tags.
- `exclude` lists selectors that Axe must exclude.
- `acceptances` lists exact, temporary violation acceptances.
- `timeoutMs` sets the navigation and scan limit for one combination.

## Project field limits

- `url`: Project value; string; optional; no default; 2048 characters maximum. It must use HTTP or HTTPS. An unapproved origin fails before launch.
- `endpointName`: Project value; string; optional; no default; 64 characters maximum. A missing endpoint fails target resolution.
- `routes`: Project value; string array; required; 1 to 32 unique routes. A route must start with one slash.
- `profiles`: Project value; string array; optional; defaults to `desktop` and `mobile`; 1 to 16 names.
- `profileFile`: Project value; repository-relative string; optional; 4096 characters maximum. Traversal and external symlinks fail.
- `tags`: Project value; string array; optional; defaults to `wcag2a` and `wcag2aa`; 1 to 32 unique tags.
- `exclude`: Project value; selector array; optional; defaults to empty; 64 selectors maximum.
- `acceptances`: Project value; object array; optional; defaults to empty; 128 entries maximum. Each entry needs five exact fields.
- `timeoutMs`: Project value; integer; optional; defaults to 30000; allowed range is 1000 through 120000 milliseconds.

Each custom profile declares `browser`, `viewport`, `colorScheme`, `reducedMotion`, `locale`, `timezoneId`, `hasTouch`, `isMobile`, and `deviceScaleFactor` as needed.

The shared profile contract is `contracts/pipeline-test-gate/v1/schemas/browser-profiles.v1.schema.json`. Accessibility, visual, end-to-end, and active QA providers must reuse this contract.

Operator policy uses `allowedOrigins`, `allowedBrowsers`, `browserExecutables`, `maximumCombinations`, `maximumConcurrency`, `maximumExecutionMs`, `maximumResultBytes`, `maximumScreenshots`, and `maximumScreenshotBytes`.

## Operator field limits

- `allowedOrigins`: Operator value; exact HTTP or HTTPS origin array; required. It grants fixed network targets.
- `allowedBrowsers`: Operator value; browser-name array; required and nonempty. Allowed values are `chromium`, `firefox`, and `webkit`.
- `browserExecutables`: Operator value; optional path map. Each path selects the reviewed browser binary.
- `maximumCombinations`: Operator integer; required; 1 to 256. Excess project combinations fail.
- `maximumConcurrency`: Operator integer; required; 1 to 16. It bounds simultaneous browser contexts.
- `maximumExecutionMs`: Operator integer; required; 1 to 3600000. It bounds a project timeout.
- `maximumResultBytes`: Operator integer; required; 1 to 67108864. Excess structured evidence fails.
- `maximumScreenshots`: Operator integer; required; 1 to 128. It bounds screenshot files.
- `maximumScreenshotBytes`: Operator integer; required; 1 to 16777216. It bounds total screenshot bytes.

The production entrypoint contains the canonical complete example. Invalid operator values prevent runtime startup.
