# Voix d’Alumni Studio — Référentiel de projet

> Gestion collaborative des sessions « Voix d’Alumni », de la proposition d’un intervenant à la clôture de l’épisode. Documentation initiale destinée aux deux organisateurs et à l’agent de développement.

## Statut au 21 octobre 2026

- **Produit :** proposition fonctionnelle et maquette interactive validées par le porteur du projet ; **pas encore une application en production**.
- **Dépôt :** `https://github.com/AbdoulDiouf2/voix-alumni` ; dossier `Docs/` existant côté poste de développement, contenant la maquette HTML.
- **Référentiel source :** les présents Markdown définissent les attentes ; le code, les configurations et la production sont à auditer avant toute décision de migration/déploiement.
- **Organisation :** deux utilisatrices/utilisateurs internes à l'origine : la **Responsable** recherche, contacte et anime ; la **Production** prépare et suit l'ensemble des autres étapes. **La Responsable est l'unique interlocutrice de l'alumni.**
- **Portée :** gestion interne de l'initiative, **pas** CRM générique, pas SaaS multi-tenant, pas gestion publique des inscriptions dans le MVP.

## Parcours nominal

1. Alumni identifié et contacté par la Responsable (fiche pouvant rester en vivier).
2. Participation et créneau confirmés, puis **passage de relais interne**.
3. Production vérifie profil, photo et droits ; prépare les questions ; demande les précisions à la Responsable.
4. Création de l'affiche d'annonce, texte et validations ; publication communautaire constatée manuellement.
5. Lien de réunion, formulaire et rappels prêts ; calcul des échéances depuis une heure et un fuseau confirmés.
6. Responsable anime ; Production assiste à la coordination si nécessaire ; enregistrement uniquement autorisé.
7. Remerciement « à chaud » et feedback communautaire.
8. Replay YouTube, transcription relue, affiche/citation finales, archivage et clôture.

## Ordre de lecture conseillé pour Codex

1. **`AGENTS.md`** — règles de travail non négociables, droits, validations.
2. **`Docs/PROJECT_STATUS.md` et dernières entrées de `Docs/DEV_JOURNAL.md`**, puis `Docs/DECISIONS.md` — état réel, historique et décisions approuvées.
3. `Docs/01_VISION_ET_PERIMETRE.md` + `Docs/02_WORKFLOWS_ET_REGLES_METIER.md` — pourquoi, pour qui, et quelles transitions.
4. `Docs/03_SPECIFICATIONS_FONCTIONNELLES.md` + `Docs/04_ROLES_ET_PERMISSIONS.md` + `Docs/05_DESIGN_SYSTEM_ET_UX.md` — comportement attendu et fidélité UX.
5. `Docs/07_ARCHITECTURE_TECHNIQUE.md` à `Docs/11_GUIDE_DEVELOPPEMENT.md` — solutions techniques **proposées**, à confronter à l'état réel.
6. **`Docs/12_PLAN_IMPLEMENTATION.md`** — exécuter les lots dans l'ordre et s'arrêter à chaque point de validation.
7. `Docs/13_SECURITE_ET_CONFIDENTIALITE.md` à `Docs/19_RECETTE_FINALE_ET_GO_LIVE.md` — qualité, reprise des données, exploitation et mise en service.

## Index du suivi permanent

| Fichier | Rôle |
|---|---|
| [État courant](Docs/PROJECT_STATUS.md) | Source de vérité opérationnelle, preuves, blocages et prochaine action |
| [Journal de développement](Docs/DEV_JOURNAL.md) | Entrées chronologiques conservées, succès, échecs et corrections |
| [Décisions](Docs/DECISIONS.md) | Décisions structurantes, statuts et remplacements |

## Index des 19 fiches métier/techniques

