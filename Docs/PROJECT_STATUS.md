# État courant du projet — Voix d'Alumni Studio

> **Observé localement le 22 octobre 2026.** État de la branche de développement ; CI distante, production, sauvegarde et restauration non vérifiées.

## Git et porte de validation

- Branche de travail : `feat/lot-5-session-feedback-postproduction`, créée depuis `origin/main` `7ce9f0758c60f5c007312004a0d1fc5352d81ecb` après fusion de la PR #4. Les Lots 0–4 sont conservés. Commit local de revue créé ; lire son SHA définitif par `git rev-parse HEAD` après l'amendement de traçabilité. Arbre propre vérifié après cet amendement. Aucun push, PR, merge ni déploiement Lot 5.
- **Lot 5 implémenté localement et soumis à validation humaine, pas clôturé.** Le Lot 6 reste bloqué. L'ouverture à de vrais participants reste bloquée jusqu'à approbation d'une notice de confidentialité réelle et de sa durée de conservation.
- Migrations additives `0009`–`0011` générées et appliquées aux bases `voix_alumni_test`, `voix_alumni_e2e` et `voix_alumni_dev` après vérification de leurs noms. Aucune migration de production.

## Fonctionnalités Lot 5 observées

- Fiche épisode reliée aux vues réunion/jour J et feedback. Lien Teams manuel, secours facultatif, statut de vérification humaine, conducteur à six questions communes avec ajouts/adaptations, priorité, ordre, durée et notes privées. Responsable valide le conducteur ; seule elle confirme explicitement la tenue de la session. Rappels internes J-7/J-3/J-1/jour J/après-session recalculés en fuseau IANA : un report suspend les échéances non exécutées jusqu'à reconfirmation, préserve les rappels accomplis et signale les communications devenues obsolètes.
- Questionnaire standard à six questions, seule la note obligatoire ; variantes et notices versionnées. Le modèle approuvé inchangé peut être ouvert par Production avec confirmation ; toute variante exige Responsable. Route publique à jeton haché, sans Better Auth et sans données internes ; validation stricte, limitation par formulaire, clé d'idempotence et formulaire responsive. Réponses privées liées à leur version, résultats par épisode, moyenne/distribution, pertinence, direct/replay, texte libre, comparaison par groupe de modèle, export CSV et import historique avec prévisualisation/mapping/doublons. Suppression contrôlée et purge manuelle de rétention. Notice de recette explicitement fictive utilisée uniquement dans les bases isolées.
- Le lien du feedback ouvert peut être repris dans le brouillon du remerciement ; la copie, la validation, l'export et le constat de diffusion restent séparés. Replay YouTube référencé manuellement avec droits et preuve, transcription TXT/VTT/SRT privée avec version/import et correction/relecture, citations avec provenance et approbation Responsable. Une citation sur l'affiche finale exige une citation approuvée correspondante en base. Checklist de clôture réelle, exceptions motivées affichées, préparation Production et approbation Responsable. Archives, versions et historiques restent consultables.
- Les tâches prédéfinies intactes des étapes 5–8 se synchronisent de façon idempotente et auditée sur des événements vérifiables. Ni les tâches personnalisées ni la validation explicite d'une étape ne sont modifiées par cette synchronisation. Aucun contact direct de Production avec l'alumni, aucune création Teams, aucun upload YouTube et aucun message WhatsApp/email automatique.

## Vérifications et preuves

- Vérifié sur bases isolées : suite API Lots 1–5 **18/18** après les corrections métier ; refus Hono, concurrence de lien, reports/reconfirmation, version de formulaire après réponses, import répété, publication manuelle, droits replay, transcription VTT synthétique, citation et clôture avec dérogations.
- Playwright complet Lots 1–5 sur desktop/mobile **après les derniers correctifs : 19 réussites, 1 test desktop ignoré intentionnellement, 0 échec**. Le premier passage complet avait 17 succès, 1 ignoré et 2 échecs dus à une assertion historique de placeholder Feedback Lot 1 ; assertion actualisée après mise en service du module. Les captures historiques Lots 1–4 régénérées par Playwright ont été restaurées après la passe finale.
- Captures de la réunion, du feedback privé, du formulaire public, des résultats et de l'épisode archivé dans `Docs/recette/lot-5/`, desktop et mobile. L'archive de recette utilise deux exceptions explicites pour l'affiche finale et le message replay ; les affiches complètes restent vérifiées dans la recette Lot 4. Toutes les personnes, réponses, citations et médias de recette sont fictifs.
- `format:check`, `lint`, `typecheck`, `build`, API 18/18 et Playwright complet réussis après les derniers correctifs ; `git diff --check` réussi. Le build découpe le Studio et le Lot 5 en chargements séparés, avec un bundle principal de 448,53 Ko avant compression. Aucun usage de R2 réel n'a été revendiqué pour le Lot 5 ; le test R2 dev du Lot 4 reste une preuve distincte, issue du rapport antérieur.

## Limites et prochaine action

- Notice et rétention réelles, domaines/HTTPS publics, droits de portraits/replay/citations réels, job de purge automatique, stockage R2 de production, sauvegardes/restauration et déploiement restent non vérifiés. Le PDF de transcription est refusé faute d'extraction fiable. La limitation de débit proportionnée ne garantit pas l'unicité des répondants anonymes.
- Prochaine porte : présenter le Lot 5, ses captures et son commit local de revue au propriétaire pour validation humaine. Aucun démarrage du Lot 6.
