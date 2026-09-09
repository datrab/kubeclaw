# Kombinierte Prüfung von Registry und Demo-Ready

Im sauberen unveränderlichen e03f7dcd88f5a12536c107ae91bbd36c98d436be bestanden die originale Go-Race-Suite, zwei Ready-Helmtests, fünf Registry-Konfigurationstests, ein nativer Trivy-Test mit echten Datenbanken und HTTPS-OCI sowie der Container-Sourcecheck. Der Deploymenttest scheiterte an seiner unkonfigurierten Buster-Registry-Testeingabe.

Der gezielte Testfix 449f7af wurde danach im getrennten sauberen Checkout geprüft: ausschließlich der zuvor fehlgeschlagene Deploymenttest wurde mit echtem Helm erneut ausgeführt und bestand. [Manifest](manifest.json) nennt genaue Kommandos, Umgebungen, Commitgrenzen und alle Rohausgaben. Der ursprüngliche Fehlschlag bleibt unverändert erhalten; er wird nicht in einen Erfolg umgeschrieben. Kein Cluster-, CRI-, echter App- oder Discord-Nachweis.
