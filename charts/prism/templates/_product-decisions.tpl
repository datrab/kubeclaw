{{- define "prism.productDecisions.enabled" -}}
{{- if hasKey .Values.control.productDecisions "enabled" -}}{{ fail "control.productDecisions.enabled moved to prism-control.config.json settings.productDecisionsEnabled" }}{{- end -}}
{{- $projection := include "prism.swarmConfig" . | mustFromJson -}}
{{- $control := $projection.operator.prism.control -}}
{{- if not (and (hasKey $control "productDecisionsEnabled") (kindIs "bool" $control.productDecisionsEnabled)) -}}{{ fail "central productDecisionsEnabled boolean required; regenerate Prism topology" }}{{- end -}}
{{- toJson $control.productDecisionsEnabled -}}
{{- end -}}

{{- define "prism.productDecisions.validate" -}}
{{- $config := .Values.control.productDecisions -}}
{{- if eq (include "prism.productDecisions.enabled" .) "true" -}}
{{- if not .Values.tailscale.enabled -}}{{ fail "Product decisions require the authenticated Tailscale Studio ingress" }}{{- end -}}
{{- if eq $config.signingSecretName .Values.secrets.runtime -}}{{ fail "Product decision signing authority must use a separate Secret" }}{{- end -}}
{{- range $name := list "issuer" "origin" "authorityRevision" "signingSecretName" "signingSecretKey" "controllerUrl" "controllerNamespace" "controllerRelease" "controllerCaSecretName" "controllerCaSecretKey" "tokenAudience" -}}
{{- if not (index $config $name) -}}{{ fail (printf "Product decisions require %s" $name) }}{{- end -}}
{{- end -}}
{{- if not (regexMatch "^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?/?$" $config.origin) -}}{{ fail "Product decisions require an HTTPS origin" }}{{- end -}}
{{- if not (regexMatch "^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?:8443/?$" $config.controllerUrl) -}}{{ fail "Product decisions require an HTTPS controller on port 8443" }}{{- end -}}
{{- range $name := list "signingSecretName" "controllerNamespace" "controllerCaSecretName" -}}
{{- if not (regexMatch "^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$" (index $config $name)) -}}{{ fail (printf "Product decisions require valid %s" $name) }}{{- end -}}
{{- end -}}
{{- range $name := list "signingSecretKey" "controllerCaSecretKey" -}}
{{- if not (regexMatch "^[A-Za-z0-9._-]+$" (index $config $name)) -}}{{ fail (printf "Product decisions require valid %s" $name) }}{{- end -}}
{{- end -}}
{{- if not $config.operators -}}{{ fail "Product decisions require an explicit operator allowlist" }}{{- end -}}
{{- range $actor := $config.operators -}}
{{- if or (eq $actor "") (ne $actor (trim $actor)) -}}{{ fail "Product operator identities must be nonempty and have no surrounding whitespace" }}{{- end -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "prism.productDecisions.env" -}}
{{- $config := .Values.control.productDecisions -}}
{{- if eq (include "prism.productDecisions.enabled" .) "true" -}}
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
{{- if eq (include "prism.productDecisions.enabled" .) "true" -}}
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
