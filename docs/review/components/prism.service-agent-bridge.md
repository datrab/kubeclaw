# prism.service-agent-bridge — OpenClaw-Auftragsbrücke

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Verantwortung, Aufrufpfade, Zustand

Vollständig `skills/prism/server/agent-bridge.mjs:1–112`, Control-Dispatch/Design-set/Revise und OpenClawextension gelesen. Prozess bindet127.0.0.1:18080; ControlURL standardmäßig lokaler28080-Proxy. /v1/dispatch reicht zunächst an Control mit idempotency-key, erst202 startet Agent; /v1/design-set und /v1/revise akzeptieren Projekt/Instruktion und starten unmittelbar. spawn openclaw agent --agent main --session-key ... --message ... --json --timeout900 ohne Shell. Prompts verlangen vorhandenes Prism-Schema und abschließende Tools; Extensiontools persistieren im Control. running-Map serialisiert innerhalb eines Prozesses pro abgeleiteter Session. HTTP202 ist Annahme, nicht fertiger Designcommit.

## 4–6. Fehler, Parallelität, Neustart

Agentexitfehler werden nach202 nur geloggt; aufrufender Control/Nova bekommt keine persistierte Failuredisposition. Queue lebt ausschließlich als Promisechain (001). Separate Projekte laufen unbegrenzt parallel; gleicher Key ohne Inhaltsvergleich mehrfach in Queue, Idempotencyheader schützt nur vorgelagerten Dispatchrequest, nicht Agentenjob. Kein eigener harter Timer, --timeout900 ist Kindprogrammkonvention. Kein SIGTERMchildkill/reaping, spawnerror wird gefangen; stdout/stderr werden unbeschränkt als Strings akkumuliert und je Chunk konvertiert (UTF8split kann korruptieren), exit statt close kann letzte Pipebytes verpassen. Stdout dient hier nicht fachlichem Resultparser, daher kein behaupteter JSONresultverlust; erfolgreiche Toolwrites liegen unabhängig im Control.

## 7–9. Vertrauen, Ressourcen, Architektur

Keine eigene Auth am Loopbackserver; Sidecar-/Netzwerknamespaceisolation ist zwingende Annahme. Clientprompt ist Daten-/Instruktionsquelle für Agent, keine Shellsubstitution; projektspezifische Werkzeugautorität wird downstream im Control geprüft. Sessionkey ersetzt alle Sonderzeichen durch '-' und kürzt96Zeichen: verschiedene externe ProjektIDs können denselben Agentkontext teilen (002). Keine Gesamtlängenquote jenseits2MBbody/CLI-Argumentgrenze, kein Queuecap/Resultretention/Persistenz. Bibliotheks-/Extensionauth nicht mit Annahme202 verwechseln. Dauerhafte Brücke braucht dauerhaften Auftrag/Receipt statt Fire-and-forget und eine injektive Projektidentität.

## 10–11. Tests und Dokumentation

Kein eigener direkter Bridgeunittest vorhanden. Extensiontest1/1 bestanden, prüft nur Toolregistrierung. Deploymentcommandcontract/Sourcetrace zeigen Auslieferung, keine Original-OpenClawausführung; kostenpflichtige Agentaufrufe nicht ausgelöst. Workflows/ExtensionREADME beschreiben einzelnen logischen Agent und denselben Projektsessionkontext; Restart-/Failurezustände fehlen, also Dokumentationsstatus vorhanden und unvollständig. Echte Regressionen erfordern Originalopenclaw mit kontrolliertem lokalem Agentlauf, keine Ersatzbinary zum Grüntesten.

## 12. Befunde

### PCR-PRISM-AGENT-BRIDGE-001 — Angenommene Aufträge sind nach Neustart verloren

**Hoch; Evidenzklasse: nachgewiesener Defekt durch Code-Trace.** agent-bridge.mjs:37–44 speichert nur Promises, :75–76/:91–92/:104–105 quittiert202 vor Agentabschluss. Prozessneustart nach202 vor toolcommit verliert queued Tasks; Controlpersistenz speichert Designrequest, aber keine erneut abzuarbeitende Agentjobphase. Laufender Kindprozess kann ungewiss noch Werkzeugwrites ausführen. Folge: wartender Pipeline-/Studiovorgang ohne terminales Ergebnis oder Recovery; Retry kann Doppelagenten erzeugen. Ursache: EmpfangsACK ohne dauerhaften Job-/Receiptzustand. Behebung: persistierter Job mit requestdigest/idempotency/claim, explizite accepted/running/terminal-Reconciliation und Abbruch-/Unknownpolicy. Regression: Originalbridge/Agent+Control, echte Abbrüche nach202, vor spawn und nach Toolcommit; Neustart verarbeitet genau notwendige Jobs weiter und liefert durable Outcome ohne doppelte Revision.

### PCR-PRISM-AGENT-BRIDGE-002 — Sanitizing und Kürzung kollidieren Projektsessions

**Mittel; Evidenzklasse: nachgewiesener Defekt durch Code-Trace.** :66/:83/:97 bilden sessionKey über replace und slice96. Unterschiedliche erlaubte lange Projektkeys mit identischen ersten96Zeichen erhalten denselben OpenClawkontext; die separate Queue serialisiert sie, trennt aber Historie nicht. Folge: fremder Projektkontext beeinflusst nachfolgenden Agentenauftrag; Controlprojektprüfungen begrenzen einzelne Writes, lösen den Kontextmix nicht. Behebung: stabiler Digest des vollständigen externen ProjektIDs mit lesbarem Präfix, Scope/Namensraum explizit. Regression: zwei Original-Designrequests mit langer gemeinsamer Präfix-ID und verschiedene Sonderzeichen, getrennte Sessions/History und jeweils richtige Controlprojektbindung.
