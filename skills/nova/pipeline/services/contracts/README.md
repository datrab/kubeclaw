# Pipeline result contracts

This directory owns the typed result/control contracts used by the Nova pipeline:

- gate control results
- generator results
- pipeline step results
- validator control results
- worker control results

The legacy `skills/nova/pipeline/services/*result*.ts` paths are compatibility shims that re-export these implementations. New contract work should live here instead of adding more result adapters under `services/`.
