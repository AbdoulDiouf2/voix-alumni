# 19 — Recette finale, mise en service et première session

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Définir objectivement quand deux organisateurs peuvent commencer à utiliser Voix d’Alumni Studio.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Définition de « prêt pour usage officiel »

L'application est prête si **la Responsable et la Production** peuvent suivre une session depuis le vivier jusqu'au replay ou à une clôture justifiée, **avec leurs vrais rôles**, sans perdre d'information, et si la production est sécurisée, restaurable et monitorée. Le seul fait que l'interface ressemble à la maquette ne suffit pas.

## 2. Conditions bloquantes (No-Go tant que non satisfaites)

- [ ] App authentifiée, comptes individuels, permissions serveur démontrées.
- [ ] Better Auth intégré à Hono ; inscriptions email et Google OAuth publiques refusées ; seuls les comptes autorisés accèdent aux dossiers.
- [ ] Huit étapes, tâches et demandes internes persistantes et traçables.
- [ ] Responsable seule interlocutrice de l'alumni et seule autorisée à confirmer la relation.
- [ ] Aucune publication WhatsApp/YouTube externe automatique imprévue.
- [ ] Messages valides, versions et validation ; copie ≠ publication.
- [ ] Studio V1 produisant et exportant réellement les affiches d’annonce et de remerciement en qualité acceptable.
- [ ] Lien Teams vérifié, formulaire de feedback natif publié et collecte protégée, import historique contrôlé.
- [ ] Archive/replay/transcript ou dérogation de droits et d'absence explicite.
- [ ] Dates/fuseaux confirmés, en particulier **25 octobre 2026 18h GMT+2 vs heure Paris**.
- [ ] HTTPS, secrets hors Git, BD non publique, buckets R2 privés dev/prod sous juridiction UE, backups PostgreSQL et copie indépendante des médias critiques **avec test de restauration** ; rien d'essentiel uniquement sur le disque VPS.
- [ ] Aucun incident majeur non résolu dans parcours E2E à deux.
- [ ] Guide utilisateur à jour, les deux comptes testés par leurs titulaires.

## 3. Préparation de la recette réelle

**Participants :** Responsable et Production.
**Environnement :** staging/recette isolé et nettoyé, avec URL, version SHA et jeu de données explicitement identifiés.
**Matériel :** 2 comptes, ordinateurs/téléphones, portrait factice et logos autorisés, faux lien Teams de test, formulaire de test, vidéo de test non publique si nécessaire. Ne pas envoyer de messages à la communauté pendant la simulation.

## 4. Scénario de recette à deux (à cocher ensemble)

| # | Qui | Action à démontrer | Résultat attendu |
|---:|---|---|---|
| 1 | Responsable | Créer un profil d'alumni sans date | vivier, aucun épisode forcé |
| 2 | Responsable | Créer une proposition, renseigner promotion/poste/photo | brouillon enregistré |
| 3 | Responsable | Confirmer participation et date/fuseau | état confirmé, heure correcte |
| 4 | Responsable | Transmettre à Production | notification in-app, journal |
| 5 | Production | Ouvrir fiche depuis son dashboard | mêmes données réelles partagées |
| 6 | Production | Demander un intitulé exact de fonction | demande vers Responsable, pas alumni |
| 7 | Responsable | Répondre après consultation simulée | réponse tracée et visible |
| 8 | Production | Résoudre demande et préparer questions | progression cohérente |
| 9 | Production | Préparer affiche d'annonce, vérifier logos/date | export 4:5 lisible |
| 10 | Responsable | Valider visuel et texte | approbation enregistrée |
| 11 | Production | Copier le texte | **aucune publication automatiquement marquée** |
| 12 | Production | Simuler publication et confirmer manuellement | auteur/canal/date dans l'historique |
| 13 | Production | Ajouter Teams + formulaire, vérifier liens | logistique prête |
| 14 | Responsable | Afficher conducteur et simuler animation | accès mobile/desktop correct |
| 15 | Responsable | Marquer session tenue | `held_at` et statut corrects |
| 16 | Production | Préparer merci/feedback et confirmer partage | état séparé des messages |
| 17 | Production | Ajouter replay/transcript et citation validée | droits contrôlés, ressources retrouvables |
| 18 | Production | Produire affiche et message final | nouvelles versions et liens corrects |
| 19 | Responsable | Vérifier clôture/exception et approuver | épisode archivé, historique lisible |
| 20 | Les deux | Se déconnecter/reconnecter | données et droits conservés |

