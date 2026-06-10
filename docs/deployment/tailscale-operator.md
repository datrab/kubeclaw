# Tailscale Operator Deployment

Status: current
Audience: operator

## Purpose

Explain how KubeClaw installs the Tailscale Kubernetes Operator and how that relates to final previews.

## Current Install Path

`scripts/deploy.sh tailscale` forces the Tailscale operator install path. `scripts/deploy.sh infra` also calls the same installer when `TAILSCALE_OPERATOR_ENABLED` is enabled.

The installer:

- checks for `operator-oauth` in the Tailscale operator namespace
- can create that Secret from temporary `TAILSCALE_OAUTH_CLIENT_ID` and `TAILSCALE_OAUTH_CLIENT_SECRET`
- installs `tailscale/tailscale-operator` with `my-values/infra/tailscale-operator-values.yaml`
- waits for operator pods
- verifies `IngressClass/tailscale`

## Tailnet Prerequisites

Upstream Tailscale owns tailnet setup, OAuth client scope requirements, and operator behavior. KubeClaw requires the OAuth client credentials to be available as Kubernetes Secret data:

- namespace: `tailscale` by default
- Secret: `operator-oauth` by default
- keys: `client_id`, `client_secret`

Upstream docs:

- <https://tailscale.com/docs/kubernetes-operator>
- <https://tailscale.com/docs/kubernetes-operator/quickstart>
- <https://tailscale.com/docs/kubernetes-operator/ingress>

## Deploy

Create or verify the OAuth Secret:

```bash
./scripts/deploy.sh secrets
```

Install only the Tailscale operator:

```bash
./scripts/deploy.sh tailscale
```

Install it with all shared infrastructure:

```bash
./scripts/deploy.sh infra
```

## Verification

```bash
kubectl -n tailscale get secret operator-oauth
kubectl -n tailscale get pods
kubectl get ingressclass tailscale
```

## Related Pages

- `../operators/final-preview-tailscale.md`
- `networking.md`
- `secrets.md`

## Common Failures

- `operator-oauth` missing: rerun the secret helper or create `tailscale/operator-oauth` manually.
- OAuth scopes/tags invalid: use upstream Tailscale docs to correct the tailnet policy.
- `IngressClass tailscale` missing: rerun `./scripts/deploy.sh tailscale` and check operator pods.
- final preview has no URL: inspect the preview Ingress and Tailscale operator logs.
