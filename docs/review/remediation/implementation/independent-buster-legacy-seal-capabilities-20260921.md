# Independent source review: LIS6 guest capability helper

Reviewed `tests/fixtures/test-gate/legacy-seal-capabilities.py`; exact identity is retained in the matching evidence directory. No blocking source defect found. No privileged execution or capability mutation was performed in this review.

The helper compares all five actual process capability sets against explicit expected values. The parent profile requires the complete production allowlist in bounding, effective and permitted sets and zero inheritable/ambient sets. The negative profile retains actual effective/permitted SYS_ADMIN after removing its bounding bit, then invokes the original verifier in the same process without exec. The capability prerequisite is measured before invoking the verifier. This covers the intended retained-effective condition without fabricating `/proc` data.

The driver remains required: bind the verifier/helper hashes before loading, create actual guest-only fixtures, establish initial privileges, check the distinct expected verifier failure, and impose the fixed watchdog. This is source acceptance of a test helper, not LIS kernel evidence or stop/import authority. Root path validation occurs before capability reduction; the unchanged verifier independently checks its own filesystem authority afterward.
