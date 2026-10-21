# AGENTS.md — Contrat d'exécution des agents de développement

> **À lire avant tout changement de code** dans le dépôt Voix d’Alumni. Contrat de travail initial ; ne remplace pas les instructions directes du propriétaire du projet.

## Traçabilité obligatoire à chaque intervention

1. **Avant d'agir**, lire `Docs/PROJECT_STATUS.md` et les dernières entrées de `Docs/DEV_JOURNAL.md`, puis vérifier la branche, le HEAD et l'arbre de travail. Consulter `Docs/DECISIONS.md` et les documents métier concernés. Cette règle vaut pour tous les lots et après tout changement d'agent.
2. **Après chaque tâche significative, correction importante, incident, blocage ou rollback**, ajouter une entrée chronologique à `Docs/DEV_JOURNAL.md`. Ne jamais supprimer ni réécrire une entrée historique ; consigner les tentatives et échecs même après correction, ainsi que la raison d'une annulation. Ajouter obligatoirement l'entrée de l'intervention avant la réponse finale.
3. **Avant de terminer l'intervention**, actualiser `Docs/PROJECT_STATUS.md` avec l'état réellement observé, les tests, le Git et la prochaine action. Actualiser `Docs/DECISIONS.md` dès l'approbation d'une décision structurante ; conserver les décisions remplacées et l'identifiant de leur successeur.
4. Vérifier la cohérence du journal et du statut avec le code, les résultats de tests, les documents métier et l'état Git. Distinguer **vérifié**, **issu d'un rapport antérieur** et **non vérifié**. Ne jamais transformer une supposition en fait observé.
5. Ne déclarer aucune tâche « terminée » si cette traçabilité n'est pas à jour. Ne consigner aucun secret, mot de passe, token, donnée personnelle sensible ni journal confidentiel. Le contrôle CI du journal est un filet de sécurité ; il ne remplace pas cette vérification humaine.

## Mission et contexte métier non négociable

- Construire **Voix d'Alumni Studio**, une petite application interne exploitable par **deux organisateurs** pour planifier, préparer, animer et archiver les épisodes.
- **Responsable** : recherche les intervenants, entretient **tous** les contacts directs, confirme les participations et anime les webinaires.
- **Production** : reçoit la fiche transmise, complète le dossier à partir de sources fiables, réalise visuels/messages, réunion, rappels, feedback, replay et archives.
- Une demande de renseignement envoyée par Production va **exclusivement à la Responsable**, jamais à l'intervenant ; aucune automatisation de contact direct avec l'alumni.
- Distinguer **Alumni** (personne et vivier), **Épisode** (session), **Tâche**, **Demande interne**, **Contenu**, **Publication constatée**, **Ressource média**.
- La maquette `Docs/voix_alumni_studio_prototype.html` a été approuvée : la consulter pour l'UX, sans la réécrire ni la convertir aveuglément en architecture de production. Toutes ses données et états de cases sont illustratifs.
- Architecture VALIDÉE : monorepo TypeScript, React/Vite + Tailwind CSS + shadcn/ui, Node.js/Hono avec Better Auth monté dans le même backend, Drizzle et PostgreSQL. Aucun service d'authentification distinct. Inscription publique interdite, y compris via Google OAuth ; seuls les comptes explicitement autorisés accèdent à l'application.
- Stockage VALIDÉ : Cloudflare R2 par API S3, buckets privés dev/prod séparés sous restriction de juridiction `eu`, accès temporaires signés après contrôle serveur, métadonnées PostgreSQL et interface de stockage indépendante du fournisseur. Aucun bucket ou identifiant créé au Lot 0.
- V1 VALIDÉE : studio simple d'affiches annonce/merci, feedback natif anonyme par défaut, publication externe toujours constatée manuellement. Google se lie explicitement à un compte déjà autorisé ; récupération d'accès sécurisée.

## Première intervention obligatoire : audit en lecture seule

1. Afficher branche/HEAD, `git status --short`, arborescence, README, maquette et fichiers existants.
2. Vérifier versions des outils, dépendances, base de données, ports, réseau Docker, fichiers `.env.example` (sans afficher les secrets).
3. Relever écarts entre la réalité et les `Docs/`; écrire les questions bloquantes, puis proposer le **Lot 0** et ses critères de fin.
4. Ne jamais écraser un travail non commité ni supposer qu'un dossier est vide parce que `git ls-files` ne l'affiche pas.
5. Si `Docs/voix_alumni_studio_prototype.html` est `untracked`, proposer de le versionner **sans le modifier** après vérification de sa provenance.

## Interdictions sans approbation explicite

