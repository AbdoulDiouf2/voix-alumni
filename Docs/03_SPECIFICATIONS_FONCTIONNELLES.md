# 03 — Spécifications fonctionnelles écran par écran

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Fournir à l’agent les comportements attendus et des critères d’acceptation vérifiables.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## Conventions de rédaction

Chaque ID `F-xxx` est une exigence vérifiable. **MUST** = nécessaire pour mise en service ; **SHOULD** = souhaitable ; **LATER** = reporté. Les responsabilités restent régies par `04_ROLES_ET_PERMISSIONS.md`. Les écrans affichent des données persistantes, jamais des fixtures de démonstration en mode réel.

## F-001 Authentification et identité (MUST)

- Connexion privée par utilisateur nominatif ; déconnexion, expiration, réinitialisation sécurisée, refus serveur aux non autorisés.
- Better Auth intégré au backend Hono : Google OAuth et email/mot de passe pour comptes préautorisés seulement ; création de compte publique interdite sur les deux chemins.
- Vues différenciées Responsable / Production, mais accès aux fiches partagées selon permissions ; le « switch » de rôle de la maquette est **un simulateur** et ne doit jamais devenir un changement de privilège libre.
- États erreur, chargement, aucun résultat et session expirée prévus.
- **Acceptation :** un visiteur non connecté obtient 401 sur l'API, pas de liste d'alumni, et la UI propose connexion ; l'organisateur connecté voit ses tâches.

## F-010 Dashboard binôme (MUST)

- Bandeau prochain épisode réel avec date+zone confirmée ; si aucun épisode, état vide avec CTA « Ajouter un intervenant ».
- KPI : à venir, demandes internes ouvertes, tâches en retard par propriétaire, épisode post-production en attente.
- Tâches à traiter triées échéance/importance ; liens vers leur contexte (pas de liste factice).
- Responsable voit priorité « intervenants/demandes/animation » ; Production « dossiers/affiches/communications/replay ».
- **Acceptation :** lorsqu'une demande est résolue elle disparaît du compteur après rechargement.

## F-020 Vivier Alumni (MUST)

- Liste avec recherche nom, promo, fonction, entreprise, statut relation, date de dernier contact ; tri et filtres.
- Création rapide avec nom au minimum ; diplôme/promo/fonction/entreprise, LinkedIn optionnel, photo, notes, consentements et provenance.
- Création d'un profil **sans épisode**, association à un ou plusieurs épisodes ; détecter duplications non bloquantes nom/promo.
- Compte rendu de prise de contact saisi uniquement par Responsable ; archivage sans suppression irréversible.
- Photo : aperçu, validation type/taille, droit d'utilisation distinct selon finalité.
- **Acceptation :** deux sessions d'un même intervenant affichent une seule fiche de personne et deux fiches épisodes distinctes.

## F-030 Fiche épisode et parcours (MUST)

- Création depuis fiche alumni ; numéro éventuellement provisoire avant confirmation ; date, heure, zone IANA, titre, thème, statut, commentaire.
- Vue d'ensemble : chrono du parcours, tâches obligatoires/facultatives, propriétaires, échéances, ressources liées, alertes.
- Huit étapes dans l'ordre de `02`, navigation sans blocage ; **portes métier** au changement de statut.
- Tâches actionnables avec état, auteur, commentaire, preuve, date ; les tâches « indispensables » doivent être auditables.
- Report/annulation : dialogue motif, dates précédentes, recalcul et actions correctives.
- **Acceptation :** recharger après édition ne réinitialise ni cases ni demandes ; changer date n'efface pas « annonce déjà publiée ».

## F-040 Passage de relais et demandes internes (MUST)

- Bouton « Transmettre à la production », résumé des champs reçus, manquants et pièces jointes ; action idempotente.
- Notification **in-app** au destinataire ; statut de lecture distinct du statut d'action.
- Production rédige demande de précision adressée à Responsable ; possibilité de grouper plusieurs questions ; Responsable répond directement dans le dossier.
- Actions `répondre`, `demander une précision`, `résoudre` et historique ; jamais de destinataire alumni.
- **Acceptation :** aucune option ni endpoint ne permet à Production d'envoyer un message à l'email/numéro de l'alumni.

## F-050 Questions et conducteur d'animation (MUST)

- Bibliothèque de questions communes classées : études, début de carrière, transitions, expériences, difficultés, conseils.
- Questions personnalisées par épisode, ordre modifiable, prioritaire/optionnel, durée cible facultative, notes privées.
- Export/impression lisible pour la Responsable et aperçu mobile.
- **Acceptation :** modifier la trame d'un épisode ne modifie pas les questions d'un ancien épisode.

## F-060 Studio d'affiches (MUST V1)

