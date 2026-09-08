# prism.evaluation — statische Qualitätsheuristiken

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Verantwortung, Schnittstellen, Zustand

Vollständig `skills/prism/evaluation/index.ts:1–236`, quality.test.mts und Control-Approval-/Baselinepfad gelesen. evaluate wird direkt vor Approval/Publishing sowie in Engineevaluate verwendet; keine eigene Registrierung oder Persistenz. PrismDocument rein gelesen, Ausgabe status ready/needs-attention/blocked und Findings mit SHA256-basiertem16hex-ID, gate/level/message/target. Objektive blocking-Findings verhindern Approval; review-Findings müssen im Control als exakt sortierte IDliste akzeptiert werden. Keine externen Accessibilitytools in dieser Funktion.

## 4–6. Korrektheit, Fehler, Wiederholung

Prüft Viewexistenz, Node-ID-Duplikate innerhalb View, Überschriften/-hierarchie, ausgewählte interaktive Labels und Actionnamen in irgendeinem Flow, Assetalt, Patchtargets, drei Responsivekeys, Flowstart/-success/-transitionendpoints und auth-namensabhängige Recovery. Fehlende Transitions/Flows sind review. Schema wird hier nicht erneut validiert: reguläre Engine/Controlrepositorywege tragen contract-Verantwortung. Componentexpansion, effektive State-/Viewportprops, Trigger-node/Erreichbarkeit/Recoveryendpoints werden nicht vollständig analysiert. Keine positive Flowsimulation oder visueller Qualitätsnachweis aus status ready. Synchrone Rekursion ohne Abbruch/Depthbudget, Contractgrenze relevant. Stabile Findings bei gleichem Input, kein Retry-/Journal-/Neustartzustand; Control bindet Approval an Revision und Warningliste.

## 7–9. Vertrauen, Ressourcen, Architektur

Untrusted Designdaten werden nur gelesen, keine Ausführung. Evidence ist statischer Codebefund, nicht Browsermessung; Enginecapture ergänzt eigene Heuristik. Die gleiche Renderingkomponente kann bei expandierten Templates anders aussehen als die hier geprüfte Root. Userakzeptanz von Reviewwarnings ist explizite Policy, kein objektives Bestehen. Findings können bei gleicher message/target dieselbe ID haben; keine nachgewiesene falsche Approvalannahme daraus. Aufwand proportional zu Baum plus wiederholten Flowscans; kein Speicher/Retention/Quota außerhalb temporärer Arrays. Dauerhafte Verbesserung: auf denselben aufgelösten View/State/Viewportgraph wie Renderer prüfen, Flowreachability separat als klare Gateanforderung definieren.

## 10–12. Tests, Dokumentation, Unsicherheiten

Qualitydatei enthält zwei Originalevaluate-Fälle (Fixture needs-attention/empty views blocked sowie meaningful icon ohne alt blocked), weitere drei sind Preferences. Enginefixture prüft zusätzlich Reportstatus. Ausführung in [prism-reviewed-modules-tests.txt](../evidence/prism-reviewed-modules-tests.txt); keine reale Screenreader-/Browser-/Flow-E2Eprüfung. Implementationplan Phase7 nennt umfassendere objektive Qualitätsgates; vorhandene Funktion ist engere Heuristik, daher Dokumentationsstatus vorhanden und unvollständig. `docs/architecture/prism-quality-gates-v1.md:26,38–39` fordert Componentzyklenprüfung und erreichbare Success-/Recoverypfade ausdrücklich; die Anforderung ist damit bekannt. **Offene Verifikation / begründeter Verdacht:** Konkrete schema-valide Gegenbeispiele für nicht erreichbare Flows bzw. unzureichend geprüfte Component-/Patchzustände fehlen noch; die Codeprüfung sieht keine vollständige Reachabilityanalyse. Ein Report ready ist deshalb kein geprüfter Nachweis dieser Architekturforderung. Nächste Verifikation: schema-valide unreachable-flow-/Component-label-Fixtures mit Originalevaluate und Browsercapture, danach Gatevertrag konkretisieren. Fehlende Coverage ist ausdrücklich kein bestandenes Accessibilityreview.
