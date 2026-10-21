# État courant du projet — Voix d'Alumni Studio

> **Dernière actualisation :** 2026-10-21 12:46 Europe/Paris. Les résultats ci-dessous sont des observations locales ; la CI distante et la production ne sont pas vérifiées.

## Lot, phase et Git

- **Lot actuel :** Lot 2 — finition et clôture locale autorisée. Lot 1 validé par le propriétaire sur `567c938`. **Lot 3 non autorisé.**
- **Branche :** `feat/lot-2-alumni-episodes`. Base distante validée synchronisée localement par fast-forward avec `origin/main=c7fb575` (même arbre que le Lot 1 validé). À la clôture locale, le dernier commit connu est `HEAD` sur cette branche, de parent `c7fb575` ; son SHA exact figure dans le rapport final. Aucun push, PR, merge distant ou déploiement.
- **Périmètre :** seul le dépôt Voix d'Alumni est modifié. La maquette HTML est inchangée, SHA-256 vérifié `5c65b156ca85f517b9328b8843e16739602371bdf3bb0d80b89bf1a6cc3e1b5c`.

## Fonctionnalités terminées et vérifiées localement

- **Lots 0–1 :** socle TypeScript/PostgreSQL et authentification Better Auth dans Hono, rôles RESPONSABLE/PRODUCTION, inscription fermée, interface responsive. Les parcours navigateur du Lot 1 repassent dans la recette finale.
- **Vivier Lot 2 :** fiches potentielles sans épisode ; création, consultation, édition, archivage, recherche, filtres, tri et pagination ; suivi du contact réservé à la Responsable ; doublons signalés sans blocage ; audit des changements sans copie des notes privées.
- **Épisodes Lot 2 :** plusieurs épisodes par intervenant ; dates envisagée/confirmée distinctes ; zones IANA et rejet des heures locales ambiguës ou inexistantes ; confirmation, report motivé, annulation motivée, historique et version de concurrence. Les épisodes réalisés ne disposent d'aucune mutation Lot 2. Numéros 1–11 réservés ; nouveau numéro à partir de 12 après confirmation.
- **Relais :** transmission interne par la Responsable d'un épisode confirmé suffisamment renseigné ; notification Production et lecture du dossier après reconnexion. Un portrait manquant est signalé mais n'empêche pas le relais. Aucun envoi externe ni publication.
- **Interface :** écrans desktop/mobile connectés à l'API et PostgreSQL ; dates visibles et saisies en `jj/mm/aaaa HH:mm`, offset et zone IANA dans les affichages ; libellés métier clarifiés ; espace mobile sous la navigation fixe vérifié sur les formulaires longs. Huit captures Lot 2 sont issues uniquement de la base E2E fictive.

## Tests, environnements et déploiements

- **Dernière passe locale :** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` réussis après la dernière correction UI ; `npm run test` réussi avec 15 tests API ; Playwright dans l'image existante : 13 réussites, 1 test mobile ignoré sur desktop, zéro échec. Les scénarios A/B et les parcours Lot 1 sont couverts sur desktop/mobile. Garde CI local du journal réussi contre `c7fb575`, `git diff --check` et SHA de la maquette conformes.
- **Isolation :** `voix_alumni_e2e` est la seule base visée par Playwright ; API 8877 et web 5174 dédiés. Le serveur et la recette refusent une cible non E2E. Une préparation vide uniquement cette base. Vérification locale : zéro fiche des scénarios automatisés dans `voix_alumni_dev`, quatre épisodes fictifs dans E2E après la recette, numéros confirmés 12–13. Les deux comptes de recette et leurs mots de passe restent privés hors Git.
- **Environnement :** Node 24 isolé, PostgreSQL propre au projet ; environ 13 Gio disponibles au dernier contrôle après suppression automatique du conteneur Playwright jetable. Aucun bucket R2, image applicative, CI distante ou déploiement lancé. Aucun état des applications voisines n'est inféré.

## Blocages, problèmes connus et risques

- **Médias :** modèle et abstraction préparés ; aucun upload réel ni URL signée sans buckets R2 privés. Toute future publication utilisant un portrait devra vérifier les droits côté serveur (`DEC-010`).
- **Historique :** épisodes 1–9 réalisés, 10 prochaine session, 11 planifiée ultérieurement selon la correction du propriétaire. Leur reprise réelle n'est pas faite ; rapprochement avec la source historique requis avant usage métier réel (`DEC-009`).
- **Fonctions ultérieures :** demandes internes du Lot 3, publication, studio, feedback, média et clôture des épisodes hors Lot 2. Heure de la session du 25 octobre 2026 toujours à confirmer auprès de la Responsable.
- **Sécurité/production :** callback Google OAuth réel non testé ; avis npm modérés transitifs analysés au Lot 1 ; proxy de confiance, sauvegardes, R2 et ressources VPS restent des préalables de production.
- **Incident résolu :** une première exécution E2E isolée a subi une limitation Better Auth et généré des fichiers temporaires contenant les mots de passe fictifs ; ceux-ci ont été supprimés, les mots de passe tournés et les sessions révoquées. Limiteur désactivé uniquement en mode E2E avec garde de base exact. Voir le journal du 21 octobre.

## Décisions en attente et prochaine action

- Confirmer l'heure réelle de la session du 25 octobre, préparer la source d'import historique 1–11 et les futurs buckets R2 seulement aux lots autorisés. Aucun de ces points ne bloque le commit local de clôture du Lot 2.
- **Prochaine action concrète :** remettre au propriétaire le SHA du commit local, les captures, les tests et les limites, puis attendre sa validation explicite avant tout Lot 3.
