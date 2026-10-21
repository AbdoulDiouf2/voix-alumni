# 13 — Sécurité, confidentialité et droits sur les médias

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Encadrer un produit privé qui manipule identité, photos, contacts et retours participants.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Modèle de risque

L'application gère des données identifiantes : noms/promotion/postes/photos d'alumni, potentiellement coordonnées et notes internes, conversations résumées, liens de réunion, feedbacks, vidéos/transcriptions et informations des comptes internes. Les risques prioritaires sont accès non autorisé, fuite d'un portrait ou d'un enregistrement, lien de réunion diffusé à tort, modification silencieuse d'une date et perte d'archives.

## 2. Accès et sessions

- Deux comptes nominatifs préautorisés, aucun compte partagé. Better Auth est intégré à Hono avec email/mot de passe et Google OAuth ; désactiver la création publique pour **les deux méthodes**. Provisionner les comptes par un chemin privé audité ; contrôler la liste autorisée et l'état actif au login et sur les routes protégées. Mot de passe robuste avec hash éprouvé et sessions expirantes/révocables ; MFA à étudier.
- Connexion via HTTPS ; cookies `HttpOnly`, `Secure`, `SameSite` approprié, protection CSRF/origines de confiance, protection brute force et rate limiting. Vérifier le transfert correct du schéma HTTPS derrière Caddy.
- Pas d'identifiants de démo, `admin/admin`, création de rôle par l'utilisateur, accès public aux dossiers ou « RoleSwitch » escaladant les droits. La seule exception publique V1 est le formulaire de feedback publié, limité par jeton et sans session organisateur.
- Tester permissions **backend** et l'accès aux médias via URL, pas uniquement l'interface.
- Tester OAuth Google avec email non autorisé, non vérifié, compte révoqué et liaison à une identité préexistante ; un domaine Google accepté ne remplace pas l'autorisation nominative. Ne jamais configurer une liaison forcée d'identités non vérifiées.
- Désactiver la liaison Google implicite ; lier Google explicitement depuis une session d'un compte préalablement autorisé. Au Lot 1, la récupération est une commande administrative privée tracée : nouveau mot de passe fourni par stdin, hash Better Auth et suppression de toutes les sessions. Le canal de remise au propriétaire reste à valider ; aucun reset par email automatique n’est activé.

## 3. RBAC minimal

Consulter `04_ROLES_ET_PERMISSIONS.md`. La Responsable seule peut déclarer contact/confirmation de l'alumni. Production ne peut pas envoyer vers alumni, et les coordonnées directes sont masquées ou absentes par défaut. Publication en communauté = constat manuel avec rôle autorisé. **L'alumni n'est pas un utilisateur interne dans V1.**

## 4. Photos, logos, replays et citations

Chaque ressource sensible conserve un statut `rights_status`: `unknown`, `requested`, `granted`, `refused`, `revoked` ; préciser portée (annonce, archive, YouTube) et preuve/référence si disponible. Ne pas considérer un portrait fourni par WhatsApp comme une autorisation universelle. Les logos institutionnels doivent être fournis dans une qualité et sous droits d'usage convenus.

Pour l'enregistrement d'une session : vérifier l'information des participants, l'accord de diffusion et la portée (replay public/non listé/privé) avant mise en ligne ; respecter le retrait si possible. Les citations du transcript doivent être relues, contextualisées et validées avant attribution. Pas de génération inventant des phrases « prononcées ».

## 5. Collecte de feedback

- Demander uniquement les champs utiles pour améliorer les rencontres ; privilégier anonymat par défaut si identité inutile.
- Indiquer qui reçoit les réponses, pourquoi, pendant combien de temps, et comment demander correction/suppression ; conserver la preuve de cette information.
- Feedback natif : route publique à jeton opaque stocké haché, statut ouvert/fermé, limitation de débit, validation serveur, protection anti-abus proportionnée et accès aux réponses réservé aux organisateurs. Confirmer notice, consentement et durée de conservation avant ouverture. Un import historique crée une **deuxième copie** à protéger.
- Réponses anonymes par défaut ; identification uniquement si demandée explicitement. Prévoir une durée configurable, suppression individuelle contrôlée et éventuelle conservation de statistiques réellement anonymisées.
- Ne pas exposer texte brut des avis dans des pages publiques ni afficher une note comme factuelle sans volume et source.

## 6. Données et transferts internationaux

La communauté se trouve notamment au Sénégal et parmi les alumni en France ; la plateforme doit identifier le lieu d'hébergement et les éventuels prestataires. Une politique de confidentialité concrète et une analyse des obligations applicables (notamment RGPD si applicable, et réglementation locale pertinente) sont à valider **avant** une collecte publique native. La documentation ne vaut pas avis juridique.

