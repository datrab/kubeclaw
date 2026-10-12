# Unabhängiger Review der Platform-Feldinventur

Die begrenzte Root-Dokumentation ist gegen die aktuellen Quellen akzeptiert. Keine Produktionsänderung, Runtimeprüfung oder vollständige F1-Abnahme wird damit behauptet.

Die Tabelle deckt exakt alle 15 Top-Level-Schemaproperties in 16 Zeilen ab: `externalTrust` wird sinnvoll in zwei Blätter aufgeteilt, `isolation` durch sein einziges Blatt beschrieben. Required/optional, numerische Einheiten und die fehlende aktuelle Obergrenze von `shutdownTimeoutMs` entsprechen dem Schema. Der tatsächliche `effectLockTtlMs`-Fallback ist 300.000 ms in Nova `engine-runtime.ts`.

Der Loader validiert das vollständige separate Platformdokument, bindet den realen Konfigurationsdateipfad, löst Installations-/Trust-/Storage-/Isolationpfade relativ zu dessen Elternverzeichnis auf und friert rekursiv ein. Die drei beschriebenen Nova-CLI-Ladepfade verwenden `--platform`; Buster wählt die Datei über sein separat geladenes `platformConfig` und verwendet daraus Installation/Trust zur Registryerzeugung. Die Dokumentation behauptet zutreffend nicht, dass Buster alle Nova-Einstellungen konsumiert.

Aktivierung, Grants/Provider, Observer-/Adapterkonfiguration, Resource-Lock-Root, Retained-Wait-Owner und administrative Issuerprüfung stimmen mit den genannten Consumern überein. Die historische Suchliste enthält tatsächlich keine Quelle `foundation/config/platform.ts`; ihr Suchumfang ist deshalb kein Vollständigkeitsbeweis. Verschachtelte Pluginsettings, zentrale Migration, Alt-Autor-Ablehnung und Verhaltensprofile bleiben ausdrücklich offen. Auch der neue Link in der Hauptinventur macht keinen F1-Abschluss daraus.

[Eigene Schemaabdeckung, Linkprüfung und Quellenidentitäten](../../evidence/config-platform-inventory-independent-20260921/result.json). Kein Runtimejob wurde während des Wait-Finalfensters gestartet.
