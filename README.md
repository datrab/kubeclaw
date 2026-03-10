# KubeClaw 🦞

**Autonomous Multi-Agent AI Swarm on Kubernetes**

KubeClaw is a Helm-deployable framework for running autonomous AI agent swarms on Kubernetes. It provides deterministic pipeline orchestration, sandboxed code execution, confidence-weighted vector memory, and structured inter-agent communication — all running on your own infrastructure.

Built on top of [OpenClaw](https://github.com/openclaw/openclaw), KubeClaw adds the orchestration, memory, and deployment layers needed to run multi-agent systems in production.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        KubeClaw Swarm                       │
│                                                             │
│  ┌──────────────────────┐    ACP     ┌───────────────────┐  │
│  │       Nova Pod       │◄─────────►│    Forge Pod       │  │
│  │  (Orchestrator)      │  subagent  │  (Code Writer)     │  │
│  │                      │           │                     │  │
│  │  ├─ Gateway          │    ACP     ├─ Gateway           │  │
│  │  ├─ Stream Processor │◄─────────►│  ├─ Stream Proc.   │  │
│  │  ├─ Pipeline Engine  │  subagent  │  └─ Skills         │  │
│  │  ├─ Skills           │           └───────────────────┘  │
│  │  └─ Mission Control* │                                   │
│  └──────────┬───────────┘    ACP     ┌───────────────────┐  │
│             │            ◄─────────►│    Echo Pod        │  │
│             │             subagent   │  (Code Reviewer)   │  │
│             │                        └───────────────────┘  │
│             │ Redis Streams                                  │
│             ▼                                                │
│  ┌──────────────────────┐                                   │
│  │      Buster Pod      │  ◄── Isolated sandbox             │
│  │  (Destructive Tester)│      Podman-in-Pod                │
│  │                      │      SYS_ADMIN + SYS_CHROOT       │
│  │  ├─ Gateway          │                                   │
│  │  ├─ Stream Processor │                                   │
│  │  ├─ Podman Engine    │                                   │
│  │  └─ Test Tools       │                                   │
│  └──────────────────────┘                                   │
│                                                             │
│  Shared Infrastructure:                                      │
│  ├─ Redis (inter-agent messaging)                           │
│  ├─ Qdrant (confidence-weighted vector memory)              │
│  ├─ LiteLLM (multi-provider LLM proxy)                     │
│  └─ Monitoring (Prometheus + Grafana + Loki)*               │
└─────────────────────────────────────────────────────────────┘
  * = optional
```

### Agent Roles

| Agent | Role | Dispatch | Key Capability |
|-------|------|----------|----------------|
| **Nova** | Orchestrator | — | Pipeline engine, decision tree, memory management |
| **Forge** | Code Writer | ACP (Nova subagent) | Multi-model coding (Codex, Gemini, Sonnet) |
| **Echo** | Code Reviewer | ACP (Nova subagent) | Security-first review, pattern validation |
| **Buster** | Destructive Tester | Redis (isolated pod) | Podman sandbox, Lighthouse, Playwright, k6 |

### Key Components

- **Pipeline Engine** (`pipeline.js`) — Deterministic orchestrator that drives modules through forge → test → review cycles with automatic retry, blueprint management, chaos testing, and Qdrant memory integration.
- **Stream Processor** (`processor.cjs`) — Redis Streams consumer sidecar that routes tasks between agents, enriches payloads with Qdrant context, and injects into the OpenClaw gateway.
- **Skill System** — Pluggable JavaScript skills for Redis communication, Qdrant memory (with confidence scoring, feedback loops, decay), Discord integration, visual auditing, and boundary enforcement.
- **Workspace Templates** — Markdown-based agent configuration (SOUL.md, AGENTS.md, TOOLS.md) that define personality, protocols, and operating procedures per agent.

## Quick Start

### Prerequisites

- Kubernetes cluster (K3s, EKS, GKE, or any conformant cluster)
- Helm 3.x
- `kubectl` configured for your cluster
- OpenClaw gateway tokens (one per agent)
- LLM API access (via LiteLLM or direct)

### 1. Add Dependencies (optional — skip if you have existing Redis/Qdrant)

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add qdrant https://qdrant.github.io/qdrant-helm
helm repo update
```

### 2. Create Secrets

```bash
# Create shared secret with your tokens
kubectl create secret generic kubeclaw-shared-secrets \
  --from-literal=gatewayToken-nova=YOUR_NOVA_TOKEN \
  --from-literal=gatewayToken-forge=YOUR_FORGE_TOKEN \
  --from-literal=gatewayToken-echo=YOUR_ECHO_TOKEN \
  --from-literal=gatewayToken-buster=YOUR_BUSTER_TOKEN \
  --from-literal=litellmApiKey=YOUR_LITELLM_KEY \
  --from-literal=discordWebhook=YOUR_WEBHOOK_URL

# Create Git deploy keys (one per agent)
kubectl create secret generic git-deploy-key-nova \
  --from-file=id_rsa=$HOME/.ssh/nova_deploy_key
```

### 3. Install

```bash
# Install with built-in dependencies (Redis, Qdrant, LiteLLM)
helm install kubeclaw ./charts/kubeclaw \
  --values examples/nova-values.yaml

# Or with external services
helm install kubeclaw ./charts/kubeclaw \
  --values examples/nova-values.yaml \
  --set redis.deploy=false \
  --set redis.host=my-redis.default.svc.cluster.local \
  --set qdrant.deploy=false \
  --set qdrant.url=http://my-qdrant:6333
```

### 4. Deploy All Agents

```bash
# Using the deploy script (reads secrets from SOPS)
./scripts/deploy.sh all

# Or manually per agent
helm upgrade --install agent-nova ./charts/kubeclaw -f examples/nova-values.yaml
helm upgrade --install agent-forge ./charts/kubeclaw -f examples/forge-values.yaml
helm upgrade --install agent-echo ./charts/kubeclaw -f examples/echo-values.yaml
helm upgrade --install agent-buster ./charts/kubeclaw -f examples/buster-values.yaml
```

### 5. Verify

```bash
kubectl get pods -l app.kubernetes.io/name=kubeclaw
kubectl logs -l app.kubernetes.io/component=nova -f
```

## Configuration

See [`charts/kubeclaw/values.yaml`](charts/kubeclaw/values.yaml) for the full reference with inline documentation.

### Key Sections

| Section | Description |
|---------|-------------|
| `agentRole` | Agent identity: `nova`, `forge`, `echo`, or `buster` |
| `image` | Container image configuration |
| `gateway` | OpenClaw gateway settings |
| `litellm` | LLM proxy connection and model definitions |
| `redis` | Redis connection (or deploy built-in) |
| `qdrant` | Qdrant vector DB connection (or deploy built-in) |
| `discord` | Discord bot integration (optional) |
| `workspace` | Agent personality and protocol files |
| `missionControl` | Web dashboard (optional, Nova only) |
| `sandbox` | Podman-in-Pod config (Buster only) |
| `persistence` | PVC sizing and storage classes |

### Example Values Files

The `examples/` directory contains ready-to-customize values for each agent role:

- [`examples/nova-values.yaml`](examples/nova-values.yaml) — Orchestrator with pipeline engine
- [`examples/forge-values.yaml`](examples/forge-values.yaml) — Multi-model code writer
- [`examples/echo-values.yaml`](examples/echo-values.yaml) — Security-first reviewer
- [`examples/buster-values.yaml`](examples/buster-values.yaml) — Sandboxed destructive tester

## How It Works

### Pipeline Flow

```
Blueprint Release → Forge (build) → Git Sync → Buster (test) → PASS/FAIL
                                                                    │
                    ┌───────────────────────────────────────────────┘
                    │
              PASS ─┼─→ Memory Feedback (boost) → Summary Agent → Next Module
                    │
              FAIL ─┼─→ Memory Feedback (decay) → Kill Agent → Retry with Context
                    │
           BLOCKED ─┴─→ Discord Alert → Human Intervention
```

### Memory System

KubeClaw uses Qdrant for confidence-weighted vector memory:

- **Before each task**: Relevant memories are recalled and injected into the agent's prompt
- **After PASS**: Memory confidence is boosted; a Summary Agent extracts reusable patterns
- **After FAIL**: Memory confidence is decayed (single decay, not cumulative on retries)
- **Cross-agent**: Memories recalled by a different agent than the author get a small confidence boost
- **Weekly maintenance**: CronJob prunes low-confidence memories and archives stale entries

### Inter-Agent Communication

- **ACP** (Agent Communication Protocol): Nova ↔ Forge/Echo — direct subagent spawning and lifecycle control
- **Redis Streams**: Nova → Buster — async task dispatch via `swarm:{agent}:tasks` streams, processed by the sidecar

## Docker Images

Custom images extending the base OpenClaw image:

| Image | Purpose | Key Additions |
|-------|---------|---------------|
| `Dockerfile.general` | Nova, Forge, Echo | ioredis, Qdrant client, ACPX plugin |
| `Dockerfile.sandbox` | Buster | Podman, Playwright, Lighthouse, k6, nginx |
| `Dockerfile.mission-control` | Dashboard | Next.js standalone build |

Build:
```bash
docker build -f docker/Dockerfile.general -t your-registry/kubeclaw-general:latest .
docker build -f docker/Dockerfile.sandbox -t your-registry/kubeclaw-sandbox:latest .
```

## Project Structure

```
kubeclaw/
├── charts/kubeclaw/          # Helm chart
│   ├── Chart.yaml            # Chart metadata + dependencies
│   ├── values.yaml           # Default configuration
│   ├── templates/            # Kubernetes manifests
│   └── files/                # Skills, processor, pipeline (JS)
├── docker/                   # Container image definitions
├── examples/                 # Per-agent value files + workspace templates
├── scripts/                  # Deployment and maintenance scripts
├── monitoring/               # Grafana dashboards + stack values
└── maintenance/              # Memory maintenance CronJob
```

## Roadmap

- [ ] Web UI for agent management and configuration
- [ ] `kubeclaw init` CLI for guided setup
- [ ] Subchart dependencies auto-install
- [ ] Horizontal scaling for Forge workers
- [ ] OpenTelemetry integration
- [ ] Multi-cluster support

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

Apache License 2.0 — see [LICENSE](LICENSE).

---

*KubeClaw is built on [OpenClaw](https://github.com/openclaw/openclaw) and designed for Kubernetes-native AI agent orchestration.*
