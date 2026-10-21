# Registre des décisions structurantes

Ce registre conserve les décisions approuvées et leurs remplacements. Une nouvelle décision reçoit un identifiant stable `DEC-XXX` ; une décision remplacée reste lisible, passe à `REMPLACÉE` et pointe vers son successeur. Les dates ci-dessous proviennent des documents et des instructions du propriétaire datés du 21 octobre 2026 ; l'heure exacte des validations antérieures à ce registre n'est pas vérifiable. Les conséquences indiquent ce qui est effectif et ce qui reste à réaliser.

## DEC-001 — Architecture TypeScript de bout en bout

- **Date :** 2026-10-21 (heure de validation non vérifiable).
- **Contexte :** la documentation initiale mentionnait FastAPI/Python ; le propriétaire a explicitement abandonné cette piste.
- **Alternatives documentées :** FastAPI/Python ; monorepo TypeScript.
- **Décision :** React + TypeScript + Vite, Tailwind CSS et shadcn/ui côté web ; Node.js + Hono côté API ; Drizzle + PostgreSQL ; `packages/contracts` pour les types et validations partagés ; monolithe modulaire.
- **Justification :** décision architecturale explicite du propriétaire ; cohérence d'un seul langage sur l'ensemble de l'application.
- **Conséquences :** socle et premiers contrats partagés implémentés aux Lots 0–1 ; fonctions métier encore à développer. Aucun service FastAPI à ajouter.
- **Statut :** VALIDÉE, implémentation partielle conforme aux lots.
- **Source :** instructions du propriétaire ; `Docs/07_ARCHITECTURE_TECHNIQUE.md` ; commit local `4a14442` pour le socle du Lot 0.

## DEC-002 — Authentification fermée dans Hono

- **Date :** 2026-10-21 (heure de validation non vérifiable).
- **Contexte :** application privée destinée à deux comptes nominatifs.
- **Alternatives documentées :** service d'authentification séparé ; Better Auth intégré au processus Hono. La création publique de comptes a été explicitement écartée.
- **Décision :** Better Auth dans Hono, email/mot de passe et Google OAuth, sans inscription publique y compris via OAuth ; provisionnement administratif privé ; liaison Google explicite à un compte préautorisé ; rôles `RESPONSABLE` et `PRODUCTION` vérifiés côté serveur.
- **Justification :** préserver le périmètre fermé et éviter qu'une adresse Google vérifiée ne crée seule une autorisation.
- **Conséquences :** Lot 1 implémente sessions, contrôle d'accès, commande privée et récupération administrative. La validation du callback Google réel reste en attente des identifiants OAuth ; aucun compte nominatif final n'est provisionné.
- **Statut :** VALIDÉE, flux Google réel NON VÉRIFIÉ.
- **Source :** instructions du propriétaire ; `Docs/04_ROLES_ET_PERMISSIONS.md`, `Docs/13_SECURITE_ET_CONFIDENTIALITE.md`.

## DEC-003 — Stockage média privé Cloudflare R2

- **Date :** 2026-10-21 (heure de validation non vérifiable).
- **Contexte :** médias privés et vidéos originales potentiellement volumineuses ; VPS partagé et espace limité.
- **Alternatives documentées :** disque local du VPS comme stockage principal ; Cloudflare R2 S3 compatible derrière une abstraction de stockage.
- **Décision :** deux buckets privés distincts développement/production avec restriction de juridiction UE, droits minimaux, URLs temporaires signées et métadonnées PostgreSQL ; originaux volumineux hors VPS ; copie indépendante des médias critiques.
- **Justification :** confidentialité, maîtrise de l'espace disque et possibilité de migration du fournisseur.
- **Conséquences :** interface de stockage préparée au Lot 0, modèle `media_assets` ajouté au Lot 2 et adaptateur S3/R2 de juridiction UE implémenté localement au Lot 4. Aucun bucket ni identifiant créé ; transfert R2 réel, sauvegarde et restauration non testés.
- **Statut :** VALIDÉE, adaptateur local testé via stockage isolé ; R2 réel NON VÉRIFIÉ.
- **Vérification ultérieure du 2026-10-21 :** aller-retour réel réussi dans le bucket de développement déjà configuré, avec objet temporaire supprimé. Les propriétés de confidentialité et de sauvegarde du bucket et le bucket de production ne sont pas encore vérifiés ; le choix de `DEC-003` ne change pas.
- **Source :** instructions du propriétaire ; `Docs/07_ARCHITECTURE_TECHNIQUE.md`, `Docs/16_DEPLOIEMENT_ET_ENVIRONNEMENTS.md`.

