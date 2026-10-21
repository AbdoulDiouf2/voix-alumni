# 10 — Automatisations, rappels et intégrations externes

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Mettre les bonnes actions au bon moment sans promettre des API non établies.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Trois types d'automatisation à distinguer

1. **Interne V1 :** créer tâches et notifications in-app pour Responsable/Production, fondées sur le calendrier.
2. **Assistée V1 :** préparer un message, rendre le bouton « Copier », puis demander confirmation manuelle de publication.
3. **Externe V2/V3 :** emails ou API Teams/Google/YouTube après connexion, consentement, scopes et recette réelle.

Ne pas transformer une tâche de publication en envoi WhatsApp « automatique » sans API officiellement disponible **pour le canal exact**.

## 2. Calendrier de référence

| Événement | Valeur par défaut | Responsable | Automatisation V1 |
|---|---:|---|---|
| Vérifier dossier et photo | J-14 | Responsable + Production | tâche interne |
| Affiche et annonce validées | J-7 | Production + approbation Responsable | rappel + brouillon |
| Vérifier Teams et feedback | J-3 | Production | checklist/notification |
| Préparer rappel communauté | J-1 | Production | générer brouillon |
| Webinaire | J | Responsable | affichage conducteur et liens |
| Merci à chaud + feedback | J, après session | Production | tâche déclenchée quand « réalisé » constaté |
| Récupérer transcript/replay | J+1 / J+3 | Production | tâches conditionnelles |
| Affiche finale + partage YouTube | après replay prêt | Production | tâche conditionnelle, pas date fixe |

**Paramétrable par épisode.** Si confirmation à J-2, ne pas créer une annonce à une date passée comme « automatiquement faite » ; la marquer urgente avec échéance immédiate.

## 3. Moteur d'échéances

- Générer les échéances à `confirm_episode` ou modification de calendrier.
- `start_at_utc` + `event_timezone` pour calculs calendaires. Pour « J-1 matin », sélectionner **heure locale cible** dans fuseau approprié ; ne pas soustraire 24h UTC aveuglément au changement DST.
- Unique `(episode_id, type, schedule_version, recipient_user_id)` ; transaction de création + notification.
- Retry borné + backoff pour les jobs ; logs redigés ; afficher état et possibilité de « relancer » une notification interne, pas de spam.
- Suspension des jobs en cas d'annulation, indisponibilité ou heure non confirmée.
- Conserver trace `created`, `due`, `executed`, `failed`, `cancelled` et motif.

## 4. Cas particulier du 25/10/2026

L'affiche de Sennen Ekouagne indique **25 octobre 2026, 18h GMT+2**. En France, `Europe/Paris` est à UTC+1 après le changement d'heure cette nuit-là. Deux interprétations différentes correspondent à des instants distincts :

- 18h **GMT+2** = 16h UTC = 17h à Paris à cette date.
- 18h **Europe/Paris** = 17h UTC = 19h à UTC+2 (si lieu UTC+2 à date constante).

**La plateforme ne tranche pas :** saisir la zone/heure confirmées auprès de la Responsable, éventuellement préciser heure Dakar, puis vérifier l'affiche et messages avant envoi. Toute documentation d'exploitation doit afficher ce point comme « à confirmer », même si l'épisode est déjà illustré par la maquette.

## 5. Matrice des intégrations

| Service | Première version | Évolution possible | Risques/prérequis |
|---|---|---|---|
| WhatsApp communauté | copie du texte + envoi manuel | intégration seulement après preuve de compatibilité légale/technique du canal | API Business standard ne garantit pas les publications dans un groupe existant |
| Email organisateurs | notification in-app ; email optionnel désactivé | SMTP/transactionnel et préférences | opt-in, gestion désabonnement selon contexte, délivrabilité |
| Microsoft Teams | URL fournie/collée et testée | Microsoft Graph calendrier/online meeting | tenant, scopes, identité, licences, expirations |
| Feedback natif / Google Sheets historique | formulaire natif V1, import CSV/XLSX contrôlé pour l'historique | synchronisation autorisée si besoin | liens publics protégés, PII, consentement, idempotence |
| YouTube | lien du replay + état manuel | upload API OAuth, récupération métadonnées/transcription si autorisée | chaîne, scopes, droits et disponibilité des captions |
| LinkedIn | URL, saisie et vérification manuelles | intégration officielle si éligible | pas de scraping ni collecte automatique sans permission |
| Google Drive | lien/document référencé | stockage/synchronisation autorisés | OAuth et propriété des dossiers |

## 6. Politique d'envoi et de preuve

Un message peut être `brouillon`, `validé`, `copié`, `publié_constaté` ; seules les trois premières opérations sont sous le contrôle technique de l'application, la dernière nécessite attestation humaine avec canal et date. Si API externe est ajoutée plus tard, tracer `external_message_id` et la réponse réelle du fournisseur ; gérer « envoyé mais état inconnu » sans double envoi aveugle.

## 7. Consentement et données externes

- Aucun contact automatique de l'intervenant, même si son email est présent.
- Ne jamais publier un lien de réunion privé dans des pages publiques non autorisées.
- Protéger tokens OAuth et webhooks ; rotation et suppression de connexion prévues.
- Ne pas importer automatiquement toutes les réponses d'une source historique sans qualification des données collectées et droits d'accès ; le formulaire natif V1 ne dépend pas de Google Forms.
- Vérifier la publication du replay avant d'utiliser sa transcription ; un transcript uploadé peut être imparfait.

## 8. Tests d'automatisations

1. Confirmation à J-10 : J-7 créé une fois ; confirmation renouvelée sans modification : pas de doublon.
2. Report à J-2 : J-1 futur recalculé, ancien job annulé, annonce déjà publiée reste historique.
3. Épisode annulé : aucune notification future non pertinente.
4. Job échoue : retry journalisé ; compteurs dashboard corrects ; pas de faux `sent`.
5. Heure GMT+2 vs Europe/Paris : test de décalage lors du 25/10/2026.
6. Lien YouTube absent : pas de message de replay marqué prêt.
7. Copie dans presse-papiers : zéro `publication` enregistrée.

Références : [workflow](02_WORKFLOWS_ET_REGLES_METIER.md) · [communications](06_COMMUNICATIONS_ET_TEMPLATES.md) · [tests](14_PLAN_DE_TESTS_ET_RECETTE.md).