**Résultat** : signer `PASS` / `FAIL` pour chaque ligne et joindre captures ou liens vers preuves de test sans exposer des informations privées.

## 5. Recette non fonctionnelle

- [ ] Mobile 360/390/430 px et desktop 1440 px ; pas de scrolling horizontal imprévu.
- [ ] Focus clavier, labels, erreurs claires, navigation accessible.
- [ ] Liste avec zéro épisode, un épisode, historique et plusieurs propos.
- [ ] Saisie noms accentués, postes longs, photo non portrait et absence de photo.
- [ ] Replanification après annonce publiée, mail ou rappels internes non doublés.
- [ ] Import historique avec prévisualisation, corrections et réexécution idempotente.
- [ ] Contrôle 401/403 et média privé depuis navigateur non connecté.
- [ ] Sauvegarde et restauration sur environnement isolé ; écriture d'un rapport.
- [ ] Surveillance/alerte de l'application en production, pas seulement du VPS.

## 6. Décisions humaines finales requises

| Décision | Responsable de l'approbation | État initial |
|---|---|---|
| Heure/fuseau exacts de la première session | Responsable, puis Production pour affiches | À confirmer |
| Validateurs des contenus et canal de publication | les deux organisateurs | Rôles proposés, à confirmer |
| Propriété/usage portraits/logos/replay | Responsable + détenteurs des droits | À documenter |
| Domaine production et stockage | propriétaire de l'infrastructure | À décider |
| Modalités de recette du studio d’affiches V1 | les deux organisateurs | Studio natif validé ; recette à définir |
| Publication et rétention du feedback natif | les deux organisateurs | Principe natif validé ; détails à décider |
| Politique de conservation/effacement | propriétaire du produit et responsable initiative | À décider |
| Lancement et date d'ouverture | les deux organisateurs | NON AUTORISÉ par défaut |

## 7. Plan de bascule

1. Geler les fonctionnalités du candidat de livraison ; relever SHA et image.
2. Sauvegarder/configurer infra ; vérifier rétablissement.
3. Déployer sur cible approuvée avec aucun trafic communautaire externe involontaire.
4. Créer deux comptes personnels et faire connexion par les titulaires.
5. Importer historiques **validés** ; vérifier les deux épisodes de référence et leurs statuts non inventés.
6. Réaliser le scénario de recette ci-dessus en production avec ressources de test isolées ; supprimer seulement ces ressources de test avec procédure documentée.
7. Créer la **première vraie session future** (pas le cas d'essai automatiquement pris pour réel), vérifier échéances et responsabilités.
8. Ouvrir usage officiel, suivre premières erreurs et support pendant période d'observation décidée.

## 8. Retour arrière organisationnel

Si la production est indisponible à quelques jours d'un épisode, la Responsable et Production conservent un **plan manuel** : liens Teams connus, affiches exportées, copies des messages validés, formulaire accessible, source de vérité provisoire annoncée entre elles. Ne pas tenter une restauration non testée pendant un webinaire. Après retour du service, saisir les actions manuelles comme **constatées** avec auteur, date et source.

## 9. Décision Go / No-Go — fiche de signature

```text
Version / commit : ____________________
URL / environnement : ____________________
Date et horaire exact confirmé (zone IANA + UTC) : ____________________
Scénarios recette : ____ / 20 réussis ; blocants ouverts : ____
Restaurabilité vérifiée le : ____________________
Risques résiduels et contournements : ____________________
Décision Responsable : GO / NO-GO ; date : __________
Décision Production : GO / NO-GO ; date : __________
Autorisation de bascule en production : OUI / NON
Suivi post-lancement assigné à : ____________________
```

Sans deux validations GO et autorisation explicite de déploiement, rester en environnement de test.

Références : [guide des deux rôles](18_GUIDE_UTILISATEUR.md) · [tests](14_PLAN_DE_TESTS_ET_RECETTE.md) · [infra](16_DEPLOIEMENT_ET_ENVIRONNEMENTS.md).