## DEC-004 — Responsabilités et preuve de publication

- **Date :** 2026-10-21 (heure de validation non vérifiable).
- **Contexte :** Production prépare visuels et messages ; Responsable gère la relation avec l'alumni et peut valider les contenus.
- **Alternatives documentées :** considérer génération ou copie d'un message comme publication ; confirmation manuelle distincte.
- **Décision :** la publication n'est enregistrée qu'après confirmation manuelle avec historique de l'épisode ; Teams, WhatsApp et YouTube restent manuels ou semi-manuels en V1.
- **Justification :** l'application ne peut pas déduire la diffusion réelle d'un aperçu, d'une génération ou d'une copie.
- **Conséquences :** règle documentée dès le Lot 1 ; le Lot 4 ajoute la confirmation manuelle avec canal, auteur, date, version et preuve facultative, séparée de l'export et de la copie.
- **Statut :** VALIDÉE, implémentation locale du constat testée au Lot 4 ; diffusion externe non automatisée.
- **Source :** instructions du propriétaire ; `Docs/02_WORKFLOWS_ET_REGLES_METIER.md`, `Docs/04_ROLES_ET_PERMISSIONS.md`.

## DEC-005 — Feedback natif et consentements

- **Date :** 2026-10-21 (heure de validation non vérifiable).
- **Contexte :** recueillir les retours et reprendre l'historique sans exposer des données personnelles inutilement.
- **Alternatives documentées :** formulaire natif V1 et import historique ; aucune autre solution retenue n'est détaillée dans les preuves disponibles.
- **Décision :** réponses anonymes par défaut sauf identification demandée explicitement, conservation configurable, suppression individuelle, statistiques seulement si réellement anonymisées ; modéliser les consentements portraits, enregistrements et replays.
- **Justification :** minimiser les données et distinguer les différentes autorisations d'usage.
- **Conséquences :** règles documentées ; consentement de portrait par finalité implémenté au Lot 4. Formulaire de feedback, import et consentement de replay restent à réaliser aux lots autorisés.
- **Statut :** VALIDÉE, mise en œuvre partielle au Lot 4.
- **Source :** instructions du propriétaire ; `Docs/08_MODELE_DE_DONNEES.md`, `Docs/13_SECURITE_ET_CONFIDENTIALITE.md`.

## DEC-006 — Déploiement futur isolé sur l'infrastructure partagée

- **Date :** 2026-10-21 (heure de validation non vérifiable).
- **Contexte :** VPS partagé avec d'autres applications et espace disque restreint.
- **Alternatives documentées :** installation globale de Node 24 et bibliothèques Chromium sur l'hôte ; Node isolé et Playwright en environnement de test adapté.
- **Décision :** Node 24 isolé par projet/conteneur ; Docker Compose + Caddy selon les conventions `maadec-infra-01` pour un déploiement futur ; aucune modification des stacks voisines, aucun nettoyage global ; priorité au rendu PNG navigateur avant d'envisager Chromium serveur.
- **Justification :** préserver les ressources et les applications voisines.
- **Conséquences :** Node isolé et test Playwright en conteneur aux Lots 0–1 ; aucune image applicative ni déploiement créé. Dimensionnement, proxy de confiance et sauvegardes restent des portes de production.
- **Statut :** VALIDÉE, déploiement NON AUTORISÉ.
- **Source :** instructions du propriétaire ; `Docs/16_DEPLOIEMENT_ET_ENVIRONNEMENTS.md`.

## DEC-007 — Maquette validée et fuseaux IANA

- **Date :** 2026-10-21 (heure de validation non vérifiable).
- **Contexte :** maquette HTML déjà approuvée ; ambiguïté de l'heure annoncée le 25 octobre 2026 lors du changement d'heure en France.
- **Alternatives documentées :** se fier à un décalage fixe `GMT+2` ; conserver un fuseau IANA et confirmer l'instant réel.
- **Décision :** garder intégralement la maquette comme référence UX/visuelle sans la modifier ; utiliser des fuseaux IANA ; ne pas figer l'horaire de la session du 25 octobre avant confirmation de la Responsable.
- **Justification :** fidélité à l'UX validée et prévention d'une annonce à un instant erroné.
- **Conséquences :** shell Lot 1 et écrans Lot 2 inspirés de la maquette ; validation IANA et rejet des heures locales ambiguës/inexistantes côté API. Aucune donnée illustrative de la maquette n'est traitée comme événement réel. Horaire du 25 octobre toujours À CONFIRMER.
- **Statut :** VALIDÉE ; horaire métier NON CONFIRMÉ.
- **Source :** instructions du propriétaire ; `Docs/05_DESIGN_SYSTEM_ET_UX.md`, `Docs/12_PLAN_IMPLEMENTATION.md`.

