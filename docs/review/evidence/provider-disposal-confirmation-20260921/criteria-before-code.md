# Disposal confirmation / retained cleanup — required cases before code

Private next implementation, no live writes/runtime. Preserve original budgets and all original ownership/cancellation assertions. This corrects runtime1's actual state defect separately from its three faulty fixture assumptions.

| ID | Actual prerequisite | Required result |
|---|---|---|
| DC1 | Real provider actual close, actual capability drain settled, injected TERM failure | First terminate rejects with original signal cause; explicit disposal confirmation true; later real Loaded cleanup may start exactly one fresh child and receives selected disposition. |
| DC2 | Real process dead but close notification withheld | Existing termination timeout; disposal confirmation false; no new recovery child. |
| DC3 | Real close, nonsettling capability | Existing drain timeout; disposal confirmation false; no new recovery child. |
| DC4 | Normal passed retained Runner fixture | Same original process may clean up; completed-fixture authority; retain0/delete1; no invented compulsory replacement. |
| DC5 | Explicitly stopped successfully executed Loaded instance | Actual old close before real fresh cleanup PID; successful retained semantics unchanged. |
| DC6 | Failed preparation plus rollback and later provider cleanup failure | First actual execute-error IPC contains original stable rollback marker; final cleanup failure and no unsafe retry; no change to Core summary priority. |
| DC7 | Post-passed Worker fault before final retained selection | Actual passed result observed first; exact injected Worker failure recorded, incomplete cleanup; any later passed attempt retains only completed-fixture authority. |
| DC8 | Final retained cleanup and subsequent stop both fail | Both errors remain observable; no false success; confirmed-disposal failure recorded under cleanupErrors rather than erased. Unconfirmed disposal must remain visibly unresolved, never permit recovery or erase snapshot. |

Stop errors and disposal confirmation are orthogonal. Confirmation can become true only after actual native close and successful capability drain; no matching error string, guessed exit or finally-only flag. No historical pinned plugin repair or durable recovery claim. Tests and semantic controls must separately remove confirmation gating, restore success-only terminated flag and restore discarded second-stop error. Original ownership module remains complete.
