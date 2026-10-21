# Pipeline Workflow Guides

Status: workflow task index; full wait/resume lifecycle and deployment execution open
Audience: pipeline authors and operators
Owner: product integration maintainers
Evidence: [docs/site/use/workflows/wait-resume.md](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/docs/site/use/workflows/wait-resume.md); [docs/site/use/workflows/buster-suite.md](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/docs/site/use/workflows/buster-suite.md); [docs/site/use/workflows/kubernetes-fixture.md](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/docs/site/use/workflows/kubernetes-fixture.md); [docs/site/use/demo-delivery.md](https://github.com/datrab/kubeclaw/blob/c559e97960a89a0f80487483addb91d2e6e4527d/docs/site/use/demo-delivery.md)
Applies to: pipeline workflow selection; each guide states its contracts and execution prerequisites
Last verified: 2026-10-11; workflow links and bounded wait/resume evidence; no successful full local lifecycle or deployment evidence

Use these guides to bind a pipeline task to its inputs, durable state, result
authority, and cleanup. A **wait** is a persisted request for a later decision.
A **resume signal** supplies that decision to the same run. Resuming creates a
new stage attempt; it does not change the result of the earlier attempt.

| Task | Reader path | Evidence boundary |
| --- | --- | --- |
| Wait, approval, and resume | [Rehearse Human Approval and Resume](wait-resume.md) | Complete inputs, host prerequisites, and ordered local rehearsal; no successful full local lifecycle evidence. The required deployment run remains open. |
| Run a Buster suite with a fixture, matrix, and report | [Run a Buster Suite](buster-suite.md) | Use that guide's declared local and deployment checks. |
| Prepare and release a Kubernetes fixture | [Prepare and Release a Kubernetes Fixture](kubernetes-fixture.md) | Separates local plan validation from deployed fixture lifecycle. |
| Deliver a demo and request human acceptance | [Deliver a Demo](../demo-delivery.md#canonical-demo-delivery-procedure) | Local contract rehearsal and explicit live-delivery prerequisites. |

## Wait, Approval, and Resume

Start with [the complete approval input set](wait-resume.md#input-set).
It uses the installed human-approval stage, durable wait store, and operator
notification adapter. Follow the guide through the first wait, wrong wait and
wrong issuer, one valid decision, exact replay, audit comparison, and cleanup.
Retain the original request, notification receipt, signal bytes, and attempt
counts. A notification receipt proves delivery; the signal and journal prove
the later Core transition.

[Configure and Operate](../operate.md#canonical-run-control-procedure) owns run
control, signal authority, interruption, and the cancellation boundary. The
workflow guide supplies concrete inputs and observations for that procedure.
[Nova Core](../../understand/nova-core.md) explains the mechanism.
[Workflow Reference](../../reference/workflows.md) describes the input contracts.

## Select the Execution Scope

Local schema and plugin tests check their stated contracts. A supported-host
rehearsal checks a disposable local run with a loopback notification receiver.
A deployment run additionally needs a registered runtime, operator access,
durable storage, package identities, receiver, and secret authority. Record each
scope separately. Neither a unit test nor a loopback run proves deployment
behavior.

The full deployment wait/resume run is mandatory and remains unexecuted. Use
[the deployment registration and stop conditions](wait-resume.md#deployment-registration)
to identify the missing inputs. Do not infer completion from an example file,
a successful notification, or a source link.
