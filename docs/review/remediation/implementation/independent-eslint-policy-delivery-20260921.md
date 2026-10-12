# Independent private delivery-test source review

Reviewed the eight private draft files; source-comparison.json and exact snapshots are in `../../evidence/independent-eslint-policy-delivery-20260921/`. No integration or runtime commands were executed. This is not delivery acceptance.

## Concrete correction required

The test locates a command element by script text, then executes it independently through `sh -eu -c`. It never verifies the rendered container shell executable or `-c` argument. Changing the real command executable to `/bin/true`, while retaining the script element, would preserve the test behavior but prevent actual delivery. Assert the expected init-container identity and effective command/args shape before extracting the script. The current production shape is `/bin/bash`, `-c`, script.

## Observed strengths and limits

Packaging precedes extraction/render. Both packaged module bytes are compared with their maintained sources. Both real copy-loop fragments and the main-config copy fragments are extracted from the rendered script; both persisted and runtime bytes are compared. Real ESLint invokes the custom fallback rule; the separate missing-module child avoids module-cache false positives and requires both module-not-found and the specific plugin filename. Plugin-byte mutation must change every observed deployment checksum. None of this proves the complete container startup or image dependency closure: the fixture deliberately links host node_modules.

The rule-effect oracle should require severity 2, since merely matching ruleId also accepts a regression from blocking error to warning. A clean-expression control would additionally separate rule presence from an always-report implementation, though existing rule-unit tests can carry this latter scope.

All intended writes and cleanup are beneath mkdtemp. Current extracted shell fragments contain only the expected mapped copy paths; unrelated runtime node_modules deletion is outside the extracted sections. The node_modules symlink is used only for dependency loading. However the packaged plugin mutation has no explicit regular-file/containment/nonalias check before appendFileSync. Add lstat/realpath and source dev+inode inequality before that mutation to make fixture ownership executable rather than depend solely on Helm archive behavior; this source review has not demonstrated an actual package alias. Likewise plain string substitution is a scoped test mechanism, not a sandbox for arbitrary future shell edits.

The test supports the current command layout only; command/args relocation should either be validated explicitly or fail clearly. Manifest status remains private and untested.
