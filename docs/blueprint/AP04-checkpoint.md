# AP04 checkpoint — incomplete

Saved on 2026-09-15 at the request of the user. AP03 is complete at
`ad67f9bb5c75cfa8cc1b926668aec1dd0168452c`; this checkpoint starts AP04.
**AP04 is not accepted. Do not delete the historical register or review sources yet.**
Product documentation drafts are not publication approval.

## Work saved

- Draft canonical `docs/site/status/open-issues.json` and its generated Markdown view: 13 incomplete original findings plus GitHub #7, the continuous-GitOps revision mismatch, and the preference-decay approval discrepancy. The original denominator remains154 with141 local closures; five additional integration closures remain separate.
- Draft live acceptance plan and compact154+5-ID provenance under `docs/site/status/acceptance.md` and `docs/site/decisions/acceptance.md`.
- Core/plugin ADR001–014, runtime/operations ADR015–022 and additional D-decisions; a detailed `test-gate.md` extraction of D-001–D-119. These files still require completeness, wording and source checks.
- Decision index and current-work navigation. Echo decision extraction is missing; its planned link remains unresolved in this checkpoint.
- JSON-to-Markdown generator, seven focused tests, package commands and CI step. Workflow inventory/reference regenerated for that specific CI addition.

No original review register has been deleted or retired. No AP03 migration row
has yet been marked complete. The apparent old/new authority overlap is an
unfinished migration, not permission to maintain two current registers.

## Exact next work

1. Complete and independently check the16 issue records. Verify every immutable source URL and mutable GitHub observation date. Map all42 AP03 open-issue handoffs to issue IDs or explicit dispositions; do not reopen closed findings merely because a historical row mentions status.
2. Complete Echo D-ER001–036, D-ER3-001–019 and D-ER4-001–023 in `docs/site/decisions/echo.md`. Verify all128 decision handoffs, including SDK JSON encoding, async Git, branch/provenance preservation, controller versus human authority, attempt ownership, CPU-counter supersession and proposed demo extension.
3. Finish English/controlled-language editing and metadata for both acceptance documents. The live acceptance draft can still contain German. Reconcile all995 AP03 acceptance-target source rows into exact gates and retained evidence boundaries. Do not claim a fresh full reading of every raw log.
4. Fix the remaining generator-review issues below. Re-run its tests and generated-view check.
5. Retire old current-status authority only after extraction acceptance. Consumer review found no repository executable reader of the old JSON. Update the listed operative Markdown references; use immutable Git links for historical references. Then remove `docs/review/remediation/register.json`, replace its old Markdown view with a temporary migration pointer, and update observability-retention's D01/D07 link. Do not execute an unreviewed bulk-deletion helper.
6. Record source-to-target dispositions in the existing AP03 ledger. Preserve all original source blobs and separate AP04 extraction from AP06–09 prose work and AP10 retirement.
7. Validate source IDs, links/anchors, metadata, original154+5 closure provenance and generator output. Update work plan and reports only after AP04 acceptance, then save to the same PR13.

## Outstanding generator review

Already corrected: only three incomplete statuses allowed, denominator154 fixed,
all evidence fields/counting policy rendered, date/baseline metadata required,
and test-only workflow paths included. Seven tests pass at checkpoint.

Still required: validate original IDs against the compact154-ID provenance
instead of counts alone; reject replacement by an invented original ID.
Mutable issue/run source URLs need an explicit validated observation date and
that date must appear in the generated view. Add focused regression cases.

## Verification performed and limits

- `node --test scripts/tests/docs-status.test.mjs`: seven passed, no skips.
- Generator run succeeded against16 issue entries. Workflow inventory and reference regeneration changed only their relevant workflow outputs.
- `npm run docs:check`: current issue check and generated inventories passed after regeneration; stopped at the existing AP02 heuristic blueprint generator's stale `docs/blueprint/generated/platform-inventory.json`. Do not regenerate the old heuristic ledger over manual decisions merely to clear that gate; broader generator migration belongs to AP09.
- `npm run verify:plugin-system-v2`: stopped at the first observer build because `tsc` is unavailable.
- Deployment-truth check: stopped because `js-yaml` is unavailable.
- No runtime, native, deployment, cluster or live acceptance was completed. No technical finding was closed by AP04.

## Restart rules

Use the existing `docs/documentation-overhaul` branch and PR13. At this
checkpoint there are no live subagents. Re-read saved draft files and this
handoff before assigning further work; no unsaved agent completion is assumed.
The source baseline main remains `1e50167fcb4355dfce4110d612ab360828c64394`.

