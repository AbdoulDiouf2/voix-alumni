# 09 — Contrats API REST (proposition initiale)

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Décrire la frontière UI/backend, validations métier et erreurs.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Convention générale

Base métier proposée `/api/v1`, servie par Hono. Better Auth est monté **dans le même backend** sous `/api/auth/*` avant les routes métier ; ses endpoints et schémas sont ceux de la version épinglée, sans réimplémentation maison de login/logout. HTTPS en production, même origine via Caddy, JSON UTF-8 ; cookie de session et protection CSRF/origine. Réponses paginées, `request_id` en erreurs, dates ISO 8601 UTC, zones IANA explicites. **Les routes sont des contrats à implémenter**, pas une affirmation qu'elles existent.

Socle Lot 0 effectivement présent : `GET /api/health` renvoie l'état du processus et `GET /api/ready` vérifie PostgreSQL. Les routes Better Auth et métier ci-dessous restent des contrats pour les lots suivants ; un `404` sur inscription au Lot 0 ne constitue pas encore la preuve que l'inscription Better Auth sera fermée.

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
| `GET /dashboard?role_context=...` | état partagé filtré selon rôle réel | deux rôles |
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
