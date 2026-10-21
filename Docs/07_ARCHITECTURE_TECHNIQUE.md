# 07 — Architecture technique et décisions des Lots 0–1

> **Projet :** Voix d’Alumni Studio · **Mise à jour :** 21 octobre 2026 · **Statut :** stack VALIDÉE ; socle Lot 1 implémenté localement ; OAuth Google réel à valider
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

## 3. Structure du monorepo

```text
voix-alumni/
├── apps/
│   ├── web/                   # React, Vite, Tailwind, composants shadcn/ui locaux
│   │   └── src/App.tsx        # shell, connexion, navigation et vues vides
│   └── api/                   # Hono, Better Auth, composition des modules
│       └── src/               # auth, Hono, routes de santé et CLI privée
├── packages/
│   ├── db/                    # schémas Drizzle, migrations SQL versionnées
│   └── contracts/             # contrats et validations partagés sans code serveur
├── Docs/                     # source métier et maquette inchangée
├── package.json              # npm workspaces, scripts racine
├── package-lock.json         # versions verrouillées
├── .env.example              # noms/valeurs fictives sans secret
└── compose.dev.yml           # PostgreSQL local isolé uniquement
```

Le schéma d'auth Better Auth (`user`, `session`, `account`, `verification`) est intégré dans `packages/db` via l'adaptateur Drizzle et trois migrations versionnées. Une table distincte d'autorisation/affectation métier relie l'identité à `RESPONSABLE` ou `PRODUCTION`, sans faire dépendre les décisions métier de champs modifiables par l'utilisateur. Les migrations Better Auth et métier sont versionnées et examinées ensemble.

## 4. Authentification et autorisation

- `emailAndPassword.disableSignUp=true` et `socialProviders.google.disableSignUp=true` ; vérifier au test que tous les endpoints de création publique refusent l'accès, y compris OAuth.
- Provisionnement privé, journalisé et refusant les doublons des identités autorisées, avec email normalisé, rôle, actif/inactif et méthode de connexion. Aucun utilisateur public ne peut s'attribuer un rôle.
- Interdire la liaison implicite Google (`disableImplicitLinking`) ; après connexion email/mot de passe à un compte préautorisé, l'utilisateur lie explicitement son Google vérifié. `user.validateUserInfo` contrôle l'identité OAuth et l'autorisation avant création/liaison/session. Contrôler ensuite l'autorisation métier à chaque requête sensible ; aucune liaison forcée à partir d'un email non vérifié.
- Sessions Better Auth en cookie HttpOnly/Secure/SameSite adapté, origine de confiance explicite et protection CSRF. Hono lit la session côté serveur puis applique le RBAC ; le simulateur de rôle de la maquette ne donne aucun privilège.
- Le bootstrap, la révocation et la récupération d’accès passent par `apps/api/src/admin.ts`, exécuté localement avec un mot de passe transmis par stdin. Les sessions sont révoquées lors d’une réinitialisation ou révocation ; `security_events` conserve l’action sans mot de passe. Aucun email automatique de récupération n’est activé.

## 5. Frontières et transactions

Les modules Hono contiennent routes, validation, services métier et accès Drizzle. Les transitions critiques (`confirm`, `handoff`, `approve`, `publish`, `reschedule`, `close`) écrivent état, audit et notification dans une même transaction PostgreSQL. Les mutations concurrentes utilisent `expected_version` et retournent `409` si périmées. Les règles de temps utilisent UTC + zone IANA, avec refus des heures locales ambiguës/non existantes. Les jobs internes sont idempotents et séparés des envois externes.

Le frontend conserve les tokens visuels et les huit rubriques de navigation de la maquette ; le parcours métier à huit étapes reste prévu pour les lots suivants. Tailwind et shadcn/ui servent l'implémentation, sans imposer leur thème par défaut au produit. Les données réelles viennent exclusivement de l'API. Les formulaires d'auth et de feedback sont distincts ; aucun état `localStorage` de la maquette n'est source métier.

## 6. Fichiers, affiches et feedback

Le stockage média V1 utilise Cloudflare R2 via l'API S3 compatible. Les buckets **privés** dev et prod sont distincts et créés avec restriction de juridiction `eu` (une simple indication de localisation `weur` ne garantit pas cette restriction). L'API dépend d'un port de stockage indépendant de R2 ; l'adaptateur R2 utilisera le point d'accès juridictionnel UE, des identifiants limités par bucket/opération et des URLs signées temporaires après autorisation. Les métadonnées, consentements, versions et clés d'objet restent en PostgreSQL ; les clés et tokens ne sont pas exposés dans l'UI ni les logs. Aucune création R2 aux Lots 0–1.

Pour les affiches, étudier **en priorité un rendu côté navigateur** à partir du même modèle que l'aperçu, avec export PNG versionné après validation serveur. Mesurer fidélité, Unicode, tailles et coût mémoire sur desktop/mobile. Chromium côté serveur n'est qu'une option de repli après mesure des ressources du VPS partagé ; les polices, logos et portraits restent des assets autorisés.

Le formulaire de feedback natif dispose d'un lien public à jeton opaque, peut être fermé/révoqué, limite les soumissions et collecte le minimum de données. Les réponses sont anonymes par défaut ; toute identification exige une décision explicite. Prévoir rétention configurable, suppression individuelle et conservation éventuelle de statistiques réellement anonymisées. L'import historique produit prévisualisation, checksum, idempotence et rapport, sans attribuer de preuve de publication aux données anciennes.

## 7. Santé, exploitation et décisions restantes

Le socle local fournit `GET /api/health` (processus) et `GET /api/ready` (PostgreSQL), sans divulguer de données. Le journal `security_events` ne stocke ni mot de passe ni jeton ; une journalisation applicative structurée plus complète reste à mettre en place avant production. En local, l'API et la base utilisent des ports limités à loopback ; en cible, Caddy seul publie 80/443, avec réseaux propres au projet. Sauvegardes PostgreSQL automatisables et copie indépendante des médias critiques hors VPS ; restauration DB et médias à tester avant production.

**Lots 0–1 :** socle local, Better Auth/Drizzle, rôles et shell React opérationnels. Les deux comptes locaux de démonstration sont fictifs ; le canal privé de remise des vrais accès doit être convenu. Le callback Google réel et sa liaison restent à tester avec les identifiants OAuth du projet. R2, formulaires et studio restent pour les lots suivants. **À confirmer avant déploiement :** domaine, OAuth Google (projet et URI de rappel), création des buckets R2 UE, sauvegarde indépendante, ressources du serveur, droits médias et horaire réel du 25/10/2026.

Références : [modèle](08_MODELE_DE_DONNEES.md) · [API](09_CONTRATS_API.md) · [sécurité](13_SECURITE_ET_CONFIDENTIALITE.md) · [déploiement](16_DEPLOIEMENT_ET_ENVIRONNEMENTS.md).