- Pas de `git push`, fusion `main`, tag de release, publication DNS, migration de production, déploiement ni envoi de mails/WhatsApp/Teams/YouTube par défaut.
- Pas de migrations destructives, suppression de volumes, `docker compose down -v`, `prune`, `reset`, `force-push`, modification d'autres stacks, secrets dans Git ou journalisation de données personnelles.
- Pas de scraping LinkedIn, ni contournement de limitations/CGU ou d'API officielles ; privilégier la saisie et les informations fournies/validées.
- Pas de « réussite » déclarée sur la seule base d'un test simulé. Ne jamais confondre rendu HTML, fonctionnalité branchée et fonctionnalité éprouvée en production.
- Ne pas présumer de l'accord d'usage des portraits, logos, citations ou enregistrements.

## Garde-fous d'infrastructure

- Le document d'infrastructure transmis décrit `maadec-infra-01` avec Caddy, Docker, réseaux `dev-net`/`prod-net`, SSH via Tailscale et seulement 80/443 publics. **Ré-auditer l'état réel** avant déploiement ; la documentation historique n'est pas une preuve d'état actuel.
- Ne jamais exposer PostgreSQL/Redis ni le socket Docker publiquement. Prévoir Caddy en reverse proxy et secrets dans `.env` non suivis. Isolation dev/prod et sauvegardes indépendantes du disque local du VPS. Ne pas nettoyer les caches, images ou volumes des autres applications.
- Préserver le serveur et les autres apps ; planifier mémoire CPU/disque et stratégie de sauvegarde indépendante.

## Processus de travail par lot

1. **Lire** les trois registres de suivi selon la règle ci-dessus, `README.md`, `Docs/01`, `Docs/02`, `Docs/03`, `Docs/04`, `Docs/05`, `Docs/12`, puis les documents pertinents au lot.
2. **Faire un plan court** : périmètre, fichiers impactés, migrations, risques, tests et éventuelles décisions humaines.
3. **Implémenter la tranche verticale** (UI + API + données + sécurité + tests), sans abstractions futures inutiles.
4. **Tester** : unitaires, intégration, E2E desktop/mobile, a11y basique, contrôles RBAC et autres exigences ciblées.
5. **Documenter** : état d'implémentation vs restant ; nouveaux endpoints, nouvelles variables ; captures de recette si utiles.
6. **Rendre compte** : fichiers modifiés, commandes exécutées et résultats réels, limites, questions, état Git, validation demandée.
7. **S'arrêter à la porte de validation** du lot ; ne pas enchaîner automatiquement un déploiement.

## Définition de terminé

- Critères d'acceptation associés au besoin testés ; pas de faux compteurs ni messages fictifs en données réelles.
- Contrôle d'accès **serveur** testé (pas seulement masquage de boutons).
- Chaque tâche/modification métier conserve auteur et horodatage ; publications explicitement constatées, jamais inférées d'un copier-coller.
- Contrôle de données et consentements pour médias ; captures/fixtures de démo séparées des vraies données.
- Compatible mobile, clavier, focus ; erreurs/états vide/loading/permission gérés.
- Migration réversible ou sauvegardée ; tests automatisés passés ; documentation, journal d'intervention, statut courant et registre des décisions à jour.

## Questions nécessitant validation humaine (ne pas figer silencieusement)

- Domaine et hébergement effectifs, procédure de provisionnement des deux comptes autorisés et propriété des identifiants Google OAuth.
- Qui valide les visuels/messages avant diffusion et qui clique réellement « publié » sur les canaux.
- Permissions de photos/replay, politique de conservation et modalités de publication du formulaire de feedback natif.
- Heure exacte de #10 le 25/10/2026 (**GMT+2 annoncé tandis que `Europe/Paris` passe en GMT+1** ce jour-là).
- Portée et disponibilité des intégrations Microsoft/Google/YouTube/WhatsApp.

## Format de la fin d'un lot

```text
Lot : … / Branche et SHA : … / Statut : implémenté localement | testé | prêt à valider
Fonctionnalités et critères : …
Tests : commande / total / échecs / vérifications manuelles
Migrations et impacts : …
Écarts documentaires actualisés : …
Actions externes exécutées : aucune, ou liste autorisée
Limites et décisions en attente : …
Prochaine porte : validation demandée — ne pas poursuivre automatiquement
```

## Pointeurs essentiels

- Source fonctionnelle : `Docs/02_WORKFLOWS_ET_REGLES_METIER.md`, `Docs/03_SPECIFICATIONS_FONCTIONNELLES.md`.
- Design : `Docs/05_DESIGN_SYSTEM_ET_UX.md`, maquette HTML inchangée.
- Contrats : `Docs/08_MODELE_DE_DONNEES.md`, `Docs/09_CONTRATS_API.md`.
- Ordonnancement : `Docs/12_PLAN_IMPLEMENTATION.md`.
- Suivi permanent : `Docs/PROJECT_STATUS.md`, `Docs/DEV_JOURNAL.md`, `Docs/DECISIONS.md`.
- Tests, exploitation, lancement : `Docs/14`, `Docs/16`, `Docs/17`, `Docs/19`.
