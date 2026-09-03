# Accessibility provider error reference

Status: implemented  
Audience: operators and project authors  
Owner: Pipeline architecture  
Evidence: accessibility provider and capability source  
Applicable version: `kubeclaw.axe@1`  
Verification revision: pending Suite 9 commit

Each entry names its cause after the colon. Every code stops the affected node with an error outcome. Retry only after the stated correction. Check the node log and Nova imported evidence for the code.

- `AXE_TARGET_REQUIRED`: Add one approved URL or one typed endpoint input.
- `AXE_TARGET_AMBIGUOUS`: Remove either the URL or the endpoint input.
- `AXE_CONFIG_INVALID`: Supply a configuration object that matches the provider schema.
- `AXE_INPUT_UNKNOWN`: Remove an input name that the provider does not declare.
- `AXE_INPUT_INVALID`: Supply the declared typed endpoint or deployment value.
- `AXE_ENDPOINT_NOT_FOUND`: Select an endpoint name that the deployment fixture contains.
- `AXE_WORKSPACE_INVALID`: Use the repository directory from the isolated provider workspace.
- `AXE_PROFILE_FILE_DENIED`: Use a regular repository file without traversal or symlinks outside the repository.
- `AXE_PROFILE_FILE_INVALID`: Supply valid JSON with schema version `kubeclaw.browser-profiles.v1`.
- `AXE_PROFILE_FILE_TOO_LARGE`: Reduce the profile file to 262144 bytes or fewer.
- `AXE_PROFILE_LIMIT_EXCEEDED`: Reduce the custom profile count to 32 or fewer.
- `AXE_PROFILE_INVALID`: Correct the selected profile fields and values.
- `AXE_PROFILE_UNKNOWN_FIELD`: Remove the unsupported custom profile field.
- `AXE_PROFILE_NOT_FOUND`: Select a built-in or declared profile.
- `AXE_CAPABILITY_RESULT_INVALID`: Inspect the Buster capability result contract and runtime logs.
- `LEGACY_A11Y_THRESHOLDS_RETIRED`: Replace numeric thresholds with exact acceptances.
- `LEGACY_A11Y_TIMEOUT_INVALID`: Use an accessibility timeout from 1000 through 120000 milliseconds.
- `BROWSER_AXE_ORIGIN_DENIED`: Ask the operator to approve the exact origin or provide a typed fixture.
- `BROWSER_AXE_ORIGIN_INVALID`: Correct the operator origin so it contains only an HTTP or HTTPS origin.
- `BROWSER_AXE_OPERATION_DENIED`: Use only the declared `browser.axe` scan operation.
- `BROWSER_AXE_RESOURCE_INVALID`: Supply a `network.url` capability resource.
- `BROWSER_AXE_REQUEST_INVALID`: Supply a capability payload object.
- `BROWSER_AXE_COMBINATION_INVALID`: Supply one route and one valid profile for each combination.
- `BROWSER_AXE_COMBINATION_LIMIT_INVALID`: Correct the operator combination limit during runtime startup.
- `BROWSER_AXE_COMBINATION_LIMIT_EXCEEDED`: Reduce the route and profile combination count.
- `BROWSER_AXE_CONCURRENCY_INVALID`: Correct the operator concurrency limit during runtime startup.
- `BROWSER_AXE_ROUTE_INVALID`: Use a local absolute route without a query or fragment.
- `BROWSER_AXE_TAGS_INVALID`: Supply a bounded nonempty list of Axe tags.
- `BROWSER_AXE_EXCLUDE_INVALID`: Supply a bounded list of nonempty selectors.
- `BROWSER_AXE_PROFILE_INVALID`: Correct the profile name, context settings, or field types.
- `BROWSER_AXE_VIEWPORT_INVALID`: Set positive width and height values inside operator limits.
- `BROWSER_AXE_BROWSER_INVALID`: Select Chromium, Firefox, or WebKit.
- `BROWSER_AXE_BROWSER_POLICY_INVALID`: Configure at least one supported operator browser.
- `BROWSER_AXE_BROWSER_DENIED`: Select an operator-approved browser.
- `BROWSER_AXE_SUBRESOURCE_ORIGIN_DENIED`: Remove the cross-origin page dependency or change operator policy.
- `BROWSER_AXE_RESULT_BYTES_EXCEEDED`: Reduce routes or profiles, or increase the reviewed operator limit.
- `BROWSER_AXE_RESULT_LIMIT_INVALID`: Correct the operator result byte limit during runtime startup.
- `BROWSER_AXE_SCREENSHOT_BYTES_EXCEEDED`: Reduce failed elements, or increase the reviewed operator limit.
- `BROWSER_AXE_SCREENSHOT_BYTES_INVALID`: Correct the operator screenshot byte limit during runtime startup.
- `BROWSER_AXE_SCREENSHOT_LIMIT_INVALID`: Correct the operator screenshot count limit during runtime startup.
- `BROWSER_AXE_TIMEOUT_INVALID`: Supply a positive timeout inside the operator execution limit.
- `BROWSER_AXE_TIMEOUT_EXCEEDED`: Reduce the page work or increase the reviewed execution limit.
- `BROWSER_AXE_CANCELLED`: The caller cancelled the execution.
