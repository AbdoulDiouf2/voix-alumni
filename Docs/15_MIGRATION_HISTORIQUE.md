# 15 — Import et reprise de l’historique Google Sheets

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Rapatrier les épisodes antérieurs sans créer de faux suivis ni doublons.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Source et limites connues

Les captures montrent le classeur « Voix d'Alumni », onglets `Organisation`, `Draft` et une `Feuille 3`, avec noms, promotion, fonction, date de présentation, prise de contact, confirmation et tâches de communication. **Les captures ne sont pas l'export intégral** ; les colonnes masquées, valeurs exactes et dates ne peuvent être déduites. Obtenir **un export XLSX/CSV autorisé** avant de figer le mapping. Ne pas tenter de télécharger arbitrairement un tableur privé à partir d'une URL capturée.

## 2. Colonnes identifiées sur les captures

| Colonne (exemple visible) | Destination suggérée | Transformation |
|---|---|---|
| `Alumni` | `alumni.full_name` | trim, normaliser espaces, conserver original |
| `Prise de contact` | `alumni.relation_status` / événement legacy | `Terminé` ne vaut pas date/preuve de contact |
| `Promo` | `alumni.promotion_year` | valider années, valeurs manquantes admises |
| `Fonction actuelle` | `alumni.job_title` | conserver tel que saisi + statut à vérifier |
| `Date presentation` | `episode.local_date` | parser format FR, ne pas inférer fuseau |
| `Confirmation` | `episode.legacy_confirmation_flag` | « Oui » indique valeur historique reportée, pas confirmation actuelle |
| `Date envoi vidéo 3mn + résumé épisode précédent` | tâche legacy | conserver valeur brute, vérifier sens |
| `Date envoi affiche épisode` | publication legacy | preuve de publication non garantie |
| `Informer étudiant CPS share link teams` | tâche legacy | `Terminé` observé sans preuve d'envoi |
| `Update flyer for following episode` | tâche legacy | statut importé |
| `Update feedback link for this episode` | tâche legacy | statut importé |

## 3. Exemples d'épisodes historiques visibles

Captures : Baye Dame THIAM (2018, 02/11/2025), Cheikhouna DIOP (2007, 16/11/2025), Maimouna Polèle Sy THIOYE (2007, 07/12/2025), Abdoul CIRE GUISSE (2018, 21/12/2025), Chancelin F. Dongmo (2007, 11/01/2026), Amadou Leon NGOM (2004, 25/01/2026), Leysa Maty SALL (2012, 08/03/2026), Arielle SANTOS (2006, 13/09/2026), Ezechiel OUATTARA (2018, 27/09/2026). **Ces valeurs ont été lues à partir d'images et nécessitent validation avec le tableur d'origine.**

La maquette ajoute #10 Sennen Ekouagne (25/10/2026) et #11 proposition Alassane Mballo (08/11/2026) ; ces fiches sont **des exemples de démonstration**, pas des sources officielles d'avancement.

## 4. Procédure d'import reproductible

1. Sauvegarder l'export source original dans un espace privé, avec date, propriétaire et checksum ; ne jamais committer le CSV avec données personnelles.
2. Énumérer onglets/colonnes réels et les variantes de noms ; afficher 10 premières lignes masquées si données sensibles.
3. Prévisualiser mapping proposé ; confirmer au moins `Alumni`, `Promo`, `Date presentation`, `Fonction actuelle` et les colonnes de statut.
4. Valider timezone des dates : **date sans fuseau = `date_only`**, ne pas supposer automatiquement 18h GMT+2.
5. Détecter doublons par règles progressives : même nom normalisé + promo, puis confirmation humaine ; ne pas fusionner deux personnes juste sur un nom semblable.
6. Produire un `dry_run` détaillant total lignes, déjà connues, nouvelles, ambiguës, erreurs et avertissements.
7. Importer dans une transaction ou en lots atomiques, conserver `legacy_source_id`, `sheet_name`, `source_row`, `source_checksum`, `raw_row` limité et protégé.
8. Générer rapport des écarts et corrections manuelles ; vérifier par échantillon les profils et épisodes.
9. Ne valider la migration production qu'après sauvegarde, test sur environnement isolé et approbation du responsable.

## 5. Compatibilité des statuts legacy

- `legacy_reported_complete` : feuille indique « Terminé », mais l'action n'est pas **vérifiée**.
- `verified_complete` : une personne a validé la preuve/date, journalise qui et quand.
- `unknown` : cellule vide ou donnée ininterprétable.
- `not_applicable` : activité inexistante pour l'épisode.

Ne pas mélanger dans le calcul des KPI les tâches legacy simplement marquées « Terminé » et les actions contrôlées dans l'application sans afficher une distinction.

## 6. Conversion et conservation des dates

- Accepter `JJ/MM/AAAA` et format Excel date s'il est typé dans XLSX, refuser dates ambiguës sans aperçu.
- Un champ `date présentation` est une **date locale non zonée** tant que l'heure/zone n'est pas confirmée ; pas de création automatique de rappels passés.
- Les dates d'annonce peuvent être antérieures à l'épisode ; ne pas normaliser par erreur en ordre d'import.
- Pour #10 le 25/10/2026, blocage explicite de toute heure dont le fuseau de référence n'a pas été confirmé.

## 7. Vérifications post-import

- Nombre de lignes source = importées + ignorées documentées + rejetées ; somme explicitement vérifiée.
- Compter Alumni uniques vs Épisodes (ne pas confondre).
- Aucun même `(source_file,sheet,row)` importé deux fois ; import répété idempotent.
- Dates affichées correctement, promotions non tronquées, chaînes accentuées préservées.
- Les historiques de statut reporté apparaissent comme tels ; les comptes organisateurs ne sont jamais créés depuis le tableur.
- Un archivage importé ne devient pas automatiquement vidéo/publiqué sans URL/preuve.

## 8. Médias historiques hors tableur

Créer une étape distincte pour affecter affiches anciennes, liens YouTube, Google Forms et transcriptions à l'épisode correspondant. Requérir approbation d'usage ; ne pas aspirer automatiquement tout le contenu WhatsApp. Lier les fichiers par épisode et enregistrer la provenance sans les redistribuer au public.

## 9. Rollback et protection de l'historique

Chaque import possède un `import_batch_id` et un rapport. Sur erreur : permettre annuler les objets **créés par ce lot** tant qu'aucune action métier ultérieure ne les référence ; sinon proposer correction contrôlée, jamais effacement indiscriminé. En production, sauvegarde et simulation de restauration avant import.

Références : [données](08_MODELE_DE_DONNEES.md) · [tests](14_PLAN_DE_TESTS_ET_RECETTE.md).
