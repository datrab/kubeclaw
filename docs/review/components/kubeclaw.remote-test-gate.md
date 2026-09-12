# kubeclaw.remote-test-gate

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und Verwendung

Adapter `test.plan.execute`, `src/adapter.ts:63–109`, vom buster-quality-gate aufgerufen. Übersetzt eine autorisierte Capability in den produktiven Nova→Buster-Remote-Gatepfad. Alle Source, Manifest, Configschema, README und Pakettest gelesen; Transport/Import bleiben bei [nova.test-gates](nova.test-gates.md).

## 2. Verträge und Gegenstellen

Capability, Operation run und Ressourcentyp test.resolved-plan werden geprüft. Payloadplan durch gemeinsamen Contract validiert, plan.runId gegen Attempt geprüft, Grantkeys müssen exakt den Planknoten entsprechen. Repository wird realpath-kontrolliert gegen konfigurierte erlaubte Wurzeln. Revision/Repository-ID, Stage-ID, Idempotenzschlüssel, Timeout und Signal gehen an createProductionNovaTestGate; nur dessen native Entscheidung wird an die Stage zurückgegeben. Sourceattestierungsschlüssel und optional Bearer-Token kommen aus confidential secrets.read.

## 3. Zustand und Nebenwirkungen

Jeder Aufruf konstruiert produktive Gate-Stores unter stateRoot; lokale Archive/Importe und externer Busterjob entstehen im delegierten Pfad. Adapter selbst hält nur Konfiguration und stopping. Gleicher stateRoot setzt funktionierende Journal-/Dateisperren voraus; Befunde bei nova.state und nova.test-gates beachten.

## 4. Korrektheit

Planownership und Wurzelprüfung verhindern einfaches Vertauschen von Runs/Repos. IPv6-Loopback scheitert bereits in parseConfig: URL.hostname liefert [::1], Whitelist enthält ::1. Dies ist derselbe Ursachenbefund [PCR-NOVA-GATE-003](nova.test-gates.md), hier zusätzlicher betroffener Produktionsentrypoint. Keine zweite Befund-ID.

## 5. Zeitlimits, Abbruch und Parallelität

Initialer Abort und Leasefence werden geprüft; Signal wird vollständig weitergegeben. Eigene Timeoutsteuerung fehlt bewusst. PCR-NOVA-GATE-001/002 betreffen verlorene Submitantwort und hängenden Import auch über diesen Adapter. Maximal 64 Provider parallel, Zeitlimit höchstens zwei Stunden. shutdown blockiert neue Aufrufe, besitzt aber keine eigene Liste laufender Jobs; deren Ende hängt von Core-Abbruch und Gate ab.

## 6. Neustart und Teilaktionen

Neuer Adapter rekonstruiert Gate aus denselben Storepfaden. Effektjournal/Importjournal müssen externen Submit und Replay versöhnen; kein eigener Versuch, einen unklaren Job blind erneut auszuführen. Abgestürzte Nova/Buster-Kette hier nicht erfolgreich als Gesamtlauf getestet. Persistenzbefunde werden nicht durch frische Gateinstanz behoben.

## 7. Authentifizierung und Vertrauen

Secrets werden nicht in normaler Stagepayload transportiert. Bearer bzw. SPIFFE-Proxykonfiguration an produktiven Client; Proxy/TLS/Dateirechte sind Infrastrukturannahmen, kein Infrastrukturreview. Rootallowlist realpath-basiert; Symlinkziel muss innerhalb liegen. Plan-/Grantprüfung ersetzt nicht Registryautorisierung. Freie Payloadgrants werden durch nachgelagerte signierte Plan-/Providerprüfungen beschränkt.

## 8. Ressourcen und Aufbewahrung

Konstanten: 64 MiB Antwort/Resultat/Archiv/Evidence, 1 GiB jeweiliger Gesamtstore, 10.000 Records, 64 MiB Record. Nicht konfigurierbar je Adapter. [PCR-NOVA-GATE-004](nova.test-gates.md) widerlegt die korrekte Durchsetzung eines Teilbudgets. Kein adaptereigenes GC; Retention/Quoten in Stores und Betrieb zu dokumentieren.

## 9. Architektur und Vereinfachung

Sinnvolle dünne Capabilitygrenze. Loopbackprüfung an mehreren Stellen driftet bereits: gemeinsam kanonische Hostprüfung verwenden. Gatebudgetkonfiguration sollte einen geprüften strukturierten Vertrag statt duplizierter Zahlen haben. Shutdownzuständigkeit ausdrücklich Core/Gate zuordnen und integrieren.

## 10. Tests und Aussagekraft

`npm test` bestanden; gespeichertes Ergebnis: `../evidence/nova-batch-remote-test-gate-tests.txt`. Pakettest prüft lediglich typeof activate, kein laufender Gate! Zusätzliche Originalprobe `../evidence/nova-batch-remote-ipv6-probe.mjs` validiert Schema und reproduziert Aktivierungsfehler ohne Netzwerk. Ausgeführte Transport-/Storebelege in Review24 sind getrennte gemeinsame Tests; keine eigene Provider-E2E-Bestätigung.

## 11. Dokumentationsabgleich

README erklärt Capability/Remotegrenze, aber Importdeadline, konkrete Budgetdurchsetzung, Restart und shutdown laufender Aufträge bleiben unvollständig. Testname live-function bedeutet hier nur Importierbarkeit. IPv6-Konfiguration wird vom Schema zugelassen, zur Laufzeit abgewiesen.

## 12. Befunde und offene Nachweise

Zentrale Befunde PCR-NOVA-GATE-001 bis004 verlinkt; zusätzlicher Codebeleg für003: adapter.ts49–53 und Originalprobe. Regression: IPv4/IPv6/localhost akzeptieren, externe Hosts abweisen, anschließend echte Proxyverbindung prüfen. Offene Gesamtnachweise: produktive SPIFFE-Verbindung, aktiver Job bei shutdown/Neustart und kombinierte Quoten. Review abgeschlossen bedeutet untersuchter Codepfad, keine Bestätigung dieser Integrationen.
