# État courant du projet — Voix d'Alumni Studio

> **Observé localement le 22 octobre 2026.** Production, CI distante, sauvegardes et restauration non vérifiées.

## Git et porte de validation

- Branche : `feat/lot-5-session-feedback-postproduction`, issue de `origin/main` `7ce9f0758c60f5c007312004a0d1fc5352d81ecb` après fusion de la PR #4. Dernier commit avant cette intervention : `47a063db664e2ee2a81fa7c35f3be82c5e5d0bf9`. Le propriétaire a accepté fonctionnellement le Lot 5 et autorisé un commit **local** de clôture après la recette ciblée. Aucun push, PR, merge, déploiement ni démarrage du Lot 6.
- Lots 0–4 préservés. Migrations additives `0009`–`0016` appliquées uniquement à `voix_alumni_test`, `voix_alumni_e2e` et `voix_alumni_dev`, après contrôle des noms. Aucune migration de production.
- Le Lot 5 est techniquement vérifié localement. L'ouverture à de vrais participants reste bloquée jusqu'à approbation humaine de la notice, de la durée et des informations de traitement ; la préparation de production reste distincte.

## Fonctionnalités et dernières corrections vérifiées

- Réunion et jour J : lien Teams saisi et vérifié manuellement, conducteur versionné, validation Responsable, constat explicite de séance tenue, rappels internes recalculés selon fuseau IANA. Un report suspend les rappels pendants jusqu'à reconfirmation et conserve les rappels accomplis.
- Feedback : six questions standard dont seule la note obligatoire, variantes validées, formulaire public à jeton haché, réponses liées à leur version, résultats, CSV et import historique avec prévisualisation. La copie du lien n'est pas une publication. La durée initiale de l'interface et les fixtures sont alignées sur **180 jours proposés après dépôt**, sans approbation de notice réelle. Le logo horizontal officiel est visible sur le formulaire public ; l'original privé reste hors Git.
- Une ouverture réelle est refusée côté API tant que l'accord explicite, l'identité et le contact du responsable, la base juridique, l'hébergement et le lien de notice ne sont pas configurés. Les tests E2E utilisent une notice explicitement fictive ; le texte indique qu'un commentaire libre peut identifier son auteur.
- Une commande de purge régulière est prête, **sans ordonnanceur installé** : verrou PostgreSQL, lots transactionnels, effacement des réponses expirées et des empreintes, journal des exécutions et des échecs. La purge manuelle Responsable utilise le même moteur. Les imports historiques utilisent actuellement la date d'import comme date de dépôt, faute de date source.
- Post-production : replay YouTube référencé manuellement avec droits, transcription privée TXT/VTT/SRT et relecture, citations sourcées et approuvées, remerciement distinct de sa diffusion, clôture avec checklist et dérogations motivées. Une archive refuse les mutations ordinaires en API et dans PostgreSQL ; la clôture ferme le formulaire public et révoque son jeton dans la même transaction. Une révocation de droits médias reste possible pour la Responsable avec audit. Aucune réouverture n'est disponible en V1.
- Aucune création Teams, publication YouTube, diffusion email/WhatsApp ni contact direct de Production avec un intervenant.

## Recette locale après toutes les corrections

- API complète Lots 1–5 : **19/19 réussis**, 0 échec. Les tests couvrent notamment l'archive, les refus de mutation API et SQL, la révocation de droits avec audit, la fermeture du formulaire, la purge d'une réponse importée expirée, le journal d'auteur et l'idempotence.
- Playwright complet Lots 1–5, desktop/mobile : **19 réussis, 1 ignoré intentionnellement, 0 échec**. Dernière passe après la correction des droits médias et du backend des réponses répétées. Dix captures Lot 5 actualisées dans `Docs/recette/lot-5/` ; les anciennes captures Lots 1–4 régénérées automatiquement ont été restaurées. Formulaire public et feedback privé mobiles inspectés visuellement : logo chargé, notice fictive et 180 jours visibles.
- `format:check`, `lint`, `typecheck`, `build` : réussis après les derniers changements de code. Commande de purge exécutée sur la base E2E isolée : statut `completed`, 0 réponse éligible. La recette R2 du Lot 4 est issue d'un rapport antérieur ; **aucune recette R2 réelle du Lot 5 n'est revendiquée**.

## Limites et prochaine action

- La notice de `Docs/PROPOSITION_NOTICE_FEEDBACK.md` est une **proposition non approuvée**. Les 180 jours sont une orientation soumise à validation humaine. Identité/contact du responsable, base juridique, hébergement, durée des sauvegardes, modalités d'import réel, ordonnanceur et alertes de purge doivent être finalisés avant collecte réelle.
- Les sauvegardes anciennes peuvent contenir des réponses jusqu'à leur expiration propre ; restauration et repurge, stockage R2 réel du Lot 5, droits réels des médias, sécurité de configuration de production, CI distante et déploiement restent non vérifiés. Les fixtures sont synthétiques, sans participant réel.
- Commit local de clôture créé sur la branche indiquée ; SHA définitif donné par `git rev-parse HEAD`. Arbre de travail propre après commit. Prochaine porte : autorisation distincte pour toute publication ou Lot 6.
