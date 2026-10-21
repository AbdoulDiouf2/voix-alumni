# 09 — Contrats API REST (proposition initiale)

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification cible et état exécuté des Lots 1–2
> **Objet :** Décrire la frontière UI/backend, validations métier et erreurs.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Convention générale

Base métier proposée `/api/v1`, servie par Hono. Better Auth est monté **dans le même backend** sous `/api/auth/*` avant les routes métier ; ses endpoints et schémas sont ceux de la version épinglée, sans réimplémentation maison de login/logout. HTTPS en production, même origine via Caddy, JSON UTF-8 ; cookie de session et protection CSRF/origine. Réponses paginées, `request_id` en erreurs, dates ISO 8601 UTC, zones IANA explicites. **Les routes sont des contrats à implémenter**, pas une affirmation qu'elles existent.

Lot 1 effectivement présent : `GET /api/health`, `GET /api/ready`, `GET /api/capabilities`, `/api/auth/*` Better Auth, `GET /api/v1/me`, `GET /api/v1/dashboard` et les routes de rôle `GET /api/v1/responsable/overview`, `GET /api/v1/production/overview`. Au Lot 2, le tableau de bord lit les épisodes réellement enregistrés. Les routes métier effectivement livrées sont distinguées des contrats futurs dans la section « État exécuté du Lot 2 ». Tout POST Better Auth exige l’origine exacte configurée.

Création publique interdite : email/mot de passe avec `disableSignUp`, Google OAuth avec `disableSignUp`, plus contrôle serveur de l'identité autorisée et active. Le callback OAuth d'un compte non autorisé ne doit ni créer d'identité métier ni ouvrir une session utilisable. Les routes publiques de feedback sont distinctes et limitées ; elles n'accordent jamais une session organisateur.

