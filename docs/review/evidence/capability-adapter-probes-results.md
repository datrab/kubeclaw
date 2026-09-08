# Capabilityadapter-Proben

Baseline 85ddfcbfc15e078780ea0434fc167e6f9a9b9488; Node v24.19.0.
Befehl: `node docs/review/evidence/capability-adapter-probes.mjs`.
Letzter Lauf bestanden (Exit 0):

- HTTP 128-Byte-Responsebudget, tatsächlich 512 Byte vor Ablehnung vollständig gesendet.
- Bodytimeout: nativer TimeoutError statt NETWORK_TIMEOUT.
- Echter Gitblob mit 1024 Byte / Outputlimit 128 meldet missing.
- Bereits abgebrochenes sync_paths meldet missing statt ADAPTER_CANCELLED.
- Echte Shell startet sleep-Kind mit geerbten Pipes und endet; 200-ms-Deadline +25-ms-Grace,
  aber Ergebnis erst nach 1241 ms (selbst endendes Kind), COMMAND_TIMEOUT.

Kein produktiver Endpoint, keine echten OpenClaw-Agenten. Lokaler HTTP-Peer ist
kontrollierte Protokollfixture; Git/Prozesse sind echt und temporär.
Erste Command-Probenversion benutzte Node als Führer und verfehlte unter Last
vor dem 200-ms-Timeout das beabsichtigte Führer-exit-Fenster; Assertion fehlgeschlagen.
Die endgültige Probe nutzt schnellen echten /bin/sh-Führer, keine Ersatzimplementierung.
Originalpakettests: alle sieben Node-Testketten bestanden. Network lief zunächst
unter paralleler Last in die enge 100-ms-Frist, isolierte unveränderte Wiederholung
bestand. Kein Gesamtlauf via npm behauptet (Umgebung unterbrach Workspace-Sammellauf).
