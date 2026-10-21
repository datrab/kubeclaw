# Kubernetes Fixture User Guide

Status: authoritative replacement configuration after cutover

Audience: project authors
Purpose: declare an isolated Kubernetes deployment fixture

## Use the Fixture

Add a fixture to `.swarm/pipeline.json`. Link it to the artifact that contains
the checked Kubernetes YAML.

```json
{
  "fixtures": {
    "deployment": {
      "uses": "kubeclaw.kubernetes-fixture@1",
      "config": {
        "image": {
          "reference": "registry-local.kubeclaw.svc.cluster.local:5001/apps/web@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        },
        "serviceName": "web",
        "servicePort": 8080,
        "namespacePrefix": "test",
        "retention": { "mode": "delete", "seconds": 1800 },
        "readinessTimeoutSeconds": 120,
        "secretReferences": ["web-test-login"]
      },
      "inputs": {
        "checked-manifest": {
          "from": "checkedYaml",
          "output": "artifact-1",
          "mediaType": "application/vnd.kubeclaw.checked-kubernetes-yaml"
        }
      }
    }
  }
}
```

## Prepare the YAML

Prepare the final YAML before this fixture starts. Run manifest lint against
those exact bytes. Do not set `metadata.namespace` in a resource.

Use immutable image references in every workload. At least one workload must
use the image in `image.reference`.

Define the configured Service and port in the YAML. The fixture waits until
the Service has ready endpoints.

## Consume the Output

The `deployment` output uses schema
`kubeclaw.kubernetes-deployment-fixture@1`. It contains these values:

- namespace;
- internal service endpoints;
- test Secret references;
- checked manifest digest;
- immutable image reference;
- creation and expiry times;
- retention mode;
- release action.

The output does not contain Secret values or a public URL.

## Select Retention

Use `delete` for normal gates. The runner deletes the lease after dependent
nodes finish.

Use `retain` only for bounded inspection. The namespace controller deletes the
namespace when the lease expires. Use the returned release action to end the
retention period early.

## Keep Responsibilities Separate

Use container build to create the image. Use a manifest provider to prepare
YAML. Use lint to check YAML. Use tests to judge application behavior.

The Kubernetes fixture performs none of those actions.
