# 16 — Déploiement, environnements, réseau et retour arrière

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Adapter le projet à l’infrastructure MAADEC en respectant les protections existantes.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Référentiel d'infrastructure disponible

Le document fourni « Infrastructure maadec-infra-01 » (dernière mise à jour annoncée septembre 2026) décrit **à cette date** un VPS Hetzner Ubuntu 24.04, Docker, Caddy, réseaux `dev-net` / `prod-net`, reverse proxy HTTPS, accès SSH via Tailscale, supervision Beszel/Dozzle/Uptime Kuma. **Il est historique : l'agent doit vérifier l'état actuel sur le serveur en lecture seule avant d'agir.** Ne jamais copier des IP/secrets du document dans ce dépôt.

Contraintes non négociables de ce document : ports publics seulement 80/443 pour Caddy ; jamais de DB exposée ; pas de port SSH public ; secrets hors Git ; ne pas opérer en root ; autres stacks intactes ; pas de socket Docker monté directement dans l'app.

## 2. Environnements

| Environnement | Objectif | Réseau proposé | Données |
|---|---|---|---|
| Local | développement, migrations, tests | réseau Compose dédié | éphémères/factices |
| Dev serveur (option) | recette distante isolée | `dev-net` si conforme | comptes/données de test |
| Production | utilisation par deux organisateurs | `prod-net` si conforme | données réelles, sauvegardées |

**Ne pas connecter un même conteneur simultanément à `dev-net` et `prod-net`.** Pas de réutilisation des DB d'autres projets. Les serveurs dev et prod peuvent cohabiter mais les volumes, secrets, noms de conteneurs et BD sont distincts.

## 3. Architecture Compose cible indicative

Le monolithe modulaire Node.js/Hono héberge **également Better Auth** ; aucun conteneur d’auth séparé. Le build statique Vite est servi derrière Caddy ; l’API et PostgreSQL restent privés. Les médias sont dans deux buckets Cloudflare R2 privés distincts, créés sous restriction de juridiction `eu` et accessibles par l'API S3 juridictionnelle. Les métadonnées restent en PostgreSQL ; aucune vidéo originale volumineuse sur le VPS. Aucun bucket, identifiant Cloudflare ou build d'image applicative aux Lots 0–1.

```yaml
# Schéma illustratif, NON déployable tel quel sans décisions sur images/secrets/sauvegardes
services:
  voix-alumni-web:
    image: registry.example/voix-alumni-web:PINNED_VERSION
    restart: unless-stopped
    networks: [prod-net]
    # pas de ports publics
  voix-alumni-api:
    image: registry.example/voix-alumni-api:PINNED_VERSION
    restart: unless-stopped
    env_file: [.env.production]
    networks: [prod-net, voix-db-net]
    # Hono + Better Auth /api/auth/* ; pas de ports publics
  voix-alumni-db:
    image: postgres:PINNED_MAJOR
    restart: unless-stopped
    volumes: [voix_db_data:/var/lib/postgresql/data]
    networks: [voix-db-net]
    # pas de ports publics
networks:
  prod-net: {external: true}
  voix-db-net: {internal: true}
volumes:
  voix_db_data: {}
```

Le web ne doit pas rejoindre le réseau DB. Le worker éventuel est connecté au réseau DB et au réseau nécessaire pour notifications internes, avec restrictions appropriées. **Les placeholders ne sont pas des images réelles à déployer**.

## 4. Caddy, domaine et HTTPS

- Le domaine final n'est **pas décidé**. Choisir sous-domaine avec accord du propriétaire et vérifier la configuration DNS actuelle.
- Publier frontend et `/api` via Caddy avec routes correctes, HTTPS, limites upload, timeout, gestion des SPA deep links et headers sécurisés.
- Servir la SPA, `/api/auth/*` et `/api/v1/*` sous la même origine ; configurer Better Auth, les origines de confiance et le rappel Google pour le domaine approuvé. Refuser l’inscription publique par mot de passe et OAuth avant ouverture.
- Valider la résolution DNS avant émission de certificats ; vérifier certificats et reverse proxy sans redémarrer toutes les stacks.
- Pas de port app en `0.0.0.0`, pas de passage direct public vers Hono/PostgreSQL.

