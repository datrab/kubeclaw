FROM registry-mirror.kubeclaw.svc.cluster.local:5000/library/nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY src/ /usr/share/nginx/html/
