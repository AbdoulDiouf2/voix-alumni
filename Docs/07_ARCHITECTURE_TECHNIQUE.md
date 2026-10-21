# 07 — Architecture technique et décisions du Lot 0

> **Projet :** Voix d’Alumni Studio · **Mise à jour :** 21 octobre 2026 · **Statut :** stack VALIDÉE ; socle local du Lot 0 autorisé
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html`, conservée intégralement.

## 1. Décisions validées

Monorepo TypeScript et monolithe modulaire : React + TypeScript + Vite pour le frontend ; Tailwind CSS et composants shadcn/ui adaptés aux jetons de la maquette ; Node.js + Hono pour l'API ; Better Auth **monté dans le même processus Hono** ; Drizzle pour PostgreSQL. Docker Compose et Caddy constituent la cible de déploiement, après audit et approbation ultérieurs. Aucun service d'authentification séparé.

Deux rôles métier seulement, `RESPONSABLE` et `PRODUCTION`. L'inscription publique est désactivée pour email/mot de passe **et** Google OAuth. Un compte doit être provisionné et autorisé explicitement avant toute connexion. Une correspondance de domaine email ne vaut jamais autorisation. Les répondants au feedback natif n'obtiennent aucun compte organisateur.

Les médias sont privés dans Cloudflare R2 : deux buckets séparés dev/prod avec restriction de juridiction `eu`, métadonnées PostgreSQL, identifiants à privilèges minimaux et URLs signées courtes après contrôle serveur. Les vidéos originales volumineuses ne résident pas sur le VPS. Le studio d'affiches simple exporte annonce et remerciement en PNG 1080 × 1350. Le feedback natif V1 collecte des réponses anonymes par défaut et accepte un import historique contrôlé. Teams, WhatsApp et YouTube restent manuels ou assistés ; copier/générer n'est jamais publier.

## 2. Vue d'ensemble

```text
Navigateur organisateur ── HTTPS ── Caddy ── SPA React/Vite
                                     └───── /api/* ── Hono (Node.js)
                                                        ├─ Better Auth /api/auth/*
                                                        ├─ modules métier + RBAC
                                                        ├─ Drizzle ── PostgreSQL privé
                                                        └─ port stockage ── R2 privé (`eu`)
Navigateur répondant ── HTTPS ── Caddy ── routes de feedback public limitées
```

Caddy doit présenter la SPA et l'API sous **une même origine** en production. Le routage `/api/auth/*` est réservé au handler Better Auth, monté avant les routes métier `/api/v1/*`. Hono contrôle toutes les autres actions métier et l'accès aux médias. Les réponses publiques du feedback empruntent des routes dédiées, sans rendre l'API interne publique. Aucun PostgreSQL, volume média ou socket Docker n'est exposé.

## 3. Structure du monorepo initialisé au Lot 0

```text
voix-alumni/
├── apps/
│   ├── web/                   # React, Vite, Tailwind, composants shadcn/ui locaux
│   │   └── src/features/      # épisode, alumni, studio, feedback, etc.
│   └── api/                   # Hono, Better Auth, composition des modules
│       └── src/modules/       # auth, alumni, episodes, tasks, content, media, feedback
├── packages/
│   ├── db/                    # schémas Drizzle, migrations SQL versionnées
│   └── contracts/             # contrats et validations partagés sans code serveur
├── Docs/                     # source métier et maquette inchangée
├── package.json              # npm workspaces, scripts racine
├── package-lock.json         # versions verrouillées
├── .env.example              # noms/valeurs fictives sans secret
└── compose.dev.yml           # PostgreSQL local isolé uniquement
```

Le schéma d'auth Better Auth (`user`, `session`, `account`, `verification`) sera intégré dans `packages/db` via l'adaptateur Drizzle. Une table distincte d'autorisation/affectation métier reliera l'identité à `RESPONSABLE` ou `PRODUCTION`, sans faire dépendre les décisions métier de champs modifiables par l'utilisateur. Les migrations Better Auth et métier sont versionnées et examinées ensemble.

## 4. Authentification et autorisation

- `emailAndPassword.disableSignUp=true` et `socialProviders.google.disableSignUp=true` ; vérifier au test que tous les endpoints de création publique refusent l'accès, y compris OAuth.
- Provisionnement privé, journalisé et idempotent des identités autorisées, avec email normalisé, rôle, actif/inactif et méthode de connexion. Aucun utilisateur public ne peut s'attribuer un rôle.
- Interdire la liaison implicite Google (`disableImplicitLinking`) ; après connexion email/mot de passe à un compte préautorisé, l'utilisateur lie explicitement son Google vérifié. `user.validateUserInfo` contrôle l'identité OAuth et l'autorisation avant création/liaison/session. Contrôler ensuite l'autorisation métier à chaque requête sensible ; aucune liaison forcée à partir d'un email non vérifié.
- Sessions Better Auth en cookie HttpOnly/Secure/SameSite adapté, origine de confiance explicite et protection CSRF. Hono lit la session côté serveur puis applique le RBAC ; le simulateur de rôle de la maquette ne donne aucun privilège.
- Prévoir un bootstrap administratif privé et audité pour les deux comptes initiaux, sans route d'inscription publique. Définir une récupération d'accès sécurisée (jeton unique expirant, révocation des sessions, délivrance sur canal vérifié ou intervention administrative tracée) avant activation de l'auth au Lot 1.

## 5. Frontières et transactions

Les modules Hono contiennent routes, validation, services métier et accès Drizzle. Les transitions critiques (`confirm`, `handoff`, `approve`, `publish`, `reschedule`, `close`) écrivent état, audit et notification dans une même transaction PostgreSQL. Les mutations concurrentes utilisent `expected_version` et retournent `409` si périmées. Les règles de temps utilisent UTC + zone IANA, avec refus des heures locales ambiguës/non existantes. Les jobs internes sont idempotents et séparés des envois externes.

Le frontend conserve les tokens visuels de la maquette et ses huit étapes. Tailwind et shadcn/ui servent l'implémentation, sans imposer leur thème par défaut au produit. Les données réelles viennent exclusivement de l'API. Les formulaires d'auth et de feedback sont distincts ; aucun état `localStorage` de la maquette n'est source métier.

## 6. Fichiers, affiches et feedback

Le stockage média V1 utilise Cloudflare R2 via l'API S3 compatible. Les buckets **privés** dev et prod sont distincts et créés avec restriction de juridiction `eu` (une simple indication de localisation `weur` ne garantit pas cette restriction). L'API dépend d'un port de stockage indépendant de R2 ; l'adaptateur R2 utilisera le point d'accès juridictionnel UE, des identifiants limités par bucket/opération et des URLs signées temporaires après autorisation. Les métadonnées, consentements, versions et clés d'objet restent en PostgreSQL ; les clés et tokens ne sont pas exposés dans l'UI ni les logs. Aucune création R2 au Lot 0.

Pour les affiches, étudier **en priorité un rendu côté navigateur** à partir du même modèle que l'aperçu, avec export PNG versionné après validation serveur. Mesurer fidélité, Unicode, tailles et coût mémoire sur desktop/mobile. Chromium côté serveur n'est qu'une option de repli après mesure des ressources du VPS partagé ; les polices, logos et portraits restent des assets autorisés.

Le formulaire de feedback natif dispose d'un lien public à jeton opaque, peut être fermé/révoqué, limite les soumissions et collecte le minimum de données. Les réponses sont anonymes par défaut ; toute identification exige une décision explicite. Prévoir rétention configurable, suppression individuelle et conservation éventuelle de statistiques réellement anonymisées. L'import historique produit prévisualisation, checksum, idempotence et rapport, sans attribuer de preuve de publication aux données anciennes.

## 7. Santé, exploitation et décisions restantes

Le socle local fournit `GET /api/health` (processus) et `GET /api/ready` (PostgreSQL), sans divulguer de données. Logs structurés sans PII ni secrets. En local, l'API et la base utilisent des ports limités à loopback ; en cible, Caddy seul publie 80/443, avec réseaux propres au projet. Sauvegardes PostgreSQL automatisables et copie indépendante des médias critiques hors VPS ; restauration DB et médias à tester avant production.

**Lot 0 :** socle et vérifications locales uniquement ; le schéma Better Auth, les comptes, l'adaptateur R2, les formulaires et le studio sont prévus pour les lots suivants. **À confirmer avant Lot 1 :** canal concret de récupération, procédure de bootstrap détaillée, politique chiffrée de rétention et périmètre d'identification du feedback. **À confirmer avant déploiement :** domaine, OAuth Google (projet et URI de rappel), création des buckets R2 UE, sauvegarde indépendante, ressources du serveur, droits médias et horaire réel du 25/10/2026.

Références : [modèle](08_MODELE_DE_DONNEES.md) · [API](09_CONTRATS_API.md) · [sécurité](13_SECURITE_ET_CONFIDENTIALITE.md) · [déploiement](16_DEPLOIEMENT_ET_ENVIRONNEMENTS.md).
