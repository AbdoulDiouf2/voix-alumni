# État courant du projet — Voix d'Alumni Studio

> **Observé localement le 21 octobre 2026 à 18:57 Europe/Paris.** La CI distante, Cloudflare R2 réel et la production ne sont pas vérifiés.

## Git et phase

- **Lot actuel :** Lot 4 — Studio créatif et communications, implémenté et testé localement ; en attente de validation du propriétaire. Lot 5 non autorisé.
- **Branche :** `feat/lot-4-creative-communications`, issue de `origin/main` `10f3939` (fusion PR #3). Le snapshot du Lot 4 est destiné à un commit local sur cette branche ; le SHA exact est à relever dans Git après commit. Aucun push, PR, merge ni déploiement autorisé ou exécuté.
- **Maquette :** `Docs/voix_alumni_studio_prototype.html` inchangée, SHA-256 `5c65b156ca85f517b9328b8843e16739602371bdf3bb0d80b89bf1a6cc3e1b5c`.

## Fonctionnalités vérifiées

- **Lots 0–3 :** fondations, authentification fermée, vivier, épisodes, relais, huit étapes, tâches, demandes internes et notifications sont conservés. La suite Playwright complète passe après le Lot 4.
- **Lot 4 :** deux modèles d'affiche Canvas 1080 × 1350 avec aperçu/export cohérents ; éditeur de champs, cadrage et noir et blanc ; six modèles de communication ; versions et historique ; brouillon, relecture, validation Responsable, export/prêt, puis publication externe constatée manuellement. Le studio, les communications et la médiathèque sont accessibles dans la navigation et depuis l'épisode. Les contenus obsolètes après modification de fiche/date sont signalés et bloqués pour nouvelle validation, export ou publication.
- **Sécurité et données :** migrations additives `0006`–`0008`, ressources privées, droits et consentement par finalité contrôlés côté Hono, rôles et versions de concurrence, publication distincte de l'export et de la copie. L'export PNG et son média sont enregistrés atomiquement ; objet supprimé si conflit. Les tâches prédéfinies intactes correspondantes se synchronisent avec preuves de contenu, sans valider d'étape ; invalidation de droits rouvre les tâches concernées avec audit.
- **Références ajoutées par le propriétaire :** `Docs/Voix d'alumni/` est conservé localement et exclu de Git. Les affiches ont servi de référence à la composition. Portraits, vidéos et profils n'ont pas été importés ni commités. Les logos ESMT/CPS ne sont pas fournis comme fichiers séparés ; aucune autorisation d'usage réelle n'est présumée.

## Tests et environnements

- **Qualité finale :** format, lint, typecheck, build, `git diff --check` réussis ; API 17/17.
- **Playwright après dernières corrections :** Lots 1–4 desktop/mobile, 17 réussites, 1 ignoré intentionnellement sur desktop, 0 échec. Captures et PNG uniquement de données fictives dans `Docs/recette/lot-4/`. Parité des pixels aperçu/PNG, export réel 1080 × 1350, publication manuelle distincte de la copie, texte trop long signalé et visibilité du bouton mobile pendant le défilement vérifiés.
- **Isolation :** migrations Lot 4 appliquées aux bases projet `voix_alumni_dev`, test et E2E ; la cible dev a été vérifiée par nom avant migration. `voix_alumni_e2e` et serveurs dédiés 8877/5174 utilisés pour Playwright. L'image Playwright locale apporte les bibliothèques Chromium manquantes sur l'hôte. Aucun bucket R2, clé ni donnée réelle créée. Le dossier propriétaire n'a pas été importé en base.

## Limites et prochaine porte

- Tester R2 avec deux buckets privés sous juridiction UE et identifiants fournis/approuvés avant toute mise en service ; l'adaptateur actuel est vérifié seulement via stockage isolé. Les logos autonomes officiels et preuves de droits pour les portraits/citations restent à fournir/valider pour une recette sur ressources réelles.
- L'heure réelle du 25 octobre 2026, l'import historique 1–11, le callback Google réel, les sauvegardes et paramètres de production restent ouverts selon les décisions antérieures. Feedback natif, Teams/YouTube, moteur post-production et Lot 5 restent hors périmètre.
- **Prochaine porte :** présenter les preuves et limites au propriétaire et attendre sa validation. Aucun push, PR, merge ou déploiement.
