{{/* Local functional trust probes; never forward into business/admin routes. */}}
{{- define "kubeclaw.trustReadinessListeners" -}}
- name: kubelet-health
  address: { socket_address: { address: 0.0.0.0, port_value: 19000 } }
  filter_chains:
    - filters:
        - name: envoy.filters.network.http_connection_manager
          typed_config:
            "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
            stat_prefix: worker_trust_readiness
            stream_idle_timeout: 2s
            request_timeout: 2s
            max_request_headers_kb: 8
            route_config:
              name: readiness-only
              request_headers_to_remove: [x-envoy-upstream-rq-timeout-ms, x-envoy-upstream-rq-per-try-timeout-ms, x-envoy-retry-on, x-envoy-max-retries, x-envoy-hedge-on-per-try-timeout]
              virtual_hosts:
                - name: readiness-only
                  domains: ["*"]
                  routes:
                    - match: { path: /health, headers: [{ name: ":method", string_match: { exact: GET } }] }
                      direct_response: { status: 200 }
                    - match: { path: /bootstrap, headers: [{ name: ":method", string_match: { exact: GET } }] }
                      direct_response: { status: 200 }
                    - match: { path: /ready, headers: [{ name: ":method", string_match: { exact: GET } }] }
                      route: { cluster: worker-trust-self-check, timeout: 1s }
                    - match: { prefix: / }
                      direct_response: { status: 404 }
            access_log:
              - name: envoy.access_loggers.stderr
                filter:
                  status_code_filter: { comparison: { op: GE, value: { default_value: 500, runtime_key: worker_trust_log_failure_status } } }
                typed_config:
                  "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StderrAccessLog
                  log_format:
                    json_format: { event: worker.trust.readiness.failure, response_code: "%RESPONSE_CODE%", response_flags: "%RESPONSE_FLAGS%", duration_ms: "%DURATION%" }
            http_filters: [{ name: envoy.filters.http.router, typed_config: { "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router } }]
# This listener can only acknowledge its own identity; it has no business route.
- name: worker-trust-self-check
  address: { socket_address: { address: 127.0.0.1, port_value: 19001 } }
  filter_chains:
    - transport_socket:
        name: envoy.transport_sockets.tls
        typed_config:
          "@type": type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.DownstreamTlsContext
          require_client_certificate: true
          disable_stateless_session_resumption: true
          disable_stateful_session_resumption: true
          common_tls_context:
            tls_certificate_sds_secret_configs:
              - name: default
                sds_config:
                  resource_api_version: V3
                  api_config_source: { api_type: GRPC, transport_api_version: V3, grpc_services: [{ envoy_grpc: { cluster_name: spire-agent } }] }
            combined_validation_context:
              default_validation_context:
                match_typed_subject_alt_names: [{ san_type: URI, matcher: { exact: {{ .identity | quote }} } }]
              validation_context_sds_secret_config:
                name: {{ printf "spiffe://%s" .trustDomain | quote }}
                sds_config:
                  resource_api_version: V3
                  api_config_source: { api_type: GRPC, transport_api_version: V3, grpc_services: [{ envoy_grpc: { cluster_name: spire-agent } }] }
      filters:
        - name: envoy.filters.network.http_connection_manager
          typed_config:
            "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
            stat_prefix: worker_trust_self_check
            common_http_protocol_options: { max_requests_per_connection: 1 }
            route_config:
              name: self-check-only
              virtual_hosts:
                - name: self-check-only
                  domains: ["*"]
                  routes:
                    - match: { path: /ready, headers: [{ name: ":method", string_match: { exact: GET } }] }
                      direct_response: { status: 200 }
                    - match: { prefix: / }
                      direct_response: { status: 404 }
            http_filters: [{ name: envoy.filters.http.router, typed_config: { "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router } }]
{{- end -}}
{{- define "kubeclaw.trustReadinessCluster" -}}
- name: worker-trust-self-check
  type: STATIC
  connect_timeout: 0.5s
  per_connection_buffer_limit_bytes: 4096
  circuit_breakers:
    thresholds: [{ priority: DEFAULT, max_connections: 4, max_pending_requests: 4, max_requests: 4, max_retries: 0 }]
  load_assignment:
    cluster_name: worker-trust-self-check
    endpoints: [{ lb_endpoints: [{ endpoint: { address: { socket_address: { address: 127.0.0.1, port_value: 19001 } } } }] }]
  typed_extension_protocol_options:
    envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
      "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
      common_http_protocol_options: { max_requests_per_connection: 1 }
      explicit_http_config: { http_protocol_options: {} }
  transport_socket:
    name: envoy.transport_sockets.tls
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.UpstreamTlsContext
      max_session_keys: 0
      common_tls_context:
        tls_certificate_sds_secret_configs:
          - name: default
            sds_config:
              resource_api_version: V3
              api_config_source: { api_type: GRPC, transport_api_version: V3, grpc_services: [{ envoy_grpc: { cluster_name: spire-agent } }] }
        combined_validation_context:
          default_validation_context:
            match_typed_subject_alt_names: [{ san_type: URI, matcher: { exact: {{ .identity | quote }} } }]
          validation_context_sds_secret_config:
            name: {{ printf "spiffe://%s" .trustDomain | quote }}
            sds_config:
              resource_api_version: V3
              api_config_source: { api_type: GRPC, transport_api_version: V3, grpc_services: [{ envoy_grpc: { cluster_name: spire-agent } }] }
{{- end -}}
