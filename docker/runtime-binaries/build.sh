#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Generated from the central version authority; no network resolution of versions.
. ./versions.env
test "$(go version | awk '{print $3}')" = "go${GO_VERSION}"
export GOTOOLCHAIN=local GOWORK=off CGO_ENABLED=0 GOOS=linux
export GOARCH="${TARGETARCH:-$(go env GOARCH)}"
export GOMAXPROCS="${GOMAXPROCS:-2}"
binary_output=${RUNTIME_BINARY_OUTPUT_DIR:-/out}
mkdir -p "$binary_output"
for binary in "$@"; do
  flags='-s -w'
  lock_directory="$binary"
  tags=''
  cgo=0
  case "$binary" in
    helm)
      module=helm.sh/helm/v3; expected="v${HELM_VERSION}"; package=helm.sh/helm/v3/cmd/helm
      minor=$(printf '%s' "$KUBECTL_VERSION" | cut -d. -f2)
      flags="$flags -X helm.sh/helm/v3/internal/version.version=$expected -X helm.sh/helm/v3/internal/version.gitTreeState=dirty -X helm.sh/helm/v3/pkg/lint/rules.k8sVersionMajor=1 -X helm.sh/helm/v3/pkg/lint/rules.k8sVersionMinor=$minor -X helm.sh/helm/v3/pkg/chartutil.k8sVersionMajor=1 -X helm.sh/helm/v3/pkg/chartutil.k8sVersionMinor=$minor"
      ;;
    shfmt)
      module=mvdan.cc/sh/v3; expected="v${SHFMT_VERSION}"; package=mvdan.cc/sh/v3/cmd/shfmt
      flags="$flags -X main.version=$expected"
      ;;
    kubeconform)
      module=github.com/yannh/kubeconform; expected="v${KUBECONFORM_VERSION}"; package=github.com/yannh/kubeconform/cmd/kubeconform
      flags="$flags -X main.version=$expected"
      ;;
    kubectl)
      module=k8s.io/kubectl; expected="v0.${KUBECTL_VERSION#1.}"; package=.
      flags="$flags -X k8s.io/client-go/pkg/version.gitVersion=v${KUBECTL_VERSION} -X k8s.io/component-base/version.gitVersion=v${KUBECTL_VERSION}"
      ;;
    tflint)
      module=github.com/terraform-linters/tflint; expected="v${TFLINT_VERSION}"; package=$module
      ;;
    trivy)
      module=github.com/aquasecurity/trivy; expected="v${TRIVY_VERSION}"; package=github.com/aquasecurity/trivy/cmd/trivy
      flags="$flags -X github.com/aquasecurity/trivy/pkg/version/app.ver=$TRIVY_VERSION"
      ;;
    buildctl|buildkitd)
      lock_directory=buildkit
      module=github.com/moby/buildkit; expected="v${BUILDKIT_VERSION}"; package="$module/cmd/$binary"
      flags="$flags -X github.com/moby/buildkit/version.Version=$expected -X github.com/moby/buildkit/version.Revision=kubeclaw-security-rebuild"
      ;;
    buildkit-runc)
      lock_directory=runc
      module=github.com/opencontainers/runc; expected="v${RUNC_VERSION}"; package=$module
      # Match BuildKit's upstream runc tags, including seccomp/AppArmor and
      # static linking. No runtime sandbox feature is removed by the rebuild.
      cgo=1; tags='apparmor seccomp netgo cgo static_build osusergo'
      flags="$flags -extldflags=-static -X main.version=$RUNC_VERSION -X main.gitCommit=kubeclaw-security-rebuild"
      ;;
    rootlesskit)
      module=github.com/rootless-containers/rootlesskit/v3; expected="v${ROOTLESSKIT_VERSION}"; package="$module/cmd/rootlesskit"
      ;;
    *) echo "Unknown runtime binary: $binary" >&2; exit 2 ;;
  esac
  (
    cd "$lock_directory"
    lock_before=$(sha256sum go.mod go.sum)
    go mod download all
    test "$lock_before" = "$(sha256sum go.mod go.sum)"
    go mod verify
    test "$(go list -mod=readonly -m -f '{{.Version}}' "$module")" = "$expected"
    CGO_ENABLED="$cgo" go build -p=2 -mod=readonly -trimpath -tags "$tags" -ldflags "$flags" -o "$binary_output/$binary" "$package"
  )
done
