# Placeholder Secrets

Status: example, not production values
Audience: operators

## Purpose

Show command shapes for creating Secrets manually. Replace every placeholder before use.

## Shared Secret

```bash
kubectl create secret generic openclaw-shared-secrets -n "$NAMESPACE" \
  --from-literal=gatewayToken-forge="<generated-token>" \
  --from-literal=gatewayToken-echo="<generated-token>" \
  --from-literal=gatewayToken-buster="<generated-token>" \
  --from-literal=gatewayToken-nova="<generated-token>" \
  --from-literal=anthropicApiKey="<provider-credential>" \
  --from-literal=stitchApiKey="<stitch-api-key>" \
  --from-literal=discordToken-forge="<discord-token>" \
  --from-literal=discordToken-echo="<discord-token>" \
  --from-literal=discordToken-buster="<discord-token>" \
  --from-literal=discordToken-nova="<discord-token>" \
  --from-literal=discordWebhook="<discord-webhook-url>" \
  --from-literal=litellmApiKey="<litellm-master-key>"
```

## Required Supporting Secrets

```bash
kubectl create secret generic redis-secrets -n "$NAMESPACE" \
  --from-literal=redis-password="<generated-password>"

kubectl create secret docker-registry ghcr-secret -n "$NAMESPACE" \
  --docker-server=ghcr.io \
  --docker-username="<github-user>" \
  --docker-password="<github-token>" \
  --docker-email="noreply@example.com"
```

## Optional LiteLLM/PostgreSQL Secrets

```bash
kubectl create secret generic postgresql-secrets -n "$NAMESPACE" \
  --from-literal=postgres-password="<generated-password>" \
  --from-literal=litellm-password="<generated-password>"

kubectl create secret generic litellm-secrets -n "$NAMESPACE" \
  --from-literal=LITELLM_MASTER_KEY="<litellm-master-key>" \
  --from-literal=DATABASE_URL="postgresql://litellm:<password>@postgresql.${NAMESPACE}.svc.cluster.local:5432/litellm"

kubectl create secret generic google-sa-key -n "$NAMESPACE" \
  --from-file=credentials.json="<path-to-placeholder-json>"
```

## Tailscale OAuth Secret

```bash
kubectl create namespace tailscale --dry-run=client -o yaml | kubectl apply -f -
kubectl create secret generic operator-oauth -n tailscale \
  --from-literal=client_id="<tailnet-oauth-client-id>" \
  --from-literal=client_secret="<tailnet-oauth-client-secret>"
```

## Verify And Replace

Placeholder commands are for shape only. Replace every placeholder before deployment and prefer `./my-values/setup-secrets.sh` when you want the repo-owned resolution order.

```bash
kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets redis-secrets ghcr-secret git-deploy-key-nova git-deploy-key-buster
kubectl -n "$NAMESPACE" get secret postgresql-secrets litellm-secrets google-sa-key
kubectl -n tailscale get secret operator-oauth
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
```

Failure signals:

- `secret ... exists but is missing keys`: rerun `my-values/setup-secrets.sh` with `KUBECLAW_SECRET_SETUP_MODE=interactive` or patch the missing key.
- `ImagePullBackOff`: inspect `ghcr-secret` before rebuilding images.
- LiteLLM starts but provider calls fail: check `litellm-secrets`, `google-sa-key`, and upstream provider permissions.
- Tailscale final preview has no URL: check `tailscale/operator-oauth`, operator pods, and tailnet ACL/tag policy.
