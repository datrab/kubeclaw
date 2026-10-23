# Same-owner OAuth callers: required migration delta

Additive source correction to TARGET-CONTRACT, not implementation or acceptance.
The finite target scope MUST include both current OAuth writers, not only helper:

- `scripts/deploy.sh::cmd_secrets -> run_secret_setup -> setup-secrets.sh`.
- `scripts/deploy.sh::deploy_tailscale_operator -> ensure_tailscale_oauth_secret`
  (currently1077–1110), reached from infrastructure/setup and direct `tailscale`
  command (currently2912). This second branch currently accepts present object
  existence as readiness and can create the OAuth pair from bootstrap ENV.

Exactly the SAME selected deployment provisioning owner and original task/source/
role/namespace/secret-name/pair/revision/replacement grant must reach all these
callers. `ensure_tailscale_oauth_secret` becomes an internal adapter to the same
guarded OAuth family receiver; it cannot retain an independent ENV author,
create/copy/prompt path or exists-only readiness rule. The direct tailscale command
must load/validate/bind the same explicit file/profile and original deployment
task before any secret/API/native access. Its current forcedtrue installation
flag is task intent only: it cannot override policy components.tailscale=false,
selected namespace/name, source precedence or replacement authorizations.

For a disabled selected family, no namespace/read/secret/provider action is
permitted; an explicit install intent incompatible with disabled policy rejects
before effects. For enabled family, a present target must satisfy the same
confidential required-pair/type/shape and original source/application association
rules. Shape does not prove OAuth/provider usability. One missing/empty key is
INCOMPLETE, never READY because the object exists. A half bootstrap pair rejects;
complete original bootstrap pair, source copy and authorized interactive paths
follow the same existing OAuth family order. No cross-revision half mixing or
unrequested replacement. All child projections are readonly and selected values
must equal the actual operator Helm namespace/secret reference before deployment.

Current normalized mode auto/true and return2 skip behavior remain source facts,
not target readiness: inventory may report NOT_INSTALLED/INCOMPLETE without API
mutation. Any dependent installation/preview admission requires the exact selected
completion evidence; warning+return0 or return2 cannot fulfill it. An explicitly
optional skipped deployment is recorded as skipped/not-run, never usable/PASS.
Unknown/missing original policy/task uses PROVISIONING_POLICY_INVALID or
PROVISIONING_ACTIVATION_BLOCKED before source lookup; incomplete pair uses
PROVISIONING_INCOMPLETE. Keep sanitized diagnostics and original uncertainty/CAS/
revision/clock/budget/cleanup rules from TARGET-CONTRACT, including recovery A
before B. This is one receiver migrated across both callers, not a new service.

## Exact future caller tests

Extend the existing OAuth-family, invocation, association and recovery case IDs
in future-target-cases.json, preserving their original bodies. Run the SAME
complete profile/task/source/target fixture once via cmd_secrets and once via
direct tailscale plus infrastructure setup path. Observe exact selected
namespace/name/profile/source/role and native action trace at the guarded receiver;
all must agree. The tests exercise real migrated callers/receivers, not mocked
helper outputs. Required subcases for each caller:

1. Original complete target retained without issuance; object present but
   client_secret missing/empty rejects dependent Helm install.
2. Complete authorized original bootstrap pair creates under exact original
   namespace/secret/task grant; half pair rejects before namespace/create.
3. Equal-valued legacy ENV override still rejects; different profile/source/name
   or current B cannot bypass original task; disabled family produces zero actions.
4. Auto skipped/warning path cannot become readiness/USABLE; explicit incompatible
   installation intent rejects rather than enabling policy.
5. Crash after creation before receipt reconciles original outcome, not second
   creation or overwrite; uncertain issuance retains original effect and A.

Mutate only direct ensure_tailscale_oauth_secret to restore exists-only success:
the incomplete-existing-object/direct-tailscale negative must fail specifically
because dependent installation is admitted. Mutate only independent ENV bootstrap
writer: exact equal-override/cross-task negative must fail. Restore and repeat
matched positive through EACH real caller. Native cases remain not-run until
approved implementation and genuine API/provider/task grants; setup failure does
not kill a semantic mutant. No secret bytes or plain secret hashes enter evidence.
