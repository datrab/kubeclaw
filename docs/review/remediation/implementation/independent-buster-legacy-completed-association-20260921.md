# Frische Prüfung der Completed-Receipt-Zuordnung

Der begrenzte lokale Consumer-Nachweis ist akzeptiert. Der Reviewer hat die drei neuen Tests und deren Autorennachweis nicht implementiert. Seine parallel verfasste neue Gastfall-Erweiterung ist hier ausdrücklich nicht Gegenstand einer Selbstabnahme.

Die drei neuen Tests rufen den echten `complete`-Zweig für bereits abgeschlossene Transaktionen auf. `same_seal` wird in den positiven Tests nicht ersetzt. Modelliert sind ausschließlich Verifier-Beobachtungen, Receipt-Publikation und Service-Restoration; die Fixtures sind keine echten Kernelbeobachtungen oder gültigen Stop-Receipts. Ein geänderter Store-Inode bei gleichen Bytes/Digest muss exakt `PLAN_SEAL_CHANGED` ergeben und bereits die Runtime-Prüfung verhindern. Ein verändertes Runtime-Inventar muss exakt `RUNTIME_SEAL_CHANGED` ergeben. Beide negativen Fälle verbieten Publikation und Restoration. Die Positivkontrolle verändert nur namespacebezogene Geräte-/Mountkennungen, einschließlich der verschachtelten Store-Gerätekennung, und prüft den ursprünglichen Receipt sowie Publikation vor Restoration.

Eigener unprivilegierter vollständiger Lauf: **17/17**, Exit 0. Beide isolierten Entscheidungsmutanten wurden erneut ausgeführt: jeweils genau der zuständige negative Test scheitert mit `ValueError not raised`, die übrigen zwei bestehen. Keine Quellenmutation, Importfehler oder Timeouts werden als Detektion gezählt. Alle fünf gebundenen Autorenhashes stimmen nach den Läufen weiter überein.

Es liegt kein gespeicherter Vorzustand der ursprünglichen 14 Testkörper für diese Erweiterung vor; deshalb wird keine nachträgliche Byte-/AST-Identitätsprüfung behauptet. Aktuell sind alle 17 gepflegten Tests ausgeführt. Die Einschränkung ist im Autorenbericht korrekt genannt.

[Eigene Rohbelege und Identitäten](../../evidence/buster-legacy-completed-association-independent-20260921/result.json), [vollständiger Testlauf](../../evidence/buster-legacy-completed-association-independent-20260921/tests.txt), [Planmutant](../../evidence/buster-legacy-completed-association-independent-20260921/mutant-plan.txt), [Runtimemutant](../../evidence/buster-legacy-completed-association-independent-20260921/mutant-runtime.txt).

Der echte spätere LIS7-Gastfall mit Original-/Ersatzdatei und tatsächlichen Verifier-Beobachtungen bleibt erforderlich. Produktions-Stop, Restart-Fence, Importer und vollständige Buster-Abnahme sind damit nicht geschlossen. Dokumentation und Tests enthalten keine solche Behauptung.
