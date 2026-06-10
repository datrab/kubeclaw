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
