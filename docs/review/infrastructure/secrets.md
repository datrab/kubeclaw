# INF-17 — Secrets, Credentials und Rotation

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Trust-Grenzen
`my-values/setup-secrets.sh` übernimmt vorhandene Ziel-Secrets, kopiert optional aus Quellnamespace, entschlüsselt externes SOPS-Material oder fragt interaktiv ab. Fehlende Schlüssel werden einzeln geprüft/repariert; Überschreiben ist explizit. `scripts/deploy.sh:968–985,1583ff.` prüft Worker-Trust/Prism-Keys. `charts/kubeclaw/templates/secret.yaml` unterstützt inline Values, Betreiber-Values referenzieren vorhandene Secrets. Kein externer Secret-Controller/KMS im Repository provisioniert.

Pipeline-, Git-, Registry-, Modell-, Discord-, Redis-, DB-, SPIRE- und Ops-Credentials haben unterschiedliche Verbraucher. Private Dateiinhalte/Betreiber-IDs wurden nicht in Reviews kopiert. Temporäre Ed25519-Dateien werden mit restriktiven Rechten behandelt; Providerzugänge dürfen nicht in Artefakte/Logs gelangen. Secret-Backup ist getrennt von PVC-Backup, siehe [INF-26](backup-recovery.md).

## Befund IFR-17-001
**Hoch; nachgewiesene überbreite optionale Secret-Leseberechtigung.** `charts/kubeclaw/templates/rbac.yaml:49–83` erstellt bei verificationRead einen ClusterRoleBinding mit get auf den benannten Tailscale-OAuth-Secret-Namen. `my-values/nova-values.yaml:80–85` aktiviert ihn. ResourceNames begrenzt den Namen, aber der ClusterRoleBinding nicht den Namespace: Nova kann gleichnamige Secrets in allen Namespaces lesen. Die Vorprüfung benötigt einen konkreten Operator-Namespace, keine globale Namenssuche.

Auslöser: kompromittierter Nova-Prozess oder fremder gleichnamiger Secret außerhalb des gewünschten Operator-Namespace. Folge: Zugriff auf OAuth-Credentials jenseits der vorgesehenen Grenze. Ursachenbehebung: Secret-Regel in namespacegebundenen Role/RoleBinding auslagern; bloße Existenzprüfung nach Möglichkeit ohne Secret-Datenzugriff. Echter Test: Nova-SA darf genau den vorgesehenen Prüfvorgang; gleichnamiges Secret in Kontrollnamespace und andere Keys/Secrets müssen 403 liefern.

## Rotation und Betrieb
Viele Consumer lesen Secrets über env oder beim Start in Speicher; Secret-Objektänderung allein rollt Pods nicht aus. Quellattestierung während aktiver Jobs benötigt abgestimmte Rotation. MCP liest Kubernetes-Token/CA pro Request neu, lokalen Bearer hingegen einmal beim Start. Bootstrap ist nicht automatisch eine verteilte Rotationstransaktion.

Statische Pfadprüfung und vorhandene Secret-Prüfungen im Deployment-Verifier bestanden; dessen eingebettete kubectl-Testfunktion ist **kein** echter RBAC-Nachweis. Keine Secret-Werte gelesen. Doku muss je Credential Zuständigkeit, Scope, Laufzeit-Leseverhalten, Rotation, Recovery, Widerruf und SOPS-/KMS-Voraussetzungen dokumentieren.

Semantikbeleg: [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/#rolebinding-and-clusterrolebinding) unterscheidet namespacegebundene RoleBindings und clusterweite ClusterRoleBindings. Aktuelle Referenz für diese API-Semantik; mangels Clusterpin kein Nachweis der eingesetzten K3s-Version.
