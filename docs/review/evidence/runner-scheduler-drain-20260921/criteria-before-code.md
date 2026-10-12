# Scheduler failure drain — required behavior before implementation

Source review confirms an existing outstanding Buster ownership gap: completeNext uses Promise.race over running tasks; on one rejection run jumps directly into cleanupFixtures while other tasks may still execute. A late successful fixture is then not retained for cleanup. This is source evidence, not a reproduced runtime failure or acceptance.

Required local cases:

- SD1: Two actually started concurrent nodes; one rejects while another remains pending. Fixture cleanup and outer rejection must wait until the already-started peer settles. No new pending node may start after the fault.
- SD2: A peer completes a retained fixture after the first failure. Register that fixture exactly once and include it in subsequent real cleanup.
- SD3: Multiple running nodes reject. Observe every rejection; preserve each distinct failure without an unhandled rejection. Preserve the original error identity when it is the only failure.
- SD4: Fixture cleanup itself fails after an execution failure. Preserve both errors; cleanup must not erase the original execution failure.
- SD5: Normal success, concurrency limits/groups, dependencies, retries and cancellation retain the complete original Runner and real-provider behavior. No deadline or assertion relaxation.
- SD6: Exercise the normal TestPlanRunner caller in addition to scheduler unit boundaries, with explicitly owned local provider processes. A synthetic scheduler owner alone is not whole Runner ownership proof.
- SD-DOC: Document settlement before cleanup, error propagation, and the boundary that existing node deadlines/cancellation remain their owners. No native isolation, historical cleanup or durable recovery acceptance follows.

Keep this separate from the current provider disposal correction. No implementation or runtime has started. Fresh independent source/runtime review is required after implementation.
