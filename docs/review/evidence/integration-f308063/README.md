# Kombinierter Commitcheck f308063

Der saubere unveränderliche Commit f3080637b03c84dc82069385292e2b05615ddfc2 vereint konfigurierte Demo-Laufzeit, Registry-Health und Ingestion-Ressourcen. Alle neun ausgewählten Kommandos bestanden: originale Go-Race-Suite, Ready-Helm2, Ingestion-Helm3 und Dienst2, Registry-Health3, Produktionskonfiguration, Originalworkspace61 und Nova-/Buster-Typechecks.

[Manifest](manifest.json) enthält genaue Kommandos, Toolversionen, Testzahlen und neun Rohausgaben. Alle Workspace-Abhängigkeiten bleiben innerhalb des getrennten Checkouts. Keine parallele Nova-Handoff-Implementierung, kein nativer Modell-, BuildKit-, CRI- oder Deploymentnachweis. Unveränderter Trivy-Code wurde hier nicht erneut geprüft; frühere native Trivy-Nachweise bleiben separat.
