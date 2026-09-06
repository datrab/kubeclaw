# INF-13 — Qdrant

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Aufrufer
Optionale Pipeline-Abhängigkeit. `my-values/infra/qdrant-values.yaml`: eine Replik, PVC 15Gi, Request 100m/256Mi, Limit 500m/1Gi. `scripts/deploy.sh:1126–1135` installiert ungepinntes qdrant/qdrant-Chart. Agent-Konfiguration/Healthchecks verweisen auf Qdrant; `deployment.yaml:841–843` prüft /readyz, NetworkPolicy ordnet 6333/6334 zu.

Verantwortung: Vektorspeicher für konfigurierte Agentennutzung. Kein Nachweis, dass jedes Pipeline-Stadium ihn tatsächlich benötigt. Das optionale Deaktivieren im Script schaltet auch das entsprechende Agent-Dependency-Probe ab; es provisioniert keine externe Datenquelle.

## Review und Befund IFR-13-001
**Mittel; offene Sicherheits-/Wiederherstellungsfrage.** Lokale Values konfigurieren weder API-Key/TLS noch Snapshots/Backup/Retention. Ob das aktuell aufgelöste Chart darüber hinaus Defaults setzt, ist wegen fehlendem Pin offen. Auslöser: kompromittierter zulässiger Agent oder Verlust des Single-PVC. Wirkung: möglicherweise breite Collection-Rechte bzw. Verlust gespeicherter Vektordaten, Wiederaufbaukosten unbekannt.

Ursachenbehebung: Chart/Image pinnen, tatsächliche Consumer/Collections und Auth-Vertrag erfassen, zwischen reproduzierbaren Indizes und originären Daten unterscheiden; daraus Snapshot-/Rebuildverfahren ableiten. Echter Test: tatsächlicher Client mit erforderlicher Auth, Ablehnung eines unzulässigen Clients, Snapshot-Restore bzw. kompletter Rebuild und Vergleich der Suchresultate.

## Betrieb und Dokumentation
NetworkPolicy begrenzt Podzugriff, schützt keine Werte in übertragenen Daten vor einem berechtigten Agenten. Eine Replik/RWO bedeutet keinen Node-Failoverbeleg. PVC-Wachstum/Index-RAM müssen gemeinsam geplant werden. Keine konkrete Qdrant-Version oder freie Kapazität behauptet. Keine Live-Daten gelesen oder Qdrant gestartet. Vorhandene Infrastruktur-/Deploymentseiten nennen keine vollständige Collection-, Upgrade-, Rollback- oder Restoreanleitung; Dokumentationsstatus unvollständig. Versions- und zentraler Backup-Befund sind verlinkt statt dupliziert.