| Fichier | Finalité |
|---|---|
| [01 — Vision et périmètre](Docs/01_VISION_ET_PERIMETRE.md) | Objectifs, MVP et exclusions |
| [02 — Workflows et règles métier](Docs/02_WORKFLOWS_ET_REGLES_METIER.md) | Machines d'état, relais et invariants |
| [03 — Spécifications fonctionnelles](Docs/03_SPECIFICATIONS_FONCTIONNELLES.md) | Écrans, comportements, critères d'acceptation |
| [04 — Rôles et permissions](Docs/04_ROLES_ET_PERMISSIONS.md) | Accès, autorisations et validations |
| [05 — Design system et UX](Docs/05_DESIGN_SYSTEM_ET_UX.md) | Maquette, charte, responsive, accessibilité |
| [06 — Communications et templates](Docs/06_COMMUNICATIONS_ET_TEMPLATES.md) | Messages, visuels, questions |
| [07 — Architecture technique](Docs/07_ARCHITECTURE_TECHNIQUE.md) | Architecture cible et ADR |
| [08 — Modèle de données](Docs/08_MODELE_DE_DONNEES.md) | Entités, relations, contraintes |
| [09 — Contrats API](Docs/09_CONTRATS_API.md) | API REST, exemples et erreurs |
| [10 — Automatisations et intégrations](Docs/10_AUTOMATISATIONS_ET_INTEGRATIONS.md) | Rappels, idempotence, Teams/YouTube |
| [11 — Guide de développement](Docs/11_GUIDE_DEVELOPPEMENT.md) | Setup, conventions et outils |
| [12 — Plan d'implémentation](Docs/12_PLAN_IMPLEMENTATION.md) | Lots 0 à 7 et portes de validation |
| [13 — Sécurité et confidentialité](Docs/13_SECURITE_ET_CONFIDENTIALITE.md) | Auth, droits, médias, vie privée |
| [14 — Plan de tests et recette](Docs/14_PLAN_DE_TESTS_ET_RECETTE.md) | Tests par risques + E2E |
| [15 — Migration historique](Docs/15_MIGRATION_HISTORIQUE.md) | Import du tableur et fichiers anciens |
| [16 — Déploiement et environnements](Docs/16_DEPLOIEMENT_ET_ENVIRONNEMENTS.md) | Dev/prod, Caddy, migrations, rollback |
| [17 — Exploitation et maintenance](Docs/17_EXPLOITATION_ET_MAINTENANCE.md) | Monitoring, sauvegardes, incidents |
| [18 — Guide utilisateur](Docs/18_GUIDE_UTILISATEUR.md) | Manuel Responsable et Production |
| [19 — Recette finale et go-live](Docs/19_RECETTE_FINALE_ET_GO_LIVE.md) | Vérification à deux et lancement |

**Convention de comptage :** le pack initial comptait 21 Markdown (ce `README.md`, `AGENTS.md` et 19 documents numérotés). Les trois registres permanents portent ce total à 24. L'index documentaire est intégré ici ; la maquette HTML reste inchangée.

## Installation locale et état du Lot 2

Le socle TypeScript et les fonctions des Lots 1–4 fonctionnent localement : authentification fermée, vivier, épisodes, parcours, studio d'affiches et communications. Utiliser Node 24 (`.nvmrc`), `npm ci`, créer `.env` depuis `.env.example`, démarrer le PostgreSQL isolé, puis appliquer les migrations Drizzle avec `npm run db:migrate -w @voix-alumni/db`. Lancer `npm run dev:api` et `npm run dev:web`. Le provisionnement des deux comptes passe par une commande privée ; voir [`Docs/11_GUIDE_DEVELOPPEMENT.md`](Docs/11_GUIDE_DEVELOPPEMENT.md). Google OAuth réel et Cloudflare R2 réel ne sont pas vérifiés sans identifiants/buckets autorisés. Aucun envoi externe ni déploiement n'est réalisé par le Lot 4.

## Conventions de décision et de maintenance documentaire

- Mentionner explicitement **VALIDÉ**, **PROPOSÉ**, **À CONFIRMER**, **REPORTÉ**, **NON IMPLÉMENTÉ** pour distinguer faits, intentions et code.
- En cas de contradiction : décisions humaines récentes > règles métier approuvées > spécifications écrites > maquette (illustrative) > suppositions de l'agent. Toute divergence significative se traite par question ciblée, sans invention.
- Pour chaque intervention significative, actualiser le journal puis le statut avant la réponse finale ; inscrire immédiatement toute décision structurante approuvée. Une fonctionnalité n'est pas terminée si sa traçabilité reste incomplète.
- Les noms et cases de la maquette sont **illustratifs** ; aucun statut réel ne doit en être déduit. Le propriétaire a précisé séparément que les épisodes 1–9 sont réalisés, le 10 est la prochaine session et le 11 est planifié plus tard. Les données de ces épisodes ne sont pas encore importées.
- **Attention fuseaux horaires :** le 25 octobre 2026 est un jour de changement d'heure en France. Une affiche « 18 h GMT+2 » ne suffit pas à déduire « 18 h Europe/Paris » ; confirmer l'instant réel avant toute notification.

## Gouvernance du dépôt

- Créer une branche de travail par lot, proposer un diff et demander validation aux portes prévues.
- Aucun push, merge, déploiement, envoi externe ou mutation de données réelles implicitement autorisé par la présente documentation.
- Ne pas committer `*.env`, exports de contacts, réponses personnelles de feedback, captures contenant des numéros ou médias dont les droits ne sont pas validés.