Format pagination : `?limit=20&cursor=...` (ou offset si validé), réponse `{ "items":[], "next_cursor":null }`. Erreur :

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "La session ne peut pas être confirmée sans heure validée.",
    "fields": {"start_at_local":"required"},
    "request_id": "req_example"
  }
}
```

Codes : `400` mauvais format, `401` non connecté, `403` interdit, `404` hors périmètre/inexistant, `409` version ou transition conflictuelle, `422` données invalides, `429` limitation, `500` erreur interne sans fuite.

## 2. Endpoints par domaine

| Méthode / route | Objectif | Rôle/action |
|---|---|---|
| `/api/auth/*` | sessions, email/mot de passe, Google OAuth via Better Auth intégré | comptes préautorisés ; inscription publique refusée |
| `GET /api/v1/me` | identité, rôle et autorisation métier courants | authentifié et actif |
| `GET /api/v1/dashboard` | vue vide véridique du rôle courant | authentifié et actif |
| `GET /api/v1/responsable/overview`, `GET /api/v1/production/overview` | routes de rôle, données vides | rôle correspondant uniquement |
| `GET /dashboard?role_context=...` | ancien contrat illustratif ; remplacé au Lot 1 par `GET /api/v1/dashboard` | ne pas implémenter |
| `GET /alumni` | liste, filtres, recherche | deux rôles |
| `POST /alumni` | fiche brouillon | deux rôles selon droits |
| `GET /alumni/{id}` | fiche + épisodes liés | deux rôles |
| `PATCH /alumni/{id}` | profil descriptif | deux rôles, champs filtrés |
| `POST /alumni/{id}/contact-events` | contact/interessement/confirmation | Responsable |
| `GET /episodes`, `POST /episodes` | calendrier/création | deux rôles |
| `GET /episodes/{id}` | épisode, ressources liées, progression | deux rôles |
| `PATCH /episodes/{id}` | modifications autorisées et version | deux rôles selon champs |
| `POST /episodes/{id}/confirm` | confirmation par Responsable | Responsable |
| `POST /episodes/{id}/handoff` | transmission interne | Responsable |
| `POST /episodes/{id}/reschedule` | report avec motif | Responsable, ou validation explicite |
| `POST /episodes/{id}/mark-held` | constat session réalisée | Responsable |
| `POST /episodes/{id}/close` | clôture avec motif d'exceptions | Responsable |
| `GET /episodes/{id}/tasks` | tâches | deux rôles |
| `PATCH /tasks/{id}` | état, assignee, note, version | selon action |
| `GET/POST /episodes/{id}/requests` | demandes internes | deux rôles |
| `POST /requests/{id}/respond` | répondre | Responsable |
| `POST /requests/{id}/resolve` | résolution | demandeur Production ou Responsable selon validation |
| `GET/POST /episodes/{id}/contents` | contenu de communication | deux rôles |
| `POST /contents/{id}/versions` | version brouillon | Production |
| `POST /contents/{id}/approve` | approbation version | Responsable |
| `POST /episodes/{id}/publications` | confirmation manuelle de diffusion | rôles autorisés |
| `POST /assets/upload-init`, `GET /assets/{id}` | fichiers privés | authentifié + autorisé |
| `GET/POST /episodes/{id}/questions` | conducteur d'animation | deux rôles |
| `GET/POST /episodes/{id}/feedback-imports` | sources et imports | Production |
| `GET /api/v1/public/feedback/{token}`, `POST /api/v1/public/feedback/{token}/responses` | formulaire natif publié et dépôt d'une réponse | public à jeton, limité et sans accès aux autres données |
| `GET/POST /episodes/{id}/feedback-form`, `GET /episodes/{id}/feedback-responses` | édition/publication du formulaire et réponses | rôles autorisés, selon état |
| `GET /notifications`, `POST /notifications/{id}/read` | notifications internes | soi-même |
| `GET /audit?entity_type=...&entity_id=...` | historique contrôlé | deux rôles, données filtrées |

## 3. Exemple de création d'un alumni

```http
POST /api/v1/alumni
Content-Type: application/json

{
  "full_name": "Alassane Mballo",
  "promotion_year": 2018,
  "job_title": "Technical Leader Tender MV/LV",
  "company": "Schneider Electric",
  "relation_status": "brouillon",
  "linkedin_url": null
}
```

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "full_name": "Alassane Mballo",
  "promotion_year": 2018,
  "relation_status": "brouillon",
  "version": 1,
  "created_at": "2026-10-21T00:00:00Z"
}
```

Les IDs/dates sont **fictifs** ; ne jamais créer un véritable contact depuis cet exemple.

## 4. Confirmation et passage de relais

```http
POST /api/v1/episodes/22222222-2222-4222-8222-222222222222/handoff
Content-Type: application/json

{"expected_version":3,"summary":"Profil transmis à la production."}
```

Réponse `200` :

```json
{
 "episode_id":"22222222-2222-4222-8222-222222222222",
 "status":"en_préparation",
 "handed_off_at":"2026-10-21T00:00:00Z",
 "notification_created":true,
 "version":4
}
```

Si second clic sur le même épisode/version effective, renvoyer ressource existante avec `notification_created:false` (ou `409` documenté si sémantique différente), sans dupliquer notifications.

## 5. Demande d'information interne

```json
{
 "episode_id":"22222222-2222-4222-8222-222222222222",
 "subject":"Fonction exacte sur l'affiche",
 "questions":["Confirmer l'intitulé officiel du poste", "Confirmer l'entreprise actuelle"],
 "assigned_to_role":"RESPONSABLE",
 "due_at":null
}
```

Aucun destinataire externe accepté : `recipient_email` ou `alumni_id` comme route d'envoi => `422` et audit de refus au besoin. `respond` crée événement et état `répondue`, `resolve` est distinct.

## 6. Date et fuseau / report

```json
{
  "start_at_local": "2026-11-08T18:00:00",
  "event_timezone":"Europe/Paris",
  "reason":"Nouvelle disponibilité confirmée",
  "expected_version":6
}
```

Le backend convertit en instant UTC, calcule offset réel ce jour-là et renvoie `start_at_utc`, `local_display`, `offset_minutes`, `schedule_version`. Éviter `GMT+2` comme identifiant machine. Toute heure locale ambiguë/inexistante à un changement DST doit provoquer une validation explicite.

## 7. Approbation et publication manuelle

```json
{
 "content_version_id":"33333333-3333-4333-8333-333333333333",
 "channel":"whatsapp_community",
 "confirmed_at":"2026-10-21T19:00:00Z",
 "evidence_url":null,
 "confirmation":"J'ai réellement publié ce contenu dans la communauté."
}
```

Un export ou un copier dans le presse-papiers **n'appelle pas cette API**. Le serveur vérifie contenu validé et permissions. La date peut être contrôlée pour éviter un futur irréaliste ou une valeur anormalement ancienne sans justification.

## 8. Upload et récupération média

V1 utilise R2 derrière un port de stockage indépendant du fournisseur : `upload-init` après contrôle de rôle/droits produit une URL PUT signée courte pour un objet précis du bucket privé de l'environnement ; le serveur confirme ensuite taille, type et checksum dans PostgreSQL. `GET /assets/{id}/download` contrôle le droit puis renvoie une URL GET signée courte. Jamais de clé d'objet arbitraire ni d'identifiant R2 dans le navigateur. Scanner fichiers, bloquer SVG actif non nettoyé, vérifier MIME réel, taille et checksum.

## 9. API et contrats de test

- Schémas de validation et types partagés dans `packages/contracts`, documentation OpenAPI Hono si retenue après validation, contrats d'auth alignés sur Better Auth épinglé.
- Tests négatifs des endpoints d'inscription email, du premier OAuth Google non autorisé, de la liaison Google, du compte désactivé et de l'accès aux routes métier par un simple répondant au feedback.
- Requêtes `PATCH` attendent `expected_version`, réponse `409` si stale ; réponse ne divulgue aucun hash de mot de passe ni coordonnées protégées.
- Tests intégration : 401/403/404/409/422, idempotence, transitions, dates DST, média hors session, validation invalidée après édition.
- Pas de compatibilité inventée avec Graph/WhatsApp/YouTube avant étude des scopes et comptes réellement autorisés.

Références : [données](08_MODELE_DE_DONNEES.md) · [workflow](02_WORKFLOWS_ET_REGLES_METIER.md) · [sécurité](13_SECURITE_ET_CONFIDENTIALITE.md).

Les réponses `me` et `dashboard` sont validées par les mêmes schémas Zod exportés depuis `packages/contracts` dans l’API et dans React.

## État exécuté du Lot 2

Les routes suivantes existent sous `/api/v1`, exigent une session active et contrôlent le rôle côté Hono. Les formes illustratives plus haut ne prévalent pas sur les schémas Zod de `packages/contracts` : `promotion_year` est une chaîne, les identifiants sont des UUID textuels, et les heures locales utilisent `YYYY-MM-DDTHH:mm` avec zone IANA. La réponse d'erreur Lot 2 est `{ "error": { "code": "...", "message"?: "..." } }` ; `request_id` et `fields` restent des objectifs futurs.

| Routes réalisées | Règle effective |
|---|---|
| `GET /alumni`, `GET /alumni/duplicates`, `GET /alumni/:id` | Deux rôles ; recherche/filtres/tri, doublons indicatifs ; les notes de contact sont masquées à Production. |
| `POST /alumni`, `PATCH /alumni/:id` | Deux rôles ; `contact_notes` réservées à Responsable ; mise à jour par `expected_version`. |
| `POST /alumni/:id/archive`, `POST /alumni/:id/contact-events` | Responsable seulement ; pas d'envoi à l'intervenant. |
| `GET /episodes`, `GET /episodes/:id` | Deux rôles ; consultation du dossier, de sa date et de son fuseau. |
| `POST /episodes`, `POST /episodes/:id/confirm`, `/reschedule`, `/cancel`, `/handoff` | Responsable seulement ; transitions contrôlées, motif requis pour report/annulation, notification interne unique au relais. |
| `PATCH /episodes/:id` | Deux rôles pour titre/thème ; modification d'horaire confirmé impossible hors report. |
| `GET /notifications`, `POST /notifications/:id/read` | Session active ; seules les notifications du compte destinataire sont accessibles. Les relais ciblent Production. |
| `GET /audit?entity_type=alumni|episode&entity_id=...` | Deux rôles ; historique des changements importants, jusqu'à 100 événements récents. |

Les listes renvoient `{ "items": [...], "next_offset": nombre|null }` avec `limit` (1 à 100, défaut 50) et `offset`. La recherche des épisodes est faite côté serveur. `POST /confirm` attribue sous verrou transactionnel un numéro unique supérieur au plus grand numéro stocké et au plancher configuré. Au 21 octobre 2026, 1–9 sont réalisés, 10 et 11 réservés aux deux sessions décrites par le propriétaire ; `EPISODE_NUMBER_FLOOR=11` donne donc 12 comme premier numéro automatique. Cette réservation ne constitue pas un import historique.

La date envisagée et la date confirmée sont distinctes ; les heures locales inexistantes ou doubles lors du changement d'heure sont rejetées. Un dossier ne peut être transmis que confirmé et avec poste/entreprise renseignés. Un second relais ne crée pas de seconde notification. L'upload R2, les tâches, les publications et le feedback ne sont pas des routes livrées au Lot 2.

Le relais **ne requiert pas de portrait ni d'autorisation d'usage** : ces éléments restent explicitement à compléter dans le dossier Production. Pour le futur Lot 4, toute route serveur qui valide, exporte comme affiche prête à diffuser ou constate la publication d'un contenu **utilisant un portrait** devra vérifier une ressource privée liée au bon intervenant, `rights_status=granted`, un consentement actif pour la finalité exacte (annonce ou remerciement), sa portée et une référence de preuve. `unknown`, `requested`, `refused`, `revoked`, absence de consentement ou changement de portrait/consentement après validation doivent bloquer l'action ou invalider cette validation. Un contrôle de bouton React ne suffit pas. Aucune route de publication ou d'export de portrait n'existe au Lot 2.
## Routes livrées au Lot 3 (local)

Toutes les routes ci-dessous sont sous `/api/v1`, exigent une session active et n'exposent à Production que les épisodes transmis.

| Route | Comportement |
|---|---|
| `GET /episodes/:id/workflow` | Huit étapes, tâches, demandes, progression et événements du parcours. Initialise le snapshot des tâches à la première lecture et synchronise les seules tâches prédéfinies intactes appuyées par des événements métier vérifiables. |
| `POST /episodes/:id/tasks` | Ajout d'une tâche propre au dossier (étape, titre, caractère obligatoire, rôle, échéance ISO avec offset facultative). |
| `PATCH /episodes/:id/tasks/:taskId` | État, titre, propriétaire, caractère obligatoire, échéance, commentaire ; `expected_version` requis, propriétaire courant seul autorisé. |
| `POST /episodes/:id/stages/:number/validate` | Validation explicite par le rôle principal après achèvement des tâches obligatoires ; `expected_version` requis. |
| `POST /episodes/:id/requests` | Demande interne ; destinataire fixé côté serveur à la Responsable. |
| `POST /requests/:id/take`, `/respond`, `/resolve`, `/reopen`, `/cancel` | Transitions de demande avec version attendue ; réponse par Responsable, résolution par demandeur. |
| `GET /workflow-notifications`, `POST /workflow-notifications/:id/read` | Notifications du compte courant et lecture idempotente. |

`409` signale version périmée, étape non prête, transition interdite ou fonctionnalité hors Lot 3. `403` protège les actions d'un autre rôle. Les tâches « publication », « présence », « replay » et « partage feedback » ne peuvent pas être déclarées terminées par cette API avant leurs modules métier. Aucun endpoint ne contacte l'alumni ni ne publie sur un canal externe.

Pour modifier une échéance de tâche depuis l'interface, `PATCH /episodes/:id/tasks/:taskId` accepte aussi `due_local` au format `YYYY-MM-DDTHH:mm` (ou `null` pour vider). La date est résolue côté serveur dans le fuseau IANA de l'épisode ; une heure inexistante ou ambiguë reçoit `422`. Une échéance manuelle cesse de suivre les reports automatiques.

Une répétition de la même réponse avec la version courante renvoie la demande existante et `notification_created:false`. Les notifications Lot 3 sont uniques par événement et destinataire. Une demande volontairement créée deux fois reste deux demandes distinctes ; l'interface n'automatise pas leur création.

Chaque étape expose `state` (`a_venir`, `en_cours`, `taches_terminees`, `validee`) séparément de `ready` et `completed`. `progress` inclut l'étape nécessitant l'attention du rôle connecté, les tâches obligatoires restantes et les demandes en attente. Les événements renvoient `actor_name` pour l'affichage français ; leurs codes techniques restent conservés. La lecture d'une notification est idempotente pour son destinataire et renvoie `404` à un autre compte.

## Routes locales du Lot 4

Toutes les routes exigent une session. Production ne voit que les épisodes transmis. Les mutations de contenu utilisent `expected_version` et renvoient `409` en cas de conflit. L'API valide les images par décodage et limite l'upload à 10 Mo.

| Route `/api/v1` | Fonction et permission |
|---|---|
| `GET /episodes/:id/creative` | Épisode, intervenant, contenus, ressources et consentements ; `source_stale` signale un contenu issu d'une ancienne fiche/date. |
| `POST /episodes/:id/assets` | Upload privé multipart du portrait ou des logos officiels ESMT, CPS et Voix d’Alumni par Production ; métadonnées et empreinte SHA-256 persistées. |
| `GET /assets/:id/content`, `GET /assets/:id/download` | Accès contrôlé à la ressource ; téléchargement par URL R2 signée courte en environnement R2, lecture authentifiée en test isolé. |
| `PATCH /assets/:id/rights`, `POST /episodes/:id/consents` | Responsable ; preuve, portée et version obligatoires selon transition. Révocation prise en compte avant diffusion. |
| `POST /episodes/:id/contents`, `PATCH /contents/:id`, `POST /contents/:id/submit` | Production ; huit types de contenus, champs ajustables et versions avec historique. |
| `POST /contents/:id/approve` | Responsable ; contrôle des données obligatoires, de la source actuelle et des droits portrait/logos pour les affiches. |
| `POST /contents/:id/export` | Production ; PNG 1080 × 1350 pour l'affiche, état prêt pour les messages ; aucun envoi externe. |
| `POST /contents/:id/publish` | Production uniquement ; `expected_version`, canal et `confirmed_external_publication: true` obligatoires, preuve facultative ; aucun envoi externe. Une version déjà publiée renvoie `409`. |
| `GET /contents/:id/history` | Révisions et publications avec canal, version, auteur et horodatage, sans modifier le contenu. |

Le stockage R2 utilise `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` dans l'environnement privé. L'endpoint doit être HTTPS et sous la juridiction `eu`. Aucun bucket ni identifiant n'est créé par l'application. `APP_ENV=test|e2e` active un adaptateur de fichiers isolé dans `/tmp` pour la recette ; ce résultat ne prouve aucun transfert R2 réel.

## Routes locales du Lot 5 — réunion, feedback et post-production

Toutes les routes `/api/v1` ci-dessous exigent une session Better Auth active. Production accède seulement aux épisodes transmis. Les mutations sensibles utilisent `expected_version` et renvoient `409` en cas de conflit. Les rôles indiqués sont vérifiés côté Hono.

| Route | Rôle et effet |
|---|---|
| `GET /episodes/:id/operations` | Deux rôles ; réunion, conducteur, rappels, replay, transcriptions, citations, checklist et historique avec auteur. Synchronise les échéances encore pendantes au calendrier courant ; un report suspend les échéances sans date confirmée et préserve celles déjà exécutées. |
| `PUT /episodes/:id/session-plan`, `POST /episodes/:id/session-plan/check-access` | Production ; lien Teams manuel et secours, vérification humaine explicite. Le report impose une nouvelle vérification. |
| `POST /episodes/:id/questions/initialize`, `POST /episodes/:id/questions`, `PATCH /episodes/:id/questions/:questionId` | Production ; six questions communes, ajouts et adaptations du conducteur. Toute édition invalide sa validation courante. |
| `POST /episodes/:id/conductor/approve`, `POST /episodes/:id/mark-held` | Responsable ; validation du conducteur et constat distinct de tenue effective de la session. |
| `POST /episodes/:id/reminders/:key/complete` | Production ; préparation interne des rappels J-7, J-3, J-1, jour J et après-session, sans envoi externe. |
| `GET/POST/PATCH /episodes/:id/feedback`, `POST /episodes/:id/feedback/approve`, `/open`, `/closed`, `/revoked` | Production crée/adapte/ouvre après confirmation ; Responsable approuve les variantes. Notice, rétention et validation requises avant ouverture. Jeton public haché en base ; les réponses sont attachées à la version présentée. |
| `GET/POST /feedback/policy` | Lecture autorisée aux deux rôles ; approbation de la notice et de la rétention par Responsable uniquement. Le texte réel reste à approuver humainement. |
| `GET /episodes/:id/feedback/responses`, `DELETE /episodes/:id/feedback/responses/:responseId`, `GET /episodes/:id/feedback/export.csv`, `GET /feedback/comparison` | Résultats privés ; suppression du contenu d'une réponse réservée à Responsable ; export et comparaison avec groupe de modèle explicite. |
| `POST /episodes/:id/feedback/import/preview`, `/commit` | Production ; CSV Google Forms, mapping de colonnes, anomalies, doublons et import transactionnel idempotent. `commit` exige `confirmed:true`. |
| `POST /feedback/retention/purge` | Responsable ; aperçu du nombre éligible par défaut, puis purge confirmée du contenu expiré selon la durée approuvée, avec audit. Aucun job automatique installé. |
| `PUT /episodes/:id/replay` | Production ; URL/ID YouTube saisis manuellement. L'état disponible exige droits d'enregistrement et de diffusion accordés avec référence de preuve. |
| `POST /episodes/:id/transcripts`, `GET /episodes/:id/transcripts/:transcriptId`, `POST /episodes/:id/transcripts/:transcriptId/review` | Production importe TXT/VTT/SRT UTF-8 privé ; consultation aux organisateurs, relecture et correction manuelle, version suivante par nouvel import. PDF non accepté faute d'extraction fiable. |
| `POST /episodes/:id/quotes`, `POST /episodes/:id/quotes/:quoteId/approve` | Production propose avec provenance ; Responsable confirme le texte exact. L'approbation d'une affiche citant ce texte exige aussi une citation approuvée correspondante en base. |
| `POST /episodes/:id/closure/prepare`, `/approve` | Production prépare avec exceptions motivées ; Responsable approuve seulement si checklist réelle satisfaite ou dérogations autorisées. L'archive conserve contenus, versions et historique. |

Les seules routes publiques sont `GET /api/public/feedback/:token` et `POST /api/public/feedback/:token/responses`. Le jeton est opaque, dérivé d'un secret serveur et conservé seulement sous forme SHA-256 dans `feedback_forms`. La page ne renvoie que questions et notice. La réponse exige la version de notice et une clé d'idempotence, contrôle tous les types, limite les soumissions à 100 par formulaire et par heure et accepte un champ piège contre les robots simples. Un jeton fermé, expiré ou révoqué répond `410` ; ni les réponses privées ni les notes de préparation ne sont exposées. Cette limitation de débit ne garantit pas l'unicité de participants anonymes.