## 5. Procédure de livraison reproductible

1. Vérifier `git status`, SHA et tag/commit signé, état de l'environnement, ports et espace disque ; informer propriétaire.
2. Lancer les tests CI et build de l'artefact identifié par SHA.
3. Sauvegarder **DB + copie indépendante des médias R2 critiques + configuration**, hors disque local du VPS, puis vérifier présence, taille et capacité de restauration.
4. Préparer migrations non destructives sur environnement dev copie/proche ; relever risques.
5. Obtenir un **GO de déploiement explicite** ; ne jamais faire une mutation prod sur simple lecture de ce guide.
6. Mettre à jour les services du projet un par un ; exécuter migrations contrôlées ; vérifier health readiness.
7. Smoke : login email/Google des seuls comptes préautorisés, refus d’un nouvel utilisateur Google, deux rôles, épisode, données, média, export affiche, feedback natif public limité, dashboard, accès non autorisés refusés.
8. Vérifier logs, CPU/mémoire, réseau, sauvegardes et alertes ; notifier résultat et SHA final.

## 6. Rollback

- Conserver artefact précédent/compose et sauvegarde DB/copie médias R2 associée ; préférer migrations compatibles « expand/contract ».
- Si une migration incompatible est passée, un simple rollback image **peut ne pas suffire** : plan de restauration détaillé et fenêtre d'indisponibilité décidée avant lancement.
- Réduire l'exposition (mise en maintenance) si risque données ; revenir aux services précédents **du projet uniquement** ; valider intégrité.
- Journaliser incident, causes, durée et impact ; aucun `down -v`/prune/suppression volumes.

## 7. Supervision et sauvegardes

- Ajouter sonde HTTPS `/api/ready` dans Uptime Kuma selon règles réseau existantes ; des labels Homepage facultatifs selon convention du serveur.
- Métriques conteneurs et logs via l'observabilité installée, **sans** modification du socket-proxy, des ACL Tailscale ou du système de supervision pour faciliter le projet.
- Backup PostgreSQL automatisable et copie indépendante des médias critiques R2 avec rétention définie ; restaurer dans un environnement isolé et comparer checksums. Aucun backup important ne dépend du seul disque VPS.
- Vérifier coûts CPU/RAM/disque (serveur partagé). Mesurer avant activation du moteur rendu PNG.

## 8. Checklist go/no-go infrastructure

[ ] domaine approuvé [ ] DNS correct [ ] TLS [ ] Caddy validé [ ] Better Auth intégré et inscriptions email/OAuth fermées [ ] DB privée [ ] buckets R2 privés dev/prod sous juridiction UE [ ] secrets hors Git [ ] images pinned [ ] backup DB + copie média indépendante/restauration vérifiés [ ] migration testée [ ] rollback praticable [ ] health ready [ ] aucun service voisin modifié [ ] logs sans PII [ ] comptes binôme opérationnels [ ] feedback public limité [ ] test 25/10/2026 confirmé [ ] approbation humaine écrite.

Références : [architecture](07_ARCHITECTURE_TECHNIQUE.md) · [sécurité](13_SECURITE_ET_CONFIDENTIALITE.md) · [exploitation](17_EXPLOITATION_ET_MAINTENANCE.md).

## État après Lot 1

Seul le PostgreSQL de développement Voix d’Alumni est démarré sur `127.0.0.1:55432`; une base `voix_alumni_test` distincte héberge les tests. Les serveurs Node/Vite tournent localement sur `127.0.0.1:8787` et `127.0.0.1:5173` pour la recette. Aucun déploiement, changement Caddy/DNS, conteneur applicatif ou bucket R2 n’a été créé. Avant déploiement, vérifier l’origine HTTPS, les cookies, le callback Google et la propagation fiable de l’IP cliente au limiteur Better Auth via le proxy de confiance.
