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
- **Conséquences :** interface de stockage préparée au Lot 0 ; aucun bucket, identifiant ni adaptateur R2 créé aux Lots 0–1. Sauvegarde/restauration média encore à construire et tester.
- **Statut :** VALIDÉE, mise en œuvre REPORTÉE au lot média.
- **Source :** instructions du propriétaire ; `Docs/07_ARCHITECTURE_TECHNIQUE.md`, `Docs/16_DEPLOIEMENT_ET_ENVIRONNEMENTS.md`.

## DEC-004 — Responsabilités et preuve de publication

- **Date :** 2026-10-21 (heure de validation non vérifiable).
- **Contexte :** Production prépare visuels et messages ; Responsable gère la relation avec l'alumni et peut valider les contenus.
- **Alternatives documentées :** considérer génération ou copie d'un message comme publication ; confirmation manuelle distincte.
- **Décision :** la publication n'est enregistrée qu'après confirmation manuelle avec historique de l'épisode ; Teams, WhatsApp et YouTube restent manuels ou semi-manuels en V1.
- **Justification :** l'application ne peut pas déduire la diffusion réelle d'un aperçu, d'une génération ou d'une copie.
- **Conséquences :** règle documentée et future permission serveur ; aucun flux de publication métier n'existe au Lot 1.
- **Statut :** VALIDÉE, fonctionnalité NON IMPLÉMENTÉE.
- **Source :** instructions du propriétaire ; `Docs/02_WORKFLOWS_ET_REGLES_METIER.md`, `Docs/04_ROLES_ET_PERMISSIONS.md`.

## DEC-005 — Feedback natif et consentements

- **Date :** 2026-10-21 (heure de validation non vérifiable).
- **Contexte :** recueillir les retours et reprendre l'historique sans exposer des données personnelles inutilement.
- **Alternatives documentées :** formulaire natif V1 et import historique ; aucune autre solution retenue n'est détaillée dans les preuves disponibles.
- **Décision :** réponses anonymes par défaut sauf identification demandée explicitement, conservation configurable, suppression individuelle, statistiques seulement si réellement anonymisées ; modéliser les consentements portraits, enregistrements et replays.
- **Justification :** minimiser les données et distinguer les différentes autorisations d'usage.
- **Conséquences :** règles documentées ; formulaire, import et données de consentement non implémentés au Lot 1.
- **Statut :** VALIDÉE, mise en œuvre REPORTÉE.
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
- **Conséquences :** shell Lot 1 inspiré de la maquette ; aucune donnée illustrative de la maquette n'est traitée comme événement réel. Horaire toujours À CONFIRMER.
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

## Décisions remplacées

Aucune décision remplacée n'est identifiée dans les preuves disponibles **depuis l'ouverture de ce registre**. L'ancien choix FastAPI/Python a été remplacé par `DEC-001` avant l'initialisation du registre ; ses références historiques restent dans le contexte de `DEC-001` et dans les documents du Lot 0. Toute future substitution recevra un nouvel identifiant et une référence croisée sans effacer l'entrée d'origine.
