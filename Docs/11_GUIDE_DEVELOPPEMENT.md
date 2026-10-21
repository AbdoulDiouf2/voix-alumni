# 11 — Guide de développement et conventions

> **Projet :** Voix d’Alumni Studio · **Mise à jour :** 21 octobre 2026 · **Statut :** socle local du Lot 0 implémenté ; fonctions métier NON IMPLÉMENTÉES
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html`, inchangée.

## 1. Ce qui existe maintenant

Monorepo npm workspaces : `apps/web` (React/Vite/Tailwind, configuration shadcn/ui et page de santé), `apps/api` (Hono, `/api/health`, `/api/ready`), `packages/contracts` (schéma Zod de santé), `packages/db` (connexion Drizzle/PostgreSQL). Better Auth et l'adaptateur Drizzle sont verrouillés comme dépendances mais **aucune route d'auth ni compte n'est actif au Lot 0**. Le port de stockage `PrivateObjectStore` est défini ; l'adaptateur Cloudflare R2, les buckets et les identifiants n'existent pas encore. Aucun workflow métier, formulaire de feedback ou studio d'affiches opérationnel n'est présent.

## 2. Versions verrouillées

Le fichier `package-lock.json` est la référence exacte. Versions directes installées au Lot 0 : Node cible 24.22.0 (`.nvmrc`, installé temporairement sous `/tmp/voix-alumni-node24` pour la vérification sans installation globale), React/React DOM 19.3.1, Vite 8.3.4, Tailwind et plugin Vite 4.3.3, Hono 4.13.13, `@hono/node-server` 2.1.5, Better Auth et adaptateur Drizzle 1.7.12, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11, `pg` 8.23.1, TypeScript 5.9.3, Vitest 5.0.5, ESLint 10.13.0 et Prettier 3.9.10. PostgreSQL local est `postgres:17.11-bookworm` ; l'image production sera fixée par empreinte lors d'un lot ultérieur. Les composants shadcn/ui sont du code local, sans service externe.

Node 20.20.2 reste installé sur l'hôte pour les autres applications. Utiliser Node 24 **dans l'environnement du projet** (gestionnaire de versions utilisateur ou conteneur futur), sans modifier les binaires globaux. Les versions npm ont été résolues par `npm install` et contrôlées par typecheck/build/tests ; cela ne constitue pas une recette des fonctions des lots suivants.

## 3. Premier démarrage local

1. Utiliser Node 24 indiqué par `.nvmrc` ; vérifier `node --version`. Ne pas exécuter avec le Node 20 de l'hôte.
2. `npm ci` à la racine. Le lockfile doit être conservé.
3. Copier `.env.example` vers `.env`, remplacer les valeurs fictives par des secrets locaux aléatoires et garder `.env` non suivi (`chmod 600 .env`). Pour le Lot 0, seules les variables PostgreSQL et API sont utilisées ; ne renseigner aucun identifiant R2 ou Google réel.
4. `docker compose -f compose.dev.yml up -d db` : crée uniquement `voix-alumni-lot0-db-1`, son volume/réseau dédiés et expose PostgreSQL sur `127.0.0.1:55432`.
5. `npm run build`, puis dans deux terminaux `npm run dev:api` et `npm run dev:web`. API : `127.0.0.1:8787` ; web : `127.0.0.1:5173`. Vite proxifie `/api` vers Hono.
6. Contrôler `GET http://127.0.0.1:8787/api/health` (`200`) et `/api/ready` (`200` avec la DB, `503` sinon). La page locale affiche l'état de `/api/health`.

L'arrêt de la base locale peut se faire avec `docker compose -f compose.dev.yml stop db`, sans supprimer le volume. Aucun `down -v`, `prune`, reset global ou opération sur un autre projet.

## 4. Commandes de contrôle réellement exécutées

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Au Lot 0 : 2 tests API de santé réussis ; lint, format, typecheck et build réussis. Un smoke HTTP distinct a vérifié `/api/health` et `/api/ready` avec PostgreSQL sain. L'inscription renvoie `404` parce que Better Auth **n'est pas encore monté**, et non parce qu'un système d'auth complet serait déjà sécurisé. La validation email/OAuth appartient au Lot 1.

Le navigateur Chromium déjà présent sur l'hôte n'a pas pu démarrer pour un test visuel (`libnspr4.so` absente). Le test HTTP du proxy Vite et de l'API a réussi ; le rendu navigateur reste à vérifier dans un environnement de test équipé, sans installer de bibliothèque système sur le VPS partagé pour le seul Lot 0.

## 5. Conventions et étapes futures

- TypeScript strict, ESLint et Prettier ; schémas/contrats partagés sans importer du code serveur dans le web.
- Schéma Better Auth, table d'autorisation métier et migrations Drizzle versionnées à créer au Lot 1. Aucun `drizzle-kit push` en production.
- Better Auth sera monté dans Hono sous `/api/auth/*`, avec création publique email et OAuth fermée, liaison Google explicite et bootstrap administratif privé. Les deux rôles sont contrôlés côté serveur.
- R2 : deux buckets privés séparés avec restriction de juridiction `eu`, point d'accès S3 UE, permissions minimales et URLs signées après contrôle. Le port `PrivateObjectStore` permet de remplacer R2. Aucune ressource Cloudflare créée au Lot 0.
- Affiches : étudier d'abord le rendu côté navigateur et mesurer fidélité/coût avant Chromium serveur. Préserver la maquette et ses jetons visuels.
- Feedback : réponses anonymes par défaut, rétention configurable, suppression individuelle, agrégats réellement anonymisés. Modéliser séparément les consentements portrait/enregistrement/replay.
- Fuseaux UTC + IANA ; l'heure réelle du 25/10/2026 reste à confirmer.

Références : [architecture](07_ARCHITECTURE_TECHNIQUE.md) · [lots](12_PLAN_IMPLEMENTATION.md) · [infra](16_DEPLOIEMENT_ET_ENVIRONNEMENTS.md).
