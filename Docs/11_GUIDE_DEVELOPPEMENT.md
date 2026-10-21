# 11 — Guide de développement et conventions

> **Projet :** Voix d’Alumni Studio · **Mise à jour :** 21 octobre 2026 · **Statut :** Lots 0–1 validés ; Lot 2 implémenté localement, recette finale en cours
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html`, inchangée.

## 1. État du dépôt

Le monorepo npm contient `apps/web` (React/Vite/Tailwind et écrans du Lot 2), `apps/api` (Hono, Better Auth et routes métier dans le même processus), `packages/db` (PostgreSQL/Drizzle, migrations) et `packages/contracts` (contrats partagés). Les routes `/api/auth/*`, `/api/health`, `/api/ready`, `/api/capabilities`, le tableau de bord et les dossiers intervenants/épisodes fonctionnent localement avec PostgreSQL. Les deux rôles sont contrôlés côté serveur. Studio, feedback et autres rubriques futures restent explicitement indisponibles.

Le port `PrivateObjectStore` est défini, sans adaptateur ni bucket R2. Google OAuth est configuré seulement si `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont fournis ; sans ces valeurs, aucun bouton Google n’apparaît. Le callback et la liaison réelle nécessitent une recette avec le projet Google autorisé.

## 2. Versions et isolation

`package-lock.json` verrouille les versions. Node 24.22.0 (`.nvmrc`) est utilisé par projet ; le Node global du VPS reste inchangé. Versions directes principales : React/React DOM 19.3.1, Vite 8.3.4, Tailwind 4.3.3, Hono 4.13.13, Better Auth et adaptateur Drizzle 1.7.12, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11, PostgreSQL `17.11-bookworm`, React Router 7.18.4, Playwright 1.64.0. L’outil de génération du schéma Better Auth est `auth@1.7.12`. Consulter les `package.json` pour la liste complète.

## 3. Premier démarrage local

1. Sélectionner Node 24 dans l’environnement du projet, puis `npm ci` à la racine.
2. Copier `.env.example` vers `.env`, remplacer les valeurs fictives par des secrets aléatoires et faire `chmod 600 .env`. Ne pas committer ce fichier.
3. `docker compose -f compose.dev.yml up -d db` démarre uniquement PostgreSQL Voix d’Alumni sur `127.0.0.1:55432`.
4. `npm run db:migrate -w @voix-alumni/db` applique les migrations versionnées à cette seule base de développement.
5. Dans deux terminaux : `npm run dev:api` et `npm run dev:web`. Ouvrir `http://127.0.0.1:5173`. L’API écoute sur `127.0.0.1:8787` ; Vite relaie `/api`.
6. Vérifier `/api/health` (`200`), `/api/ready` (`200` avec DB, `503` sinon), puis la page de connexion.

Ne jamais utiliser `drizzle-kit push` sur une base de production. L’arrêt local se fait avec `docker compose -f compose.dev.yml stop db`, sans `down -v` ni nettoyage global.

## 4. Comptes initiaux et récupération privée

La commande `npm run admin -w @voix-alumni/api -- …` s’exécute **sur le serveur de développement**, jamais depuis le navigateur. Elle accepte `provision`, `reset` ou `revoke` et lit le mot de passe depuis stdin, pas depuis un argument ni une variable `.env`. Le mot de passe doit contenir 16 à 128 caractères. Exemple de saisie sans écho :

```bash
read -rsp 'Mot de passe initial : ' VOIX_PASSWORD; printf '\n'
printf '%s\n' "$VOIX_PASSWORD" | npm run admin -w @voix-alumni/api -- provision --email=responsable@example.org --name='Responsable' --role=RESPONSABLE
unset VOIX_PASSWORD
```

Répéter avec `--role=PRODUCTION` pour le second compte. Si les comptes locaux de démonstration occupent déjà ces rôles, les révoquer d’abord avec la commande privée `revoke` ; leur historique reste conservé. `reset --email=…` prend un nouveau mot de passe par stdin, remplace le hash et supprime toutes les sessions du compte ; `revoke --email=…` désactive l’accès et supprime ses sessions. Chaque action est enregistrée dans `security_events`. Une seule identité active par rôle est permise en base. L’adresse et le nouveau secret doivent être remis par un canal privé vérifié ; aucun reset par email n’est configuré. Les deux comptes `example.invalid` présents localement servent uniquement à la recette visuelle, pas aux utilisatrices finales.

## 5. Tests et captures

```bash
npm run format:check
npm run lint
npm run typecheck
npm run db:migrate:test -w @voix-alumni/db
npm run test
npm run build
```

Les tests API requièrent une base **distincte** `voix_alumni_test` dans le même conteneur dédié. La créer une seule fois via `docker compose -f compose.dev.yml exec -T db sh -lc 'createdb -U "$POSTGRES_USER" voix_alumni_test'`, puis créer `.env.test` ignoré par Git avec `DATABASE_URL` pointant vers cette base. Les tests créent et retirent leurs propres identités éphémères. La CI crée automatiquement son PostgreSQL de test et fournit ses variables d’environnement.

La recette navigateur utilise l’image officielle `mcr.microsoft.com/playwright:v1.64.0-noble`, déjà présente localement ; aucune bibliothèque Chromium n’est installée sur l’hôte. Elle vise exclusivement la base `voix_alumni_e2e`, distincte de `voix_alumni_dev` et `voix_alumni_test`. Créer cette base dans le seul conteneur PostgreSQL du projet ; copier `.env.e2e.example` vers `.env.e2e` (ignoré par Git) avec `DATABASE_URL` pointant exactement vers cette base, un secret Better Auth privé et `E2E_CREDENTIALS_FILE` vers un JSON privé de deux comptes fictifs `example.invalid`. Exécuter `npm run db:migrate:e2e -w @voix-alumni/db`, puis `npm run e2e:prepare` : **cette dernière commande vide uniquement la base E2E** avant de créer les deux comptes de recette. Démarrer `npm run dev:e2e:api` (8877) et `npm run dev:e2e:web` (5174), puis lancer Playwright dans le conteneur monté avec le fichier de comptes privé. Le garde Playwright refuse une API sans marqueur E2E ; le backend E2E refuse un autre nom de base. Les captures fictives des Lots 1–4 sont sous `Docs/recette/lot-*/`. Les sorties d'échec Playwright sont placées sous `/tmp/voix-alumni-e2e-results-lot4` (éphémères dans l'image jetable) et ne doivent pas être conservées si elles contiennent des champs sensibles.

## 6. Conventions et limites

TypeScript strict, ESLint, Prettier, schémas et migrations versionnés. L’inscription publique email et Google est fermée ; Google doit d’abord être lié explicitement depuis les paramètres d’un compte préautorisé. Un `403` provient du serveur, même si l’UI affiche une rubrique. Les données de la maquette ne sont jamais chargées dans la base. Les épisodes sont fonctionnels au Lot 2 ; R2, studio, feedback et publication manuelle restent indisponibles. L’heure réelle du 25 octobre 2026 demeure à confirmer.

Avant tout déploiement, vérifier HTTPS/Caddy, cookies et origines de confiance, callback Google réel, propagation sûre de l’IP cliente au limiteur Better Auth, sauvegardes et ressources. Aucun de ces changements de production n’est autorisé par le Lot 2.

La migration `0003_famous_swarm.sql` est appliquée seulement aux bases isolées de développement, test API et E2E. `EPISODE_NUMBER_FLOOR=11` réserve les numéros 10 et 11 à deux sessions annoncées par le propriétaire ; les nouveaux épisodes confirmés prennent au minimum le numéro 12. Avant usage avec l'historique réel, importer ou réserver les lignes correspondantes, puis comparer la séquence à la source. Le changement d'heure IANA est validé côté API ; les heures locales ambiguës ou inexistantes sont refusées. L'interface affiche les instants en `jj/mm/aaaa à HH:mm`, avec offset et zone IANA. Aucun bucket ni identifiant R2 n'est configuré ; la section photo indique cette dépendance sans annoncer d'upload réussi.

Références : [architecture](07_ARCHITECTURE_TECHNIQUE.md) · [lots](12_PLAN_IMPLEMENTATION.md) · [infra](16_DEPLOIEMENT_ET_ENVIRONNEMENTS.md).

**Audit des dépendances au 21/10/2026 :** `npm audit` signale 4 avis modérés formant une seule chaîne : `drizzle-kit@0.31.11` → `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → `esbuild@0.18.20`. L’avis source [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) concerne le serveur de développement `serve` d’esbuild ≤0.24.2 et ses en-têtes CORS ; les versions esbuild utilisées par Vite/tsx sont ≥0.25. L’API Hono en exécution n’utilise pas ce serveur esbuild : la portée pratique actuelle concerne l’outillage de schéma/développement, sous réserve de vérification du paquet réellement livré en production. `npm audit --omit=dev` conserve ces quatre avis dans ce monorepo à cause du peer optionnel `drizzle-kit` de Better Auth ; ce résultat ne prouve pas une exploitation par l’API. `npm audit fix` propose un retour majeur vers `drizzle-kit@0.18.1`, incompatible avec le peer requis par Better Auth (≥0.31.4). Ne pas appliquer ce correctif automatiquement ; surveiller une version Drizzle Kit corrigeant la chaîne, tester une substitution ciblée après publication ou exclure les outils de développement de l’image d’exécution avec vérification de l’image finale.
