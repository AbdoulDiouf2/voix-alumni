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
