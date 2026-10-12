# ESLint policy/module split draft

Private, not integrated or runtime verified. The seven-file draft retires the old
canonical source name while retaining the conventional mounted runtime name.
The rule implementations, thresholds, exact boundary scope and custom override
behavior remain unchanged. Source review established exact reconstruction of the
original module; it is not a runtime or packaging acceptance.

Before integration, run the existing discipline-rule tests unchanged apart from
the source path. Verify the actual packaged chart and rendered ConfigMap, execute
the relevant rendered copy blocks in isolated fixture directories, then load the
copied runtime config through real ESLint. Delete only the fixture plugin and
require an import failure. Verify that changing the plugin changes the deployment
checksum. Include both new source files in strict lint; preserve adjacent-file
boundary negative controls. Update active review harness paths and retain dated
historical command logs as historical evidence. Remove the original source file
only after its exact identity is checked; do not leave an alias or fallback.
