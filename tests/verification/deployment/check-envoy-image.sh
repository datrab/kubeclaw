#!/usr/bin/env bash
set -euo pipefail
image="${1:?digest-pinned Envoy image required}"
[[ "$image" =~ @sha256:[a-f0-9]{64}$ ]]
root="$(mktemp -d)"
container=""
cleanup() { if [[ -n "$container" ]]; then docker logs "$container"; docker rm -f "$container" >/dev/null; fi; rm -rf "$root"; }
trap cleanup EXIT
# Real certificates and real Envoy TLS handshakes; no replacement proxy or stub server.
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$root/ca.key" -out "$root/ca.crt" -days 1 -subj /CN=KubeClaw-Image-Test-CA 2>/dev/null
for identity in server accepted rejected; do
  openssl req -newkey rsa:2048 -nodes -keyout "$root/$identity.key" -out "$root/$identity.csr" -subj "/CN=$identity" 2>/dev/null
  if [[ "$identity" == server ]]; then
    printf 'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n' > "$root/extensions"
  else
    printf 'subjectAltName=URI:spiffe://kubeclaw.internal/%s\nextendedKeyUsage=clientAuth\n' "$identity" > "$root/extensions"
  fi
  openssl x509 -req -in "$root/$identity.csr" -CA "$root/ca.crt" -CAkey "$root/ca.key" -CAcreateserial -out "$root/$identity.crt" -days 1 -extfile "$root/extensions" 2>/dev/null
done
cat > "$root/envoy.yaml" <<'YAML'
static_resources:
  listeners:
    - name: mtls
      address: {socket_address: {address: 0.0.0.0, port_value: 18443}}
      filter_chains:
        - transport_socket:
            name: envoy.transport_sockets.tls
            typed_config:
              '@type': type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.DownstreamTlsContext
              require_client_certificate: true
              common_tls_context:
                tls_certificates:
                  - certificate_chain: {filename: /proof/server.crt}
                    private_key: {filename: /proof/server.key}
                validation_context:
                  trusted_ca: {filename: /proof/ca.crt}
                  match_typed_subject_alt_names:
                    - san_type: URI
                      matcher: {exact: 'spiffe://kubeclaw.internal/accepted'}
          filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                '@type': type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: proof
                route_config:
                  name: proof
                  virtual_hosts:
                    - name: proof
                      domains: ['*']
                      routes:
                        - match: {prefix: /}
                          direct_response: {status: 200, body: {inline_string: authenticated}}
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config: {'@type': type.googleapis.com/envoy.extensions.filters.http.router.v3.Router}
YAML
chmod 755 "$root"
chmod 644 "$root"/*.key
container="$(docker run -d --user 0 -p 127.0.0.1::18443 -v "$root:/proof:ro" "$image" -c /proof/envoy.yaml)"
port="$(docker port "$container" 18443/tcp | cut -d: -f2)"
ready=false
for attempt in {1..40}; do
  if curl --silent --show-error --fail --max-time 2 --cacert "$root/ca.crt" --cert "$root/accepted.crt" --key "$root/accepted.key" "https://localhost:$port/" > "$root/response" 2>/dev/null; then ready=true; break; fi
  sleep 0.5
done
[[ "$ready" == true ]]
[[ "$(cat "$root/response")" == authenticated ]]
if curl --silent --max-time 3 --cacert "$root/ca.crt" "https://localhost:$port/"; then echo 'Envoy accepted a missing client certificate' >&2; exit 1; fi
if curl --silent --max-time 3 --cacert "$root/ca.crt" --cert "$root/rejected.crt" --key "$root/rejected.key" "https://localhost:$port/"; then echo 'Envoy accepted the wrong SPIFFE identity' >&2; exit 1; fi
echo 'Real Envoy: trusted identity accepted; missing certificate and wrong identity rejected.'