## 7. Chiffrement, stockage, secrets

- TLS public obligatoire ; PostgreSQL sur réseau privé. Deux buckets Cloudflare R2 privés, distincts pour dev/prod et créés avec restriction de juridiction UE `eu` ; pas de domaine public R2. L'accès objet passe par l'API S3 juridictionnelle et des URLs signées de courte durée après contrôle de droits.
- Secrets `*.env` non versionnés, droits fichiers restrictifs, rotation/plan de révocation ; pas de tokens dans logs ni captures.
- Rejets de fichiers exécutables, validation MIME réel, limite de taille, nom canonique aléatoire, contrôle d'autorisation à chaque téléchargement, headers anti-XSS, pas de SVG actifs non assainis.
- Sauvegarde PostgreSQL automatisable et copie indépendante des médias critiques hors disque local du VPS, test de restauration et inventaire des accès. Pas de stockage de vidéos originales volumineuses sur le VPS.
- CORS restrictif, CSP adaptée, protection XSS/CSRF/SSRF, sanitation des URL externes (`http(s)` seulement, validation selon contexte), timeouts côté serveur.

## 8. Journal et minimisation

Les événements importants doivent garder **qui / quand / quoi** sans enregistrer une copie intégrale de tous les messages privés. Logs d'application : ID technique, code d'erreur, durée ; sans mots de passe, cookies, photo, email, contenu de feedback ou transcript. Les audits métier se conservent selon politique définie, pas indéfiniment par défaut.

## 9. Suppression et rétention — décisions à demander

| Donnée | Politique initiale | Décision requise |
|---|---|---|
| Alumni dans le vivier | conserver tant qu'utile à l'initiative | durée et archivage/suppression |
| Images d'affiches publiées | archive, retrait possible | droit d'image et demande d'effacement |
| Photo originale | ne conserver que si usage justifié | délai/accès après épisode |
| Feedback identifiable | limiter et anonymiser rapidement | durée selon finalité |
| Transcript/enregistrement | accessibilité restreinte et provenance | consentement et politique YouTube |
| Audit de publication/validation | garder preuve proportionnée | durée de conservation |
| Tokens externes | supprimer dès révocation | procédures de rotation |

## 10. Checklists d'audit de sécurité

**Avant merge auth :** [ ] inscription email refusée [ ] premier OAuth Google non autorisé refusé [ ] liaison Google sûre [ ] compte révoqué refusé [ ] bruteforce [ ] sessions/logout [ ] CSRF/CORS [ ] 401/403 [ ] changement de rôle impossible [ ] redaction logs.
**Avant média :** [ ] quotas [ ] MIME/sniff [ ] nom random [ ] antivirus/scan si disponible [ ] pas d'accès direct [ ] droits réels [ ] purge contrôlée.
**Avant production :** [ ] HTTPS [ ] DB privée [ ] secrets hors Git [ ] scans dépendances [ ] backups [ ] exercice restore [ ] procédure incidents [ ] lien de réunion non public involontairement.
**Avant vidéo publique :** [ ] consentement [ ] qualité transcript [ ] autorisation citation [ ] option retrait [ ] visibilité voulue.

## 11. Incidents critiques

En cas de fuite présumée, suspendre les accès/jetons touchés sans supprimer les preuves techniques, préserver journaux et inventaire, évaluer impact et obligations de notification avec responsable concerné, documenter remédiation. En cas d'accès public accidentel à un fichier privé, invalider URLs signées, corriger politique d'accès, effectuer revue des autres médias. Voir `17_EXPLOITATION_ET_MAINTENANCE.md`.

Références : [rôles](04_ROLES_ET_PERMISSIONS.md) · [exploitation](17_EXPLOITATION_ET_MAINTENANCE.md).

## État de sécurité Lot 1

L’inscription email est fermée par Better Auth. Google, lorsqu’il sera configuré, interdit `disableSignUp` et `disableImplicitSignUp`, exige une liaison explicite et vérifie la présence d’un compte actif via `user.validateUserInfo` avant création/liaison/session. Le callback réel Google n’a pas pu être exercé sans identifiants OAuth. Hono refuse les POST `/api/auth/*` dont l’origine est absente ou différente de `BETTER_AUTH_URL` et bloque les sessions révoquées, y compris sur les routes Better Auth. L’adresse IP n’est pas encore transmise de façon fiable au limiteur Better Auth dans le montage local Vite/Hono ; la configuration du proxy de production et son test restent un préalable au déploiement. Les événements de sécurité ne contiennent ni mot de passe ni jeton.
