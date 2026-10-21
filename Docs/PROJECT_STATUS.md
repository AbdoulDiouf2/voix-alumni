# État courant du projet — Voix d'Alumni Studio

> **Dernière actualisation :** 2026-10-21 14:42 Europe/Paris. Les résultats ci-dessous sont des observations locales ; la CI distante et la production ne sont pas vérifiées.

## Lot, phase et Git

- **Lot actuel :** Lot 3 corrigé et testé localement après retour du propriétaire ; commit local de clôture autorisé après contrôles ; validation humaine finale attendue avant le Lot 4.
- **Branche :** `feat/lot-3-workflows`, commit local de clôture créé depuis `c211c60`, documentation post-commit à inclure par amendement local ; les modifications documentaires préexistantes ont été conservées. Aucun push, PR, merge distant ni déploiement.
- **Périmètre :** seul le dépôt Voix d'Alumni est modifié. La maquette HTML est inchangée, SHA-256 vérifié `5c65b156ca85f517b9328b8843e16739602371bdf3bb0d80b89bf1a6cc3e1b5c`.

## Fonctionnalités terminées et vérifiées localement

- **Lots 0–1 :** socle TypeScript/PostgreSQL et authentification Better Auth dans Hono, rôles RESPONSABLE/PRODUCTION, inscription fermée, interface responsive. Les parcours navigateur du Lot 1 repassent dans la recette finale.
- **Vivier Lot 2 :** fiches potentielles sans épisode ; création, consultation, édition, archivage, recherche, filtres, tri et pagination ; suivi du contact réservé à la Responsable ; doublons signalés sans blocage ; audit des changements sans copie des notes privées.
- **Épisodes Lot 2 :** plusieurs épisodes par intervenant ; dates envisagée/confirmée distinctes ; zones IANA et rejet des heures locales ambiguës ou inexistantes ; confirmation, report motivé, annulation motivée, historique et version de concurrence. Les épisodes réalisés ne disposent d'aucune mutation Lot 2. Numéros 1–11 réservés ; nouveau numéro à partir de 12 après confirmation.
- **Relais :** transmission interne par la Responsable d'un épisode confirmé suffisamment renseigné ; notification Production et lecture du dossier après reconnexion. Un portrait manquant est signalé mais n'empêche pas le relais. Aucun envoi externe ni publication.
- **Interface :** écrans desktop/mobile connectés à l'API et PostgreSQL ; dates visibles et saisies en `jj/mm/aaaa HH:mm`, offset et zone IANA dans les affichages ; libellés métier clarifiés ; espace mobile sous la navigation fixe vérifié sur les formulaires longs. Huit captures Lot 2 sont issues uniquement de la base E2E fictive.
- **Lot 3 :** 24 tâches prédéfinies réparties sur huit étapes et copiées par épisode, tâches personnalisées, adaptation du titre/propriétaire/caractère obligatoire/échéance dans le fuseau IANA, statut et commentaire ; validations d'étapes séparées ; progression et historique ; demandes internes adressées côté serveur uniquement à la Responsable ; réponses et résolution distinctes ; notifications internes lues/non lues. Trois tâches prédéfinies intactes sont synchronisées de manière idempotente et auditée avec contact effectif, confirmation et relais ; fiche à vérifier et tâches adaptées restent manuelles. Les étapes distinguent « À venir », « En cours », « Tâches terminées » et « Étape validée », avec plusieurs étapes actives possibles. Mobile compact à étapes, demandes et historiques repliables ; historique affiché en français. Les tâches de publication, tenue de session, replay et partage de feedback restent non terminables avant leurs modules métier. Quatre captures Lot 3 fictives desktop/mobile, dont deux vues ciblées du parcours, générées et la vue desktop inspectée.

## Tests, environnements et déploiements

- **Dernière passe locale après toutes les corrections :** 16/16 tests API ; suite Playwright complète Lots 1–3 desktop/mobile : 15 réussites, 1 test mobile ignoré sur desktop, zéro échec ; format, lint, typecheck, build et `git diff --check` réussis. Les scénarios couvrent le correctif backend des réponses répétées, la synchronisation des événements, les règles de validation, les demandes et notifications, les rôles, le report et les versions concurrentes. CI distante et production non vérifiées.
- **Isolation :** `voix_alumni_e2e` est la seule base visée par Playwright ; API 8877 et web 5174 dédiés. Le serveur et la recette refusent une cible non E2E. Préparation limitée à cette base. Les migrations additives `0004` et `0005` ont été appliquées aux bases propres au projet dev/test/E2E ; aucun schéma d'une autre application modifié. Le nombre actuel de données E2E n'est pas inventorié ; la base dev n'a pas reçu de fixture de la recette Lot 3. Les comptes fictifs restent privés hors Git.
- **Environnement :** Node 24 isolé, PostgreSQL propre au projet ; environ 13 Gio disponibles au dernier contrôle après suppression automatique du conteneur Playwright jetable. Aucun bucket R2, image applicative, CI distante ou déploiement lancé. Aucun état des applications voisines n'est inféré.

## Blocages, problèmes connus et risques

- **Médias :** modèle et abstraction préparés ; aucun upload réel ni URL signée sans buckets R2 privés. Toute future publication utilisant un portrait devra vérifier les droits côté serveur (`DEC-010`).
- **Historique :** épisodes 1–9 réalisés, 10 prochaine session, 11 planifiée ultérieurement selon la correction du propriétaire. Leur reprise réelle n'est pas faite ; rapprochement avec la source historique requis avant usage métier réel (`DEC-009`).
- **Fonctions ultérieures :** publication, studio, feedback, média, constat de session et clôture des épisodes hors Lot 3. Heure de la session du 25 octobre 2026 toujours à confirmer auprès de la Responsable.
- **Sécurité/production :** callback Google OAuth réel non testé ; avis npm modérés transitifs analysés au Lot 1 ; proxy de confiance, sauvegardes, R2 et ressources VPS restent des préalables de production.
- **Incident résolu :** une première exécution E2E isolée a subi une limitation Better Auth et généré des fichiers temporaires contenant les mots de passe fictifs ; ceux-ci ont été supprimés, les mots de passe tournés et les sessions révoquées. Limiteur désactivé uniquement en mode E2E avec garde de base exact. Voir le journal du 21 octobre.

## Décisions en attente et prochaine action

- Confirmer l'heure réelle de la session du 25 octobre, préparer la source d'import historique 1–11 et les futurs buckets R2 seulement aux lots autorisés. Les actions métier de publication et de replay requièrent les lots suivants.
- **Prochaine action concrète :** inclure le contrôle post-commit dans le commit local autorisé, vérifier l'arbre Git et remettre captures et résultats au propriétaire ; attendre sa validation finale du Lot 3 avant tout Lot 4. Aucune action distante autorisée.
