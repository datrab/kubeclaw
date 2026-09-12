# INF-29 — Betreiberkonfiguration, Altbestände und Veröffentlichungsvorbereitung

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar, Altbestände und Veröffentlichungsgrenze
`my-values` ist bewusst versionierte Betreiberkonfiguration; Beispiele, `scripts/setup.sh`, generierte Referenzdoku, `.gitignore`/`.dockerignore` und Rollen-/Infrastruktur-Aufrufer untersucht. Die Review-Dateien übernehmen keine realen Secretwerte, private Schlüssel oder personenbezogenen Betreiberwerte. Gefundene betreiberspezifische Identitäts-/Routingfelder werden nur über Pfade bezeichnet.

Belegte Kandidaten: `my-values/infra/litellm-values.yaml` wird vom aktiven Plain-Manifest-Installer nicht benutzt; `k3s-registries.yaml` ist ausdrücklich Legacy mit Platzhalter; `scripts/setup.sh` ist broad git-add/commit/push hinter explizitem Legacy-Opt-in. Ein fehlender lokaler Aufruf ist **kein** Beweis externer Nichtnutzung. Alte General-/Forge-/Echo-Referenzen in Chart-/Betriebsdoku müssen gegen aktuelle geteilte Nova-Rolle abgeglichen werden; keine Löschung in diesem Auftrag.

## Befund IFR-29-001
**Mittel; nachgewiesene Dokumentations-/Betreibertrennungslücke.** Auslöser: spätere Veröffentlichung des jetzigen Repositoryzustands oder direkte Übernahme der Betreiber-Values durch Dritte. `my-values/nova-values.yaml`, weitere Rollen-Values und Infrastruktur-/Ops-Dateien enthalten betreiberspezifische Identitäts-/Routing-/Namespaceannahmen. Dockerignore schließt sie aus Images aus, aber nicht aus Git-Veröffentlichung. Es wurde kein Secretleak behauptet; die Verträge sind trotzdem nicht generische öffentliche Beispiele.

Ursachenbehebung: private Konfiguration von dokumentierten anonymisierten Beispielen mit vollständiger Parameter-/Secret-Schnittstelle trennen, Git-Historie separat auf sensible Altbestände prüfen, ohne funktionale Änderungen im Review. Echter Test: frischer Clone der später vorgesehenen öffentlichen Oberfläche, Beispiel-Render mit fiktiven IDs/Secrets und Geheimnisprüfung von Git-/Buildkontext-/Artefaktinhalt. Keine Veröffentlichung oder History-Rewrite ausgeführt.

## Vereinfachung, Prüfstand und Folgeauftrag
Redundante Dokumentationsquellen als Abdeckungsmatrix konsolidieren, nicht zusätzliche Konfigurationsadapter erfinden. Offene Produktdoku: Installationsvoraussetzungen, Normalbetrieb/Updates, konkrete Errors, Datenrestore, Kapazität, Trust-Grenzen und Rechte je Zugangsweg. Release-, Konfigurations- und Live-Status strikt getrennt.

Review-Doku wird ausschließlich unter docs/review/infrastructure und per ergänzendem Einstieg gespeichert. Pipeline-Dateien bleiben Eigentum der anderen Session. Kein globaler „Repository ist frei von Secrets“-Befund; Suchgrenzen sind aktueller Checkout und relevante Konfiguration/Buildkontexte, keine vollständige Git-Historienforensik. Durchgängige Pfade und Prüfprotokoll vervollständigen das Inventar.
