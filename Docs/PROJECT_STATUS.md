# État courant du projet — Voix d'Alumni Studio

> **Dernière actualisation :** 2026-10-21 01:06 UTC, après contrôle du commit local de clôture du Lot 1.
> **Preuves :** « vérifié » désigne un contrôle de cette intervention ; « rapport antérieur » désigne une observation non rejouée ici ; « à confirmer » n'est pas un fait observé.

## Lot, phase et Git

- **Lot actuel :** Lot 1, finition implémentée et recette locale réussie ; l'orientation visuelle a été validée par le propriétaire. La clôture locale est autorisée après contrôles finaux. **Lot 2 non autorisé.**
- **Branche :** `feat/lot-1-auth-shell`. **Dernier commit :** `HEAD` sur cette branche, commit local de clôture du Lot 1 (parent `4a14442` ; consulter `git rev-parse HEAD` pour son SHA après amendement). Aucun push.
- **Arbre de travail :** propre lors du contrôle du commit amendé ; revérifier après le dernier amendement documentaire. Maquette HTML intacte, SHA-256 vérifié `5c65b156ca85f517b9328b8843e16739602371bdf3bb0d80b89bf1a6cc3e1b5c`.

## Fonctionnalités terminées et vérifiées localement

- **Lot 0 :** socle monorepo TypeScript et PostgreSQL isolé dans `4a14442`, rapport accepté par le propriétaire.
- **Lot 1 :** Better Auth dans Hono, email/mot de passe, sessions, sortie de session, provisionnement et récupération privés, interdiction d'inscription publique, garde OAuth configurée, droits RESPONSABLE/PRODUCTION en base et vérifiés côté API. Les routes d'un autre rôle renvoient `403`, les sessions expirées/supprimées `401`, les comptes révoqués `403` ; 9 tests API réussis.
- **Interface :** shell React et deux tableaux de bord vides, navigation desktop/mobile. Connexion mobile raccourcie ; à la taille mobile Playwright, le champ de mot de passe apparaît dans la hauteur initiale. Accueil saluant le premier élément du nom d'affichage ; repli « Bonjour à vous » testé. Badge de rôle conservé. Huit parcours Playwright réussis et huit captures de recette actualisées sous `Docs/recette/lot-1/`.
- **Traçabilité :** trois registres et garde-fou CI du journal préparés ; changements techniques sans nouvelle entrée datée refusés dans les scénarios locaux antérieurs. Le premier contrôle du commit a échoué à tort sous `pipefail` ; cause et correction conservées dans le journal. Le script corrigé passe contre `4a14442` sur le commit amendé ; une dernière vérification du SHA final suit l'actualisation documentaire.

## Tests, environnements et déploiements

- **Vérifié dans cette intervention :** format, lint, typecheck, build et 9 tests API réussis sous Node 24 isolé ; 8 parcours Playwright desktop/mobile réussis dans l'image officielle déjà présente ; `git diff --check` réussi. Premier passage Prettier, deux passages Playwright et premier contrôle CI sur commit ont échoué avant corrections ; l'historique est conservé dans `DEV_JOURNAL.md`.
- **Rapport antérieur :** maintien de session après redémarrage réel de l'API et exercice de réinitialisation privée ; ces contrôles manuels n'ont pas été rejoués ici.
- **Local :** API et web ont répondu HTTP `200` pendant les contrôles ; base PostgreSQL dédiée au projet. Environ 8,6 Gio disponibles observés. Deux comptes fictifs `example.invalid` utilisent des prénoms fictifs pour les captures ; leurs secrets restent hors dépôt.
- **Externe :** CI distante non exécutée ; aucun push, déploiement, bucket R2 ou modification de production dans cette intervention. L'état des applications voisines n'est pas déduit de ce dépôt.

## Restant, blocages et risques

- **Google OAuth :** callback et liaison réels non testés de bout en bout sans identifiants, projet Google et URI approuvés ; le rejet du fournisseur non configuré et la garde d'identité sont testés localement. La fermeture de l'inscription OAuth en situation réelle reste à prouver.
- **Dépendances :** 4 avis npm modérés sur une seule chaîne Drizzle Kit → esbuild ancien. L'avis source vise `esbuild serve` de développement. L'API Hono ne l'utilise pas à l'exécution, mais l'audit `--omit=dev` conserve l'avis à cause d'un peer optionnel ; vérifier la composition exacte de l'image avant production. Le correctif automatique proposé rétrograde Drizzle Kit sous la contrainte Better Auth ; non appliqué. Analyse dans `Docs/11_GUIDE_DEVELOPPEMENT.md`.
- **Infrastructure :** proxy de confiance/IP du limiteur Better Auth, sauvegardes, R2 privé UE, ressources du VPS et restauration restent à traiter avant production. Ne toucher ni aux autres applications ni à leurs volumes.
- **Métier :** heure réelle de la session du 25 octobre 2026 et droits médias/consentements restent à confirmer. Les fonctionnalités des Lots 2 et suivants ne sont pas commencées.

## Décisions et prochaine action

- **Décisions approuvées :** `DEC-001` à `DEC-008` dans `Docs/DECISIONS.md`. Aucune nouvelle décision structurante n'a été approuvée pendant cette finition ; le registre n'a pas besoin d'une nouvelle entrée.
- **À valider :** recette Google réelle avec comptes nominatifs autorisés, canal privé de remise des accès et futurs choix de production. La validation de l'orientation visuelle du Lot 1 est acquise ; elle ne vaut pas autorisation du Lot 2.
- **Prochaine action concrète :** remettre au propriétaire le rapport final, le SHA du commit local et les captures ; attendre l'autorisation expresse du Lot 2. Attendre une autorisation explicite avant le Lot 2.
