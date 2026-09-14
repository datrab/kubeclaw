# prism.renderer — deklaratives HTML

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Verantwortung, Vertrag und Zustand

Vollständig `skills/prism/renderer/index.ts:1–304`, renderer.test.mts, Enginecapture und Studio preview.ts gelesen. Gemeinsamer Renderer für Engine-Baseline und Studioiframe; package.json hat Rendererexport. 36 Katalogarten werden auf feste HTMLformen abgebildet; keine beliebigen HTML-/JS-Props. Inputs PrismNode, aufgelöste Assets, mockData/Components/Theme; Output HTMLstring. Datarefs werden rekursiv aufgelöst, Tokenpfade in Theme gelesen, Componenttemplates geklont und gepatcht. Externe Bildbytes/Assetautorität stellt Caller bereit (Engine data:-Prüfung), keine eigenen Netzwerk-/Datei-/Commitaktionen.

## 4–6. Fehler, Wiederholung und Restart

Unbekannte Arten/fehlende Assets/Components werfen; Studio ersetzt Renderfehler durch Preview-unavailable, Engine propagiert. children werden rekursiv vor switch gerendert, Components/Listen expandieren weitere Templates. Keine Zyklus-/Depth-/Outputgröße innerhalb Renderer, contract.prism-Depthbefund gilt auch für Componentreferenzexpansion. Variantpatchmerge verliert andere Props (001). Wiederholung ohne Zeit/I/O deterministisch, Klon schützt Componentroot. Keine Abort-/Retry-/Crashpersistenz; sehr großer synchroner Baum blockiert Eventloop und lässt äußeren Timeout nicht präemptiv greifen.

## 7–9. Vertrauen, Ressourcen und Architektur

Text/Attributwerte escapen &,<,>,quotes; Actions sind data-Attribute statt Inlinecode. Stylefarbenprüfung ist nur Regexpräfix, nicht vollständiger CSSparser; Contract-/Callerprüfung beachten, kein reproduzierter gültiger-Wire-XSS hier behauptet. Shadow verwirft ;/}, Numerik typisiert; Engine-/Iframe-CSP bleibt zweite Grenze. Chart liefert Platzhalter-div, kein tatsächlich gezeichnetes Diagramm. Tabs/Pagination/Empty-stateaction tragen nicht durchgehend deklarierte Einzelaction-IDs (002). Listen wiederholen Template-NodeIDs, sodass visuelles Selectionmodell Instanzidentität gesondert benötigt. Keine Retention oder Prozessbesitzer; Speicher proportional zu expandiertem HTML. Dauerhafte Vereinfachung: gemeinsame aufgelöste Komponenten-/Actionprojektion vor HTML, explizite Instanz-ID und vollständig geparste Stylewerte.

## 10–11. Tests und Dokumentation

Sieben Originalrendererfälle in [prism-reviewed-modules-tests.txt](../evidence/prism-reviewed-modules-tests.txt): escaping, collections/components, unknown type, layouttokens, normale buttonaction, typography, ausgewählte Katalogausgaben. Der „full v1 catalogue“-Fall enthält neun Arten und Assertions auf ausgewählte Tags, keine vollständige Interaktionsprüfung. Originalprobe [prism-renderer-review-probe.mjs — historischer Stand](https://github.com/datrab/kubeclaw/blob/2121dcaae14c65c0b0608dc5fe365041b7de6242/docs/review/evidence/prism-renderer-review-probe.mjs) reproduziert001 und fehlende Paginationactions, Ausgabe gleichnamige txt. Kein echter Browsertest dieser Probe. Plan Phase4/5 verlangt gemeinsam genutzte Renderer-/Interaktionssemantik, Source genügt HTMLabbildung nur teilweise. Dokumentation vorhanden und unvollständig; bereits contract/domain zugeordnete Befunde nicht dupliziert.

## 12. Befunde

### PCR-PRISM-RENDERER-001 — Componentoverride verdrängt ganzen Variantpatch

**Mittel; Evidenzklasse: nachgewiesener Defekt.** index.ts:161–176 spreadet Varianten-/Override-Maps auf Node-ID-Ebene. Variant copy.content='variant', Override copy.hidden=true ergibt base-Content+hidden. Originalprobe mit Originalrenderer bestätigt HTML „base“. Derselbe Fehlermechanismus wie Domain-State/Responsive, aber eigener Componentmergepfad und Eigentümer. Ursache: Layer werden vor Propertymerge ersetzt. Behebung: pro Node Props in Reihenfolge Base→Variant→Override mergen. Regression: Originalrenderer über echte Engine/Studio mit disjunkten/kollidierenden Props; disjunkte Variante bleibt, gezielter Override gewinnt, Originaltemplate unverändert.

### PCR-PRISM-RENDERER-002 — Paginationaktionen erreichen Preview nicht

**Mittel; Evidenzklasse: nachgewiesener Defekt durch Originalausgabe und Gegenstellentrace.** index.ts:278–279 rendert Previous/Next ohne data-prism-action trotz previousAction/nextAction im Vertrag; Studio preview.ts:29 sendet nur bei gefundenem data-prism-action ein prism.action.v1. Originalprobe liefert Buttons ohne back/forward-Aktion. Auslöser: gültige Pagination mit Flowtriggern; Klick wählt allenfalls Node, schaltet Flow nicht. Ursache: switch ignoriert deklarierte spezifische Actionprops. Behebung: beide Buttons separat an entsprechende Action binden; Tabs/Dialogs/Empty-state vergleichbar vollständig auflösen. Regression: echter iframeclick auf Previous/Next und Original-Appflow, richtige unterschiedliche Transition/State, keine direkte Scriptaktion. Nicht pauschal jeden Katalogtyp als funktionierend aus Tagtests ableiten.

Direkte Probeausgabe: [prism-renderer-review-probe.txt](../evidence/prism-renderer-review-probe.txt).

Historische Prototypen und ihre getrennte Testaussage: [Prism-Spikeabgrenzung](../prism-spikes.md).