The product documentation must be detailed, understandable English with clear
reasoning and source-code links. Do not claim formal ASD-STE100 compliance from
sentence-length checks alone. Current drafts still require language review.

## Saved working review: scope-review.md

# AP04 independent scope and consumer review

Review boundary: AP04 work plan and Blueprint05 read; all 128 non-remove ledger decision destinations classified; original D01–D16 source fully read; relevant Ops/version/recovery and named supplementary decision source sections inspected. This is not another complete 2,887-source reread or runtime validation.

## Coverage requirements

ADR001–022 alone do not discharge all 128 decision handoffs. Preserve source identifiers for Test Gate D001–119 (Worker D096–104 included), Echo D-ER001–036, D-ER3 001–019 and D-ER4 001–023. Distinct phase constraints may be grouped into readable records, but explicit source-to-record mapping and supersession must survive.

Additional durable themes in ledger: attempt ownership (D13/D14/D16, fixed native reservation, retained fixture lifetime, CPU counter supersession); controller service identity versus authenticated human product acceptance; proposed demo extension ingress distinct from accepted D06; versioned SDK JSON profiles with old bytes/identity preserved; source-verified branch integration versus remote deletion; fallback cleanup proof boundary; async Git/extension repair provenance. Historical logs need not each become an ADR: their durable rule may map to one record and historical exact proof remains commit-pinned.

Blueprint05 additionally requires canonical configuration/version ownership, recovery consistency and supported operations access. Strong sources: docs/operations/runtime-versions-and-images.md (versions.json sole version source, generated committed native defaults, immutable release receipts/configuration, version-bound recovery); docs/architecture/pipeline-reliability-remediation.md (immutable graph/registry/config snapshot, no invented historical authority during recovery); docs/architecture/ops-pod.md (persistent Codex/MCP Pod, independent host/KVM recovery, accepted common failure domain); current Ops docs (MCP tool readonly does not restrict shared SA exec authority). Preserve supported GitOps adoption/manual-child sync distinction without carrying superseded direct-Helm-only maintenance forward.

Retention distinction: D06 is seven-day configurable DEMO TTL; D07 rejects automatic log deletion and fixes no Clawdeck internal TTL. No one-week log retention rule.

## Register consumers

Repository-wide full basename search for register.json and register.md, plus scripts/tools/tests/workflows and executable-path review, found no current executable reader of the old remediation JSON. This does not assert absence of external clients. Named branch archive verify.py verifies frozen archive/inventory, not current status JSON.

Active/historical navigation needing explicit authority correction:

| File | Line at inspection | Context |
| --- | --- | --- |
| docs/review/remediation/README.md | 7–8 | Complete register and machine-readable progress links |
| docs/review/remediation/register.md | 5 | JSON owns complete findings and status |
| docs/review/remediation/handoff.md | 31 | Current counts from register.json |
| docs/review/remediation/progress.md | 34 | Current D12 register link; stale 128 count |
| docs/review/remediation/resume/root-checkpoint.md | 5 | Same current-authority statement and stale count |
| docs/review/remediation/resume/README.md | 5,18–41 | Current register link, read current register, update register instructions |
| docs/review/remediation/implementation/resume-20260914-gitops-handoff.md | 7 | Explicitly says ../register.json is authoritative |

Historical source references that should be frozen if file removed:

| File | Line | Context |
| --- | --- | --- |
| docs/review/remediation/implementation/git-repository.md | 90 | Original unresolved findings read in register.json |
| docs/review/remediation/implementation/wave47-project-cli-independent-review.md | 3 | register.json T01-F01 source_finding_text original requirement |
| docs/review/remediation/implementation/wave47-infrastructure.md | 4 | source_finding_text origin, not status inference |

JSON archives docs/review/remediation/resume/run2-package-backups.json:480 and remaining-40-scheduling.json:73 contain historical path values; preserve as historical data rather than rewriting provenance. New acceptance.md already uses immutable ad67f9bb source links. Old review corpus can remain until AP10 with explicit frozen historical status, but no instructions should direct new status updates to it. Removing JSON now is possible only with authority pointers and historical commit links corrected. Blueprint generated migration references are frozen AP02 data and should not be silently rewritten as manual-ledger authority.

## Completion boundary

Every decision-handoff row needs explicit result (durable record, grouped rationale, or no durable decision with reason). Status-only source rows can be grouped into acceptance/issue coverage. AP04 completion does not set all migration_status fields to done: AP06–09 prose and AP10 retirement remain pending.


## Saved working review: runtime-extra.md

# Ergänzende AP04-Entscheidungen und Dispositionen

