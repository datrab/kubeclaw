# Runner failures during parallel execution

An unexpected scheduling or node-execution rejection stops the Runner from scheduling more nodes after it observes the failure. Already-started nodes remain owned by their existing execution deadlines and cancellation policies. The Runner waits for all of them to settle before cleaning retained fixtures. It does not introduce another timeout or silently abandon their work.

A fixture that finishes successfully during this wait is registered for cleanup exactly once. Cleanup therefore includes late successful fixtures as well as those collected before the failure. Ordinary unsuccessful node results still follow the normal dependency and retry rules; this exceptional path handles rejected node execution or scheduling operations.

A single failure is rethrown unchanged. Multiple distinct failures, including a later fixture-cleanup rejection, are preserved in an AggregateError with marker TEST_RUNNER_EXECUTION_CLEANUP_FAILED. A cleanup-only rejection also retains its original identity. The Runner does not produce a successful result when these exceptions occur.

Run `npm run verify:buster:scheduler-drain` for the scheduler contract tests, a real registered-provider Runner regression, and the original Runner and real-provider modules. The regression injects a repository-copy failure at the actual preparation boundary while another provider is executing. Its host capability barriers model test ordering; they are not a kernel-isolation or live-cluster proof. Current test status belongs to the [implementation evidence](../review/remediation/implementation/runner-scheduler-drain-20260921.md).

This change does not establish durable crash recovery or repair historical provider snapshots. Confirming process disposal and deciding whether an incomplete fixture can be retained remain separate responsibilities described by the [fixture cleanup contract](buster-fixture-cleanup.md).
