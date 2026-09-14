#!/bin/sh
set -eu
version=${1:?Expected the selected kubectl version}
printf '%s\n' "$version" | grep -Eq '^v1\.[0-9]+\.[0-9]+$' || {
    echo "Invalid kubectl version: $version" >&2
    exit 1
}
# Inspect the resolved graph, not just direct requirements: MVS can raise a
# module through a transitive dependency. Replacements cannot attest this source.
modules=$(go list -mod=readonly -m -f '{{.Path}} {{.Version}}{{if .Replace}} replaced{{end}}' all)
printf '%s\n' "$modules" | awk -v expected="v0.${version#v1.}" '
$1 ~ /^k8s[.]io\/(api|apimachinery|cli-runtime|client-go|component-base|component-helpers|kubectl|metrics)$/ {
    count++
    if ($2 != expected || NF != 2) {
        print "kubectl source/version mismatch: " $0 "; expected " expected > "/dev/stderr"
        failed = 1
    }
}
END {
    if (count != 8) {
        print "kubectl release module graph is incomplete" > "/dev/stderr"
        failed = 1
    }
    exit failed
}'