## Historie erhalten, Branchintegration und Abnahme trennen

**Anlass und Entscheidung:** Der Auftraggeber verlangte laut Konsolidierungsbericht vom 12.09.2026 alle Branchupdates in main und löschbare Nebenbranches auch bei offener Live-Abnahme. Sachlich widersprüchliche Versionen bleiben in der Historie erhalten; im aktiven Baum wird der geprüfte neuere Stand mit einzeln bewerteten Änderungen integriert. Eine reine Sicherung eines WIP-Branches ist keine Integrationsfreigabe. Neue Fixbranches sind daraus nicht als Dauerprozess vorgeschrieben.

**Alternativen und Begründung:** Der Bericht vom 11.09. hielt 190 widersprüchliche Branches zunächst zurück. Der spätere Beschluss ersetzt diese Zwischenempfehlung durch inhaltliche Integration und Erhaltung aller eingefrorenen Tips als Commiteltern. Damit bleiben Originale erreichbar, ohne überholte Implementierungen parallel betreiben zu müssen. Das blinde Ersetzen von main durch einen alten Branch hätte neuere Här­tungen verloren und wurde ausdrücklich vermieden.

**Gültigkeit:** Die Nutzerentscheidung ist im Originalbericht ausdrücklich belegt (12.09.2026). Die Mengen 262 Branches/261 Nicht-main-Tips, 111 Integrationspfade, 278 wiederhergestellte Dokumente und 897 archivierte Dokumentblobs bezeichnen den damaligen eingefrorenen Bestand, keine aktuelle GitHub-Zählung. Der Bericht bestätigt zu seinem Zeitpunkt null entfernte Remote-Branches. AP04 führt keine Branchlöschung aus und bestätigt keine spätere Löschung.

**Umsetzung und Folgen:** Der dokumentierte Konsolidierungsansatz erhält historische Eltern und ausgewählte aktuelle Inhalte. Löschung verlangt weiterhin frisch abgefragte Ref-SHAs und Erreichbarkeit über publiziertes main. Das vorhandene `scripts/cleanup-consolidated-branches.py` prüft diese Voraussetzungen und arbeitet mit erwarteten SHA-Leases; lokale schmutzige Worktrees werden nicht dadurch freigegeben. Integration schließt keine Finding-, Native- oder Live-Abnahme. Endgültige offene Arbeit gehört in das aktuelle Issue-Register, nicht in alte Branchaufbewahrungslisten.

**Prüfumfang:** Originalberichte 11./12.09., retained-branches und beide Paketcheckpoint-Dateien vollständig gelesen; JSON-Archive strukturell auf Bedeutung, Schlüssel und Provenienzmengen geprüft, nicht jede historische Dreifachdifferenz neu fachlich auditiert. Keine neue Remote-Ancestry-/Löschprüfung.

**Quellen:** `docs/review/branch-cleanup-20260911/README.md`, `audit.json.gz`; `docs/review/branch-cleanup-20260912/README.md`, `branches.json`, `retained-branches.md`, `path-decisions.json.gz`, `restored-documents.json`, `summary.json`; `docs/review/remediation/resume/package-checkpoints.json`, `run3-package-checkpoints.json` (alle AP03-Pin ad67f9bb).

## Partielle lokale Snapshots sind keine Remote-Löschanweisung

**Anlass:** Die Wiederaufnahme vom 14.09. fand einen lokalen Snapshot mit 2.391 statt 5.171 Remote-Dateien, eigener lokaler Commitgeschichte und vier abweichenden unveränderten Dokumenten. Fehlende Dateien waren kein Beleg für gewollte Löschungen.

**Regel:** Auf dem aktuellen bekannten Remote-Tree ausschließlich geprüfte Änderungen anwenden. Den resultierenden Tree gegen die unveränderten Remotedateien plus benannten Delta-Pfade verifizieren. Lokale Snapshot-Commit-IDs nicht als Remote-Historie behandeln, fremde vorhandene Änderungen nicht durch einen vollständigen lokalen Baum überschreiben.

**Status, Alternativen, Folgen:** Dokumentierte technische Vorgehensweise, keine im Bericht gesondert belegte allgemeine Architekturfreigabe. Das vollständige Überschreiben des Remotetrees ist als unsicher ausgeschlossen; die damalige Prüfung verglich 5.191 resultierende Dateien. Neue Wiederaufnahmen müssen die dann aktuellen Trees prüfen. Der konkrete Branch/PR aus dem alten Bericht ist historische Auftragsbindung, keine AP04-Anweisung, dorthin umzuschalten.