## DEC-008 — Traçabilité documentaire permanente

- **Date :** 2026-10-21 ; décision explicite dans la présente intervention, heure d'approbation non fournie.
- **Contexte :** garantir la continuité du développement après chaque lot ou changement d'agent.
- **Alternatives documentées :** rapports ponctuels de fin de lot ; registres persistants avec garde-fou CI léger.
- **Décision :** `PROJECT_STATUS.md` est l'état courant, `DEV_JOURNAL.md` est append-only, `DECISIONS.md` conserve les décisions et remplacements ; lecture et actualisation obligatoires via `AGENTS.md`. La CI exige une nouvelle entrée datée du journal lorsqu'un changement de code ou de configuration est proposé, sans gêner les modifications documentaires seules.
- **Justification :** éviter qu'un état de conversation ou un rapport final soit la seule source de continuité.
- **Conséquences :** une tâche ne peut être déclarée terminée si les registres ne reflètent pas code, tests et Git. Le contrôle CI détecte un oubli de fichier, pas la véracité du contenu ; celle-ci reste à vérifier par l'agent et le relecteur.
- **Statut :** VALIDÉE, appliquée à partir de cette intervention.
- **Source :** instruction explicite du propriétaire demandant ces trois registres et les règles permanentes.

## DEC-009 — Réservation des numéros historiques

- **Date :** 2026-10-21 (heure exacte de la correction non vérifiable).
- **Contexte :** la documentation de départ illustrait un épisode 11 sans prouver la séquence historique ; une première réponse du propriétaire a été corrigée dans la même intervention.
- **Alternatives :** attribuer le prochain numéro dès 10 ; réserver les sessions déjà annoncées puis commencer la numérotation automatique après elles.
- **Décision :** épisodes 1 à 9 déjà réalisés, prochaine session numéro 10, session planifiée ultérieurement numéro 11. Réserver 10 et 11 ; les nouveaux épisodes confirmés automatiquement commencent à 12 via un plancher de 11, sous réserve de la reprise de l'historique avant usage réel.
- **Justification :** correction explicite du propriétaire, afin de ne pas attribuer aux nouveaux dossiers les numéros des deux sessions déjà annoncées.
- **Conséquences :** `.env.example` et le défaut API fixent `EPISODE_NUMBER_FLOOR=11` ; le numéro est attribué à la confirmation, de façon transactionnelle, et unique en base. Les sessions 1–11 ne sont pas encore importées ou matérialisées dans la base locale. La séquence devra être conciliée avec la source historique avant production.
- **Statut :** VALIDÉE pour la règle de réservation ; import historique EN ATTENTE.
- **Source :** correction explicite du propriétaire pendant le Lot 2 ; `Docs/15_MIGRATION_HISTORIQUE.md` pour la future reprise.

## DEC-010 — Contrôle des droits de portrait avant publication

