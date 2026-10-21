# État courant du projet — Voix d'Alumni Studio

> **Observé localement le 21 octobre 2026.** La CI distante, la production, les sauvegardes et leur restauration ne sont pas vérifiées.

## Git et phase

- **Lot 4 :** design des deux affiches et orientation UX officiellement validés par le propriétaire ; finition, recette R2 et non-régression réalisées localement. Commit local de clôture créé sur `feat/lot-4-creative-communications` ; le SHA courant est celui de `git rev-parse HEAD`. Arbre propre après clôture. Aucun push, PR, merge ou déploiement autorisé ; Lot 5 bloqué.
- La branche part de `origin/main` `10f3939` (fusion de la PR #3). Le commit porte sur le code du Lot 4, ses tests, captures et registres. Les originaux de `Docs/Voix d'alumni/` et `.env` restent ignorés par Git.
- La maquette `Docs/voix_alumni_studio_prototype.html` reste inchangée (SHA-256 `5c65b156ca85f517b9328b8843e16739602371bdf3bb0d80b89bf1a6cc3e1b5c`).

## Fonctionnalités vérifiées

- **Lots 0–3 :** authentification fermée, vivier, épisodes, relais, huit étapes, tâches, demandes internes et notifications conservés ; parcours desktop/mobile couverts par la suite complète.
- **Affiches :** deux modèles Canvas 1080 × 1350, portrait dominant, identité officielle ESMT/CPS/Voix d’Alumni, citation mise en avant, gestion des textes longs et des débordements. Aperçu et export PNG ont des pixels identiques dans la recette. Les originaux des logos sont privés et hors Git ; les portraits de test sont synthétiques.
- **Studio et communications :** édition desktop/mobile, versions et historiques repliables, modèles de messages à variables résolues, copie identique à l’aperçu, liens obligatoires signalés. Validation Responsable, export Production et constat de publication Production restent des événements distincts. Le bouton de publication demande canal et confirmation ; l’API exige aussi `confirmed_external_publication: true`, contrôle le rôle et la version, puis conserve canal, auteur, date réelle et version. Une seconde publication de la même version est refusée.
- **Données et sécurité :** migrations additives `0006`–`0008`, PostgreSQL, droits et consentement par finalité côté Hono, versions de concurrence, révisions et audit. Révocation des droits bloque une publication ultérieure et invalide le contenu concerné. Aucun message externe n’est envoyé.

## Recette R2 de développement

- Bucket privé préexistant `voix-alumni-dev`, endpoint HTTPS de juridiction UE et base `voix_alumni_e2e` vérifiés sans afficher d’identifiants. API et frontend dédiés exécutés en Node 24.
- Upload via l’application de portraits synthétiques et des logos de recette ; métadonnées, empreintes, droits, consentements et publications vérifiés en PostgreSQL. Les médias récupérés depuis R2 ont alimenté l’aperçu réel ; quatre PNG exportés et téléchargés sur desktop/mobile, dimensions 1080 × 1350 et pixels égaux à l’aperçu.
- Accès API sans session refusé. Le bucket refuse une requête non signée ; URL signée courte valide avant expiration et refusée après expiration. Révocation testée avant une tentative de publication. La première passe a créé 28 objets temporaires, la passe finale 14 ; tous ont été supprimés individuellement et leur absence confirmée. La base E2E a été réinitialisée ensuite. Aucun bucket créé ni média personnel importé.

## Tests finaux

- Après les dernières corrections, `format:check`, `lint`, `typecheck`, `build`, `git diff --check` réussis ; API **17/17**.
- Playwright complet Lots 1–4, desktop/mobile : **17 réussites, 1 ignoré intentionnellement sur desktop, 0 échec**. Recette R2 ciblée finale : **2/2**. Captures et PNG de test dans `Docs/recette/lot-4/` ; captures historiques Lots 1–3 restaurées après exécution.
- Un premier passage Playwright complet a échoué sur deux assertions d’auteur car il utilisait un ancien serveur API démarré avant la correction ; un nouveau serveur exécutant le code courant a passé la suite complète. L’incident est consigné dans `DEV_JOURNAL.md`.

## Limites et prochaine porte

- Restent pour le lot de stabilisation : droits et preuves des portraits/citations réels, contrôle de la configuration privée et du moindre privilège du bucket, sauvegarde/restauration, bucket de production et préparation de production. Ces points ne sont pas déclarés réalisés.
- L’heure réelle de l’épisode du 25 octobre 2026, l’import historique 1–11 et le callback Google réel restent ouverts selon les décisions antérieures. Feedback natif, Teams, YouTube et Lot 5 ne font pas partie du Lot 4.
- **Prochaine porte :** transmettre le commit local et les preuves au propriétaire ; attendre une autorisation distincte avant push, PR, merge ou déploiement.