**Quelle/Prüfung:** `docs/review/remediation/implementation/resume-20260914-gitops-handoff.md` vollständig gelesen; AP03-Pin ad67f9bb. Kein erneutes Ausführen damaliger GitOps-Tests oder Treevergleiche.

## Asynchrone Lintausführung: zusammengeführte Schnittstellen vollständig übernehmen

Die zwei Integrationslogs liefern **keine eigenständige akzeptierte Produktentscheidung**. Sie erhalten ein konkretes Integrationsrisiko: Git-basierte Type-Evidence-Partitionierung muss den asynchronen begrenzten Executor korrekt abwarten; aufrufende Tests und Adapter müssen ebenfalls asynchron konsumieren. `lint-integration.log` scheitert bei der Git-Dateiermittlung. Auch die Datei mit Namen `lint-integration-fixed.log` ist kein bestandener Endnachweis: Sie erreicht anschließend einen Assertionfehler, weil ein Promise mit einem fertigen Ergebnis verglichen wird. Aktuelle `evidence-file-partition.ts` und der Leerziel-Test verwenden `await`; das ist Quellinspektion, kein erneut bestandener Gesamt-Lintlauf. Dauerhafter Bezug: begrenzte asynchrone Plugin-Ausführung und Abbruch-/Fehlererhalt (ADR008 bzw Pluginvertrag). Historische Lognamen dürfen keine Abnahme ersetzen.

**Quellen:** `docs/review/branch-cleanup-20260912/validation/lint-integration.log`, `lint-integration-fixed.log` vollständig gelesen; Sourcechecks `skills/nova/plugins/lint/src/engine/evidence-file-partition.ts`, `skills/nova/plugins/lint/tests/eslint-type-evidence.test.mjs`. Entscheidungsmapping darf diese zwei Quellen als gruppierte Integrationsprovenienz behandeln.

## Fallback-Ledger: keine materielle Entscheidung und kein Abschlussbeweis

`docs/decisions/fallback-cleanup-ledger.tsv` enthält nur eine Kopfzeile, null Einträge. Daraus folgt weder vollständige Altpfadbereinigung noch ein noch aktiver Fallback. Die gültige V2-only-/Ein-Autorität-Regel bleibt über ADR004 und ihre tatsächlichen Quellen begründet. Das leere administrative Schema hat keine eigene dauerhafte Entscheidung zu extrahieren. Die spätere Löschung des Platzhalters verlangt nur den üblichen Verbrauchercheck; das Erfinden oder Kopieren einer leeren neuen Fallbackliste würde keine zusätzliche Beweiskraft schaffen.

**Prüfung:** Ganze Datei gelesen (eine Zeile); weder Laufzeitprüfung noch vollständige Suche nach Implementierungsfallbacks behauptet.


## Saved working review: status-generator-review.md

# AP04 status generator independent review

Reviewed scripts/docs-status.mjs, scripts/tests/docs-status.test.mjs, package commands, docs-checks workflow and complete JSON schema/key inventory while issue prose was still being translated. No repository files edited. No runtime or hosted CI execution.

Concrete findings sent to root:

1. Closed status bypass: assigning `lokal verifiziert` and adding its semantics passes validation. Use explicit supported incomplete statuses, not a small blacklist.
2. Original denominator can become 999 with locally verified 986 and pass; the immutable 154 identity universe needs protection. Replacing IFR-29-001 with INVENTED-REPLACEMENT also passes. Enforce original membership against immutable original identity provenance; preserve genuine later closure transitions rather than freezing 13 forever.
3. Actual JSON fields lost in rendered view: `evidence.source_run_commit` (GITHUB-7), `evidence.original_scope` (additional GitOps issue), `scope.counting_policy`. Include all meaning-bearing fields in view and output-preservation regression.
4. Missing `updated_at` / `source_baseline` passes and renders undefined. Validate required metadata, fixed source commit shape and date.
5. Workflow event paths exclude `scripts/tests/docs-status.test.mjs`; test-only changes would not trigger workflow. Add path to both push and PR filters.
6. Mutable issue/run refs claim explicit date but validator only requires nonempty scope; consider explicit read_date for issues. Current issue scope contains date but typo `on2026`.

Working positives: unique IDs, nonempty actionable lists, dependency resolution, source branch rejection, own-generated-view drift check and source-prose projection are present. Markdown problem/current_state/work/reproduction/completion text is preserved verbatim. Origins are explicitly separated 13 original + GH7 + AP03 GitOps; live acceptance is linked separately and implementation status semantics are not conflated with local closure in current data.

Not a schema-signoff until identified guard gaps are resolved and final outputs rechecked.

