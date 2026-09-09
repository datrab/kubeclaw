{{- define "prism.productDecisions.validate" -}}
{{- $config := .Values.control.productDecisions -}}
{{- if $config.enabled -}}
{{- if not .Values.tailscale.enabled -}}{{ fail "Product decisions require the authenticated Tailscale Studio ingress" }}{{- end -}}
{{- if eq $config.signingSecretName .Values.secrets.runtime -}}{{ fail "Product decision signing authority must use a separate Secret" }}{{- end -}}
{{- range $name := list "issuer" "origin" "authorityRevision" "signingSecretName" "signingSecretKey" "controllerUrl" "controllerNamespace" "controllerRelease" "controllerCaSecretName" "controllerCaSecretKey" "tokenAudience" -}}
{{- if not (index $config $name) -}}{{ fail (printf "Product decisions require %s" $name) }}{{- end -}}
{{- end -}}
{{- if not $config.operators -}}{{ fail "Product decisions require an explicit operator allowlist" }}{{- end -}}
{{- range $actor := $config.operators -}}
{{- if or (eq $actor "") (ne $actor (trim $actor)) -}}{{ fail "Product operator identities must be nonempty and have no surrounding whitespace" }}{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "prism.productDecisions.env" -}}
{{- $config := .Values.control.productDecisions -}}
{{- if $config.enabled -}}
- { name: PRISM_PRODUCT_DECISIONS_ENABLED, value: "true" }
- { name: PRISM_PRODUCT_ISSUER, value: {{ $config.issuer | quote }} }
- { name: PRISM_PRODUCT_OPERATORS, value: {{ toJson $config.operators | quote }} }
- { name: PRISM_PRODUCT_ORIGIN, value: {{ $config.origin | quote }} }
- { name: PRISM_PRODUCT_PRIVATE_KEY_FILE, value: /var/run/prism/product-signing/private-key.pem }
- { name: PRISM_PRODUCT_CONTROLLER_URL, value: {{ $config.controllerUrl | quote }} }
- { name: PRISM_PRODUCT_CONTROLLER_CA_FILE, value: /var/run/prism/product-controller/ca.crt }
- { name: PRISM_PRODUCT_CONTROLLER_TOKEN_FILE, value: /var/run/prism/product-controller/token }
{{- end -}}
{{- end -}}

{{- define "prism.productDecisions.volumes" -}}
{{- $config := .Values.control.productDecisions -}}
{{- if $config.enabled -}}
- name: product-decision-signing
  secret:
    secretName: {{ $config.signingSecretName | quote }}
    defaultMode: 288 # 0440: owner/group read only
    items: [{ key: {{ $config.signingSecretKey | quote }}, path: private-key.pem }]
- name: product-decision-controller
  projected:
    defaultMode: 288 # 0440: owner/group read only
    sources:
      - secret:
          name: {{ $config.controllerCaSecretName | quote }}
          items: [{ key: {{ $config.controllerCaSecretKey | quote }}, path: ca.crt }]
      - serviceAccountToken:
          audience: {{ $config.tokenAudience | quote }}
          expirationSeconds: {{ $config.tokenExpirationSeconds }}
          path: token
{{- end -}}
{{- end -}}
