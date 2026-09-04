# Playwright E2E provider

`kubeclaw.playwright@1` runs the project-owned Playwright configuration. KubeClaw supplies the test deployment origin, the JSON reporter, a bounded worker count, total cancellation, and evidence storage. The provider does not change test selection, retries, authentication setup, screenshots, video, traces, or assertion behavior.

The project reads `PLAYWRIGHT_TEST_BASE_URL` or `BASE_URL` in its configuration. Declare either a typed deployment/endpoint input or an operator-approved `url`. A run with zero discovered tests is an error. Any test that remains failed after Playwright retries fails the provider result.

Buster forces `--max-failures=0`, a JSON reporter, and an attempt-owned output directory. Independent tests continue after a failed test. The operator and plan cap workers, processes, memory, CPU time, total time, output, report data, complete result data, attachment bytes, and attachment files. The provider emits the shared `kubeclaw.e2e-result.v1` contract.
