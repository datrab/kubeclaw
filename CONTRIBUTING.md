# Contributing to KubeClaw

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. **Fork and clone** the repository
2. **Prerequisites**: Helm 3.x, kubectl, a K8s cluster (K3s works great for development)
3. **Lint the chart**: `helm lint ./charts/kubeclaw`
4. **Template test**: `helm template test ./charts/kubeclaw -f examples/nova-values.yaml`

## How to Contribute

### Reporting Issues

Open an issue with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (K8s version, Helm version, cloud provider)

### Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run `helm lint` and `helm template` to verify
4. Submit a PR with a clear description of what and why

### Areas Where Help Is Wanted

- **Documentation**: Improved guides, tutorials, video walkthroughs
- **Testing**: CI pipeline, helm chart tests, integration tests
- **Skills**: New skill scripts (monitoring, alerting, deployment)
- **Providers**: Support for additional LLM providers beyond LiteLLM
- **Platforms**: Testing on EKS, GKE, AKS, OpenShift

## Code Style

- **JavaScript**: ES modules, async/await, descriptive variable names
- **Helm templates**: Follow the existing pattern with helpers for secret resolution
- **YAML**: 2-space indentation, comments for non-obvious values
- **Commits**: Descriptive messages, prefix with `[chart]`, `[skills]`, `[docs]`, etc.

## Architecture Decisions

Key design principles to maintain:

- **Kill-and-respawn over keep-alive**: Fresh agents with better prompts > stale agents with polluted context
- **JSON for machines, Markdown for LLMs**: State files are JSON, instructions are Markdown
- **Sequential execution**: One module at a time, never parallel (deterministic behavior)
- **Confidence-weighted memory**: Qdrant memories have confidence scores that evolve over time

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