- Deux templates : annonce 4:5 et remerciement 4:5. Chargement des logos officiels **importés** par l'organisateur (ne pas reproduire des faux logos).
- Champs alimentés depuis le dossier mais ajustables localement au visuel : nom, poste, entreprise, promo, date/zone, tagline ; citation exacte + auteur pour le « merci ».
- Photo cadrable, conversion noir et blanc facultative ; police Unicode ; aperçu **au plus près du rendu final**.
- Workflow `brouillon → à_relire → validé → exporté` ; changement d'une donnée critique invalide validation antérieure.
- Export PNG au moins **1080 × 1350 px** (4:5) sans watermark, stockage avec version et checksum ; tester avec accents, noms longs, portrait non centré.
- Étudier d'abord un rendu côté navigateur utilisant le même modèle que l'aperçu ; mesurer fidélité, performance et usage mémoire avant de retenir un moteur Chromium serveur.
- **Acceptation :** les visuels utilisent les vrais assets autorisés ; impossible de marquer « publié » juste après le téléchargement ; aperçu/export visuellement cohérents.
- Une indisponibilité du moteur d'export bloque la recette de cette fonction ; un outil externe peut dépanner ponctuellement sans remplacer le studio V1 validé.

## F-070 Communication communautaire (MUST)

- Bibliothèque de modèles : annonce, rappel, lien réunion, remerciement feedback, replay, correction/report.
- Champs dynamiques préremplis, édition libre et prévisualisation texte WhatsApp ; vérification des tokens manquants avant validation.
- Bouton **Copier** (événement `copied_at` éventuel), bouton **Marquer comme publié** avec confirmation, canal, horodatage et facultativement URL/capture.
- Conserver versions et messages réellement envoyés manuellement ; aucune API WhatsApp groupe supposée disponible.
- **Acceptation :** « Copier » seul ne modifie pas le statut de publication ; après modification substantielle d'un message validé, repasser en relecture.

## F-080 Réunion et échéances (MUST)

- URL Teams collée ou renseignée manuellement, titre, lien de secours, fuseau, auteur ; action « ouvrir » externe.
- Vérification explicite du lien, du conducteur, du formulaire et des rappels ; calendrier J-7/J-3/J-1/jour J/J+1... configurable.
- Recalcul des tâches/rappels futurs à un report, avertissement sur publications déjà faites, contrôle DST.
- **Acceptation :** toutes les vues d'horaire montrent zone/offset cohérents ; aucun rappel externe n'est envoyé depuis la V1 par défaut.

## F-090 Feedback (MUST natif V1)

- V1 : formulaire natif lié à l'épisode, questions et statut publiés explicitement, lien public à jeton non devinable, collecte et réponses persistantes protégées ; import CSV des réponses historiques avec prévisualisation et dédoublonnage.
- Les répondants ne créent aucun compte organisateur. Limitation de débit, validation des entrées, politique de consentement/rétention et séparation stricte entre routes publiques du formulaire et API interne.
- Ne pas prétendre « réponses reçues » si simple lien externe non synchronisé ; distinguer chiffres importés d'une collecte native.
- Réponses anonymes par défaut ; identification uniquement sur choix explicite. Rétention configurable, suppression contrôlée des réponses individuelles et statistiques conservées seulement si réellement anonymisées.
- Métadonnées minimales ; stats agrégées si consentement/périmètre adéquats ; export CSV et suppression selon rétention.
- **Acceptation :** l'import d'un même CSV deux fois ne double pas les réponses ou donne un avertissement explicite.

## F-100 Médiathèque et post-production (MUST)

- Média associé à `episode_id` : portrait, logos, affiche, fichier ou lien de vidéo, transcript, citation, visuel final, documents divers.
- Ajouter replay YouTube comme URL externe vérifiée, noter droits de publication, visibilité et état `publié` **constaté**.
- Transcription téléversable/importable (TXT/VTT/SRT/PDF selon choix), versionnée et éditable pour relecture ; citation liée à passage/source ou indiquée « à vérifier ».
- Clôture avec ressource absente motivée et approbation Responsable si nécessaire.
- **Acceptation :** ouverture d'un épisode ancien restitue ses versions d'affiches, message de publication et replay.

## F-110 Paramètres et bibliothèque commune (SHOULD)

- Identité de l'initiative, vrais logos, charte graphique, signatures, fuseau par défaut explicite, délais de tâches.
- Modèles versionnés et ajustables pour **les nouveaux épisodes** ; ne jamais recalculer silencieusement les anciens déjà publiés.
- Journal d'audit et petites préférences de notifications ; pas de RBAC paramétrable complexe en V1.

## F-120 Import historique (MUST si fichier fourni)

- Assistant « téléverser → prévisualiser → mapper colonnes → détecter doublons → importer → rapport » ; aucun import sans aperçu.
- Conserver feuille/ligne source et valeurs brutes pour traçabilité contrôlée.
- Les dates ou cases cochées dans le tableur ne sont pas automatiquement des preuves de publication ; distinguer `legacy_reported` et `verified`.

## Non-fonctionnel transversal

- Responsive téléphone/tablette/ordinateur, clavier, messages d'erreur utiles, traitement de fichiers sécurisé, requêtes paginées, authentification et 403/404 cohérents.
- Pas de données de démonstration sur un compte réel sans marquage explicite.
- Interface en français et caractères Unicode (Sénégal/France). Horodatages serveur en UTC, affichage selon zone sélectionnée.
- Chaque mutation critique doit pouvoir être expliquée par un événement d'audit.

Références : [règles](02_WORKFLOWS_ET_REGLES_METIER.md) · [rôles](04_ROLES_ET_PERMISSIONS.md) · [recette](14_PLAN_DE_TESTS_ET_RECETTE.md).