- **Date :** 2026-10-21 (heure de l'instruction non vérifiable).
- **Contexte :** le relais à la Production peut avoir lieu avec des éléments à compléter, dont les droits d'utilisation du portrait.
- **Alternatives :** bloquer tout relais incomplet ; autoriser le relais puis contrôler les droits au moment d'une publication utilisant le portrait.
- **Décision :** le relais reste possible avec une mention explicite des éléments manquants ; toute future publication utilisant un portrait devra être bloquée côté serveur tant que le droit d'utilisation applicable n'est pas vérifié et enregistré.
- **Justification :** permettre le travail interne sans transformer une transmission en autorisation de publier.
- **Conséquences :** les contrats et la recette du Lot 4 portent cette porte de contrôle ; validation, export et constat de publication d'affiches vérifient droit et consentement actif côté API.
- **Statut :** VALIDÉE ; contrôle local testé au Lot 4, usage réel soumis aux preuves de droits.
- **Source :** instruction explicite du propriétaire pour la clôture du Lot 2.

## DEC-011 — Base isolée pour la recette navigateur automatisée

- **Date :** 2026-10-21 (heure de l'instruction non vérifiable).
- **Contexte :** les scénarios Playwright créent des fiches et des épisodes ; la base de développement doit rester disponible pour l'import historique et la recette manuelle.
- **Alternatives :** exécuter les scénarios dans la base de développement avec nettoyage ciblé ; utiliser une base E2E propre, distincte et réinitialisable.
- **Décision :** les scénarios automatisés utilisent uniquement `voix_alumni_e2e`, une API et un frontend dédiés. L'API et les tests refusent de démarrer si le mode ou la base isolée ne correspondent pas ; seul l'outil E2E peut réinitialiser ses tables.
- **Justification :** rendre les scénarios reproductibles sans polluer ou effacer les données de développement et les numéros historiques réservés.
- **Conséquences :** deux comptes fictifs sont provisionnés exclusivement dans la base E2E ; les futurs tests navigateur doivent conserver le garde-fou. Les numéros 1–11 restent réservés et les nouveaux dossiers commencent à 12 après réinitialisation E2E.
- **Statut :** VALIDÉE et appliquée localement ; CI distante non exécutée.
- **Source :** instruction explicite du propriétaire pour la clôture du Lot 2 et vérifications locales consignées dans `DEV_JOURNAL.md`.

## DEC-012 — Synchronisation des tâches avec les événements métier

- **Date :** 2026-10-21 (heure exacte non vérifiée).
- **Contexte :** une confirmation et un relais déjà persistés au Lot 2 pouvaient apparaître comme tâches non faites dans le parcours du Lot 3.
- **Décision :** synchroniser de façon transactionnelle et idempotente les seules tâches prédéfinies intactes de contact effectif, confirmation et relais à partir des événements métier vérifiables. Conserver la référence, l'auteur et la date dans l'audit. Préserver toute tâche adaptée ou personnalisée. Laisser manuelles les tâches qui demandent une vérification humaine et la validation explicite de chaque étape.
- **Conséquences :** la première lecture et les lectures ultérieures du parcours peuvent compléter ces tâches si l'événement existe ; elles n'envoient aucun message externe et ne valident aucune étape. Les états de présentation distinguent « À venir », « En cours », « Tâches terminées » et « Étape validée ».
- **Statut :** VALIDÉE dans le cadre des corrections demandées pour le Lot 3 ; implémentation locale testée.
- **Source :** instruction explicite du propriétaire avant clôture du Lot 3.

## Décisions remplacées

Aucune décision remplacée n'est identifiée dans les preuves disponibles **depuis l'ouverture de ce registre**. L'ancien choix FastAPI/Python a été remplacé par `DEC-001` avant l'initialisation du registre ; ses références historiques restent dans le contexte de `DEC-001` et dans les documents du Lot 0. Toute future substitution recevra un nouvel identifiant et une référence croisée sans effacer l'entrée d'origine.

## DEC-013 — Rendu d'affiches navigateur et contrôle éditorial du Lot 4

- **Date :** 2026-10-21 ; autorisation explicite du propriétaire pour le Lot 4.
- **Contexte :** deux affiches PNG exportables et des messages persistés, sans confondre préparation et diffusion.
- **Décision :** aperçu et export PNG proviennent du même Canvas 1080 × 1350 dans le navigateur. Les contenus suivent brouillon, relecture, validation Responsable, export/prêt, puis constat manuel de publication. Les droits et le consentement de finalité sont revérifiés côté API. Les changements de source bloquent les actions sur l'ancienne version sans effacer son historique.
- **Justification :** parité mesurable des pixels entre aperçu et PNG, absence de moteur Chromium côté serveur, traçabilité de la diffusion réelle.
- **Conséquences :** templates inspirés des affiches fournies ; les logos intégrés aux affiches de référence ne sont pas extraits ni ajoutés comme fichiers autonomes. Les ressources officielles doivent être chargées et leurs droits vérifiés avant usage réel. L'adaptateur R2 est prêt mais non testé avec un bucket réel.
- **Statut :** VALIDÉE par le périmètre du Lot 4, implémentation locale en recette ; production NON VÉRIFIÉE.
- **Source :** instruction de démarrage du Lot 4, affiches locales fournies dans `Docs/Voix d'alumni/Affiches/` et vérifications locales consignées dans le journal.

## DEC-014 — Identité officielle obligatoire pour les affiches du Lot 4

- **Date :** 2026-10-21 ; revue explicite du propriétaire.
- **Contexte :** la première recette utilisait des logos fictifs ; le propriétaire a fourni ensuite les fichiers autonomes dans `Docs/Voix d'alumni/Logo/`.
- **Décision :** une affiche ne peut être validée, exportée comme prête à diffuser ni déclarée publiée sans les trois ressources ESMT, CPS et Voix d’Alumni avec droits accordés et preuve. Le logo Voix d’Alumni est le microphone avec deux personnes, sans la mention « Studio de production ». Les originaux restent hors Git et sont importés comme ressources privées par un organisateur autorisé.
- **Conséquences :** la recette locale emploie ces logos s’ils sont présents, avec portraits synthétiques ; les environnements dépourvus du dossier privé gardent des images de test explicitement fictives. `DEC-013` reste le choix du moteur Canvas ; sa note sur l’absence de logos autonomes décrit seulement l’état initial des fichiers.
- **Statut :** décision appliquée et testée localement ; usage des logos dans un stockage R2 réel non vérifié.
- **Source :** revue du Lot 4 et fourniture des fichiers autonomes par le propriétaire.
- **Vérification ultérieure du 2026-10-21 :** la recette R2 de développement a affiché et exporté les logos de recette récupérés du bucket ; l’affiche et l’UX ont été validées visuellement par le propriétaire. La preuve d’usage des ressources réelles en production reste à établir.

## DEC-015 — Confirmation de publication manuelle par Production

- **Date :** 2026-10-21 ; recette finale demandée par le propriétaire.
- **Contexte :** une copie ou un export ne prouve pas la diffusion et un clic involontaire ne doit pas créer une publication.
- **Décision :** la Production seule constate la publication d’un contenu prêt. L’interface demande le canal puis une confirmation explicite ; l’API exige aussi `confirmed_external_publication: true` et la version attendue. Une publication unique est conservée avec canal, version, auteur et horodatage réel, puis la version passe à l’état publié. Les appels répétés ou concurrents sur la même version sont refusés.
- **Conséquences :** validation éditoriale, export et publication restent trois événements distincts ; aucune diffusion externe n’est effectuée par l’application. L’historique expose aussi l’auteur de la publication.
- **Statut :** appliquée et testée localement ; diffusion externe réelle non effectuée.
- **Source :** instruction explicite de validation finale du Lot 4 et rôle Production défini dans `Docs/02_WORKFLOWS_ET_REGLES_METIER.md`.

## DEC-016 — Ouverture du feedback natif et validation des variantes

- **Date :** 2026-10-22 ; instruction explicite du propriétaire pour le Lot 5.
- **Contexte :** le questionnaire standard doit être rapide à ouvrir sans supprimer la relecture des modifications ni la porte de confidentialité.
- **Décision :** le modèle standard approuvé comporte six questions, seule la note de 1 à 5 étant obligatoire. Production peut ouvrir directement, après confirmation explicite, une instance inchangée du modèle **et de sa notice approuvée**. Toute modification des questions ou de la notice exige une validation Responsable de la version concernée. L'ouverture d'un formulaire public demeure un événement distinct de la validation du modèle.
- **Conséquences :** chaque version et chaque réponse conservent leur rattachement ; aucune notice de recette n'autorise l'ouverture à de vrais participants. La durée de rétention et le texte de notice réels doivent être approuvés avant cette ouverture.
- **Statut :** décision approuvée ; implémentation locale testée sur bases isolées, validation humaine du Lot 5 et notice réelle encore attendues.
- **Source :** autorisation du Lot 5 fournie le 2026-10-22.

## DEC-017 — Preuve métier de séance, citation et archive au Lot 5

- **Date :** 2026-10-22 ; découle des exigences explicites du Lot 5.
- **Contexte :** un lien Teams ouvert, une heure écoulée, une case `quote_approved` dans un brouillon ou un replay simplement référencé ne prouvent ni la séance tenue, ni une citation authentifiée, ni la diffusion autorisée.
- **Décision :** seule la Responsable constate explicitement la tenue ; l'approbation d'une affiche de remerciement citant l'intervenant exige une citation exacte approuvée en base, avec provenance. Un replay déclaré disponible exige les droits d'enregistrement et de diffusion accordés avec preuve. La clôture est préparée par Production et approuvée par Responsable après vérification de la checklist ; les absences admises exigent une exception motivée persistée. Les tâches prédéfinies intactes peuvent se synchroniser sur ces preuves sans valider l'étape.
- **Conséquences :** la recette Lot 4 de citation fictive crée désormais aussi un enregistrement de citation validé ; les anciennes affiches approuvées restent consultables, mais toute nouvelle approbation passe le contrôle actuel. Un report suspend les rappels pendants jusqu'à reconfirmation et conserve les rappels déjà exécutés.
- **Statut :** implémentation locale testée ; usage réel et validation humaine du Lot 5 attendus.
- **Source :** autorisation Lot 5, sections Jour J, transcription/citations, clôture et intégration au parcours.
