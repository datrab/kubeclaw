# End-to-end test error reference

Each error stops the current provider attempt. A blocking node stops the gate. An advisory node records the same facts but does not block the gate.

| Error | Cause | Effect | Correction | Retry | Evidence |
| --- | --- | --- | --- | --- | --- |
| `PLAYWRIGHT_CONFIG_INVALID` | Configuration is malformed or has an unknown field. | No browser starts. | Correct `.swarm/pipeline.json`. | After correction | Runner log |
| `PLAYWRIGHT_PROJECT_DIRECTORY_INVALID` | The project path is missing, unsafe, or outside the repository. | No browser starts. | Use one contained relative path. | After correction | Runner log |
| `PLAYWRIGHT_CONFIG_FILE_INVALID` | The config path is missing, unsafe, or not a file. | No browser starts. | Point to the project Playwright config. | After correction | Runner log |
| `PLAYWRIGHT_TARGET_REQUIRED` | No URL or typed endpoint exists. | No browser starts. | Add one typed input or `url`. | After correction | Runner log |
| `PLAYWRIGHT_TARGET_AMBIGUOUS` | Both `url` and typed input exist. | No browser starts. | Keep one target authority. | After correction | Runner log |
| `PLAYWRIGHT_INPUT_INVALID` | Typed fixture evidence is malformed. | No browser starts. | Repair the producing fixture. | After upstream success | Runner log |
| `PLAYWRIGHT_INPUT_UNKNOWN` | The node has an unsupported input name. | No browser starts. | Use `deployment` or `endpoint`. | After correction | Runner log |
| `PLAYWRIGHT_ENDPOINT_NOT_FOUND` | `endpointName` does not match the fixture. | No browser starts. | Use a declared endpoint name. | After correction | Runner log |
| `PLAYWRIGHT_TARGET_INVALID` | The URL is not a plain HTTP/HTTPS origin. | No browser starts. | Remove path, query, fragment, or credentials. | After correction | Runner log |
| `PLAYWRIGHT_WORKSPACE_INVALID` | An attempt path is absent or outside isolation. | Execution errors. | Inspect source extraction and worker storage. | After operator repair | Runner log |
| `PLAYWRIGHT_ZERO_TESTS` | Playwright selected no test. | The node errors. | Correct `testDir`, projects, and filters. | After correction | JSON report |
| `PLAYWRIGHT_CAPABILITY_RESULT_INVALID` | The trusted browser capability returned malformed data. | The node errors. | Repair or redeploy Buster. | After redeploy | Runner log |
| `PLAYWRIGHT_REPORT_INVALID` | The JSON report is malformed. | The node errors. | Check Playwright version and reporter output. | After correction | Runner log |
| `PLAYWRIGHT_CASE_RESULT_INVALID` | One reported test case has malformed result data. | The node errors instead of trusting partial counts. | Inspect the JSON reporter version and the preserved case data. | After correction | JSON report |
| `PLAYWRIGHT_CASE_STATUS_INVALID` | One reported test case has an unsupported status. | The node errors instead of mapping an unknown state. | Use a supported Playwright version or correct the report producer. | After correction | JSON report |
| `PLAYWRIGHT_REPORT_BYTES_EXCEEDED` | The canonical report exceeds plan evidence bytes. | Evidence import stops. | Reduce cases or increase the approved limit. | After policy change | Runner log |
| `PLAYWRIGHT_EXECUTION_FAILED` | Playwright exited without a structured failed case. | The node errors. | Inspect configuration, browser startup, and stderr. | After correction | Runner log |
| `PLAYWRIGHT_ARTIFACT_INVALID` | Attachment Base64 is malformed. | Evidence import stops. | Repair or redeploy the browser capability. | After redeploy | Runner log |
| `PLAYWRIGHT_EVIDENCE_PATH_INVALID` | A generated evidence path is unsafe. | Evidence import stops. | Repair the provider. | After redeploy | Runner log |
| `PLAYWRIGHT_ARTIFACT_FILE_LIMIT_EXCEEDED` | Evidence file count exceeds the plan limit. | Evidence import stops. | Reduce capture or change approved limits. | After correction | Runner log |
| `PLAYWRIGHT_ARTIFACT_BYTES_EXCEEDED` | Evidence bytes exceed the plan limit. | Evidence import stops. | Reduce capture or change approved limits. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_ORIGIN_DENIED` | The target origin is not authorized. | No browser starts. | Use a fixture-derived or operator-approved origin. | After authorization | Runner log |
| `BROWSER_PLAYWRIGHT_ORIGIN_INVALID` | Operator origin policy is malformed. | Runtime startup fails. | Correct Buster policy. | After redeploy | Startup log |
| `BROWSER_PLAYWRIGHT_OPERATION_DENIED` | Capability name, operation, or resource type is wrong. | No browser starts. | Repair the provider request. | After redeploy | Runner log |
| `BROWSER_PLAYWRIGHT_RESOURCE_INVALID` | The target resource is malformed. | No browser starts. | Repair the provider request. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_REQUEST_INVALID` | Capability payload is not an object. | No browser starts. | Repair the provider. | After redeploy | Runner log |
| `BROWSER_PLAYWRIGHT_LIMITS_INVALID` | Per-node CPU, memory, or process limits are missing or invalid. | No browser starts. | Supply valid plan limits. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_REPOSITORY_DENIED` | Repository path escapes the attempt workspace. | No browser starts. | Repair source extraction or request path. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_PROJECT_DENIED` | Project path escapes the repository. | No browser starts. | Use a contained project path. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_CONFIG_DENIED` | Config escapes the project or is not a real file. | No browser starts. | Use a contained real config file. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_POLICY_INVALID` | Operator binaries, directories, or limits are unsafe. | Runtime startup fails. | Correct and redeploy Buster. | After redeploy | Startup log |
| `BUSTER_BROWSER_PLAYWRIGHT_CGROUP_REQUIRED` | Production has no browser cgroup root. | Runtime startup fails. | Mount and configure the dedicated subtree. | After redeploy | Startup log |
| `BROWSER_PLAYWRIGHT_CGROUP_UNSAFE` | The configured cgroup is the host root or filesystem root. | Runtime startup fails. | Use the dedicated browser subtree. | After redeploy | Startup log |
| `BROWSER_PLAYWRIGHT_CGROUP_UNAVAILABLE` | The required cgroup v2 controllers are absent. | Runtime startup fails. | Enable `pids`, `memory`, and `cpu`. | After operator repair | Startup log |
| `BROWSER_PLAYWRIGHT_CGROUP_NOT_DELEGATED` | The subtree contains processes or its controllers are not writable. | Runtime startup fails. | Delegate an empty writable subtree to Buster. | After operator repair | Startup log |
| `BROWSER_PLAYWRIGHT_CGROUP_CLEANUP_FAILED` | An attempt cgroup could not be killed and removed. | Cleanup blocks the gate. | Inspect descendant processes and cgroup state. | After operator repair | Cleanup log |
| `BROWSER_PLAYWRIGHT_IDENTITY_NOT_ISOLATED` | The project UID equals the trusted worker UID. | Runtime startup fails. | Configure the dedicated project UID. | After redeploy | Startup log |
| `BROWSER_PLAYWRIGHT_PROXY_FAILED` | The attempt-local exact-origin proxy could not bind to loopback. | No browser starts. | Repair the Buster host network or process limits. | After operator repair | Runner log |
| `BROWSER_PLAYWRIGHT_WORKERS_INVALID` | Requested workers are outside 1–64. | No browser starts. | Correct the project worker request. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_TIMEOUT_INVALID` | Requested total time is invalid. | No browser starts. | Correct the project timeout. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_TIMEOUT` | Total execution time expired. | The process group stops. | Fix a hang or increase the approved limit. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_CANCELLED` | The pipeline cancelled the attempt. | The process group stops. | Restart only if the run is still required. | New run | Runner log |
| `BROWSER_PLAYWRIGHT_PROCESS_LIMIT_EXCEEDED` | The process tree exceeded its effective limit. | The process group stops. | Reduce workers or increase the approved limit. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_MEMORY_LIMIT_EXCEEDED` | Aggregate resident memory exceeded its effective limit. | The process group stops. | Reduce projects/workers or increase the approved limit. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_CPU_LIMIT_EXCEEDED` | Aggregate CPU time exceeded its effective limit. | The process group stops. | Fix expensive tests or increase the approved limit. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_OUTPUT_LIMIT_EXCEEDED` | stdout and stderr exceeded their limit. | The process group stops. | Reduce logging or increase the approved limit. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_REPORT_MISSING` | Playwright produced no JSON report. | The node errors. | Inspect process output and reporter compatibility. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_REPORT_LIMIT_EXCEEDED` | The raw JSON report is too large. | The node errors. | Reduce cases or increase the approved limit. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_RESULT_LIMIT_EXCEEDED` | Complete serialized response is too large. | The node errors. | Reduce output/capture or increase the approved limit. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_REPORT_INVALID` | JSON report structure is invalid or uses an unsafe file. | The node errors. | Repair or redeploy the runtime. | After redeploy | Runner log |
| `BROWSER_PLAYWRIGHT_ARTIFACT_DENIED` | Attachment body/path is unsafe or leaves the repository. | The node errors. | Repair the project output or runtime. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_ARTIFACT_FILE_LIMIT_EXCEEDED` | Attachment count exceeds operator policy. | The node errors. | Reduce capture or increase the approved limit. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_ARTIFACT_BYTES_EXCEEDED` | Decoded attachments exceed operator policy. | The node errors. | Reduce capture or increase the approved limit. | After correction | Runner log |
| `BROWSER_PLAYWRIGHT_RUNTIME_OVERLAY_TAMPERED` | Project code replaced the temporary runtime link. | Cleanup errors and the gate blocks. | Remove tampering and inspect the source. | After correction | Cleanup log |
| `TEST_PROVIDER_E2E_DETAILS_INVALID` | Common E2E cases, counts, schema ID, or digest are invalid. | Buster rejects the result. | Repair the provider contract output. | After redeploy | Runner log |
| `LEGACY_E2E_CONFIGURATION_RETIRED` | A retired selector or config is present. | Project setup stops. | Declare `kubeclaw.playwright@1`. | After correction | Setup output |

## Runtime variables

`PLAYWRIGHT_BROWSERS_PATH`, `PLAYWRIGHT_JSON_OUTPUT_NAME`, and `PLAYWRIGHT_TEST_BASE_URL` are operator-owned runtime variables. They are not error codes. Buster sets them for each isolated attempt.
