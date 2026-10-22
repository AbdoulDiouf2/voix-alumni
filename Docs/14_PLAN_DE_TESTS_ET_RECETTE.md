# 14 — Stratégie de tests, scénarios de recette et seuils de validation

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Décrire les preuves nécessaires au-delà des captures de la maquette.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Principes

Séparer **test unitaire**, **API/DB**, **E2E navigateur**, **test de charge léger**, **recette humaine** et **exploitation prod**. Le rapport doit préciser quelles commandes ont été exécutées, sur quel environnement, avec quels résultats. Un test de maquette ne prouve ni persistance ni envoi externe.

## 2. Matrice de couverture par risque

| Catégorie | Scénarios minimum | Critère de réussite |
|---|---|---|
| Auth | Better Auth dans Hono, inscription email refusée, premier OAuth Google non autorisé refusé, compte révoqué, liaison sûre, session expirée, brute force | 401/403 cohérents, aucun compte public ni rôle accordé |
| Rôles | Production tente « confirmer contact alumni » | refus serveur, pas de mutation |
| Vivier | alumni sans épisode, doublon potentiel, multi-épisodes | 1 personne, n épisodes, aucun lien perdu |
| Workflow | huit étapes, dépendances, contournement via API | transitions sûres, tâches auditables |
| Handoff | double clic et réponses internes | 1 relais journalisé, notification sans doublon |
| Contenu | valider/versionner/modifier après validation | retour en relecture, ancienne version figée |
| Publication | copier vs réellement publié | copie ≠ publication ; `published_by/at` présents |
| Calendrier | Dakar/Paris, DST 25/10/2026, report | instants corrects, anciens jobs annulés |
| Feedback | formulaire natif public sans accès aux dossiers, fermé/révoqué, abus et même CSV historique importé deux fois | réponses privées, débit limité, pas de doublons, rapport d'anomalies |
| Média | upload invalide/privé; URL expirée | refus, pas d'exécution, accès sûr |
| R2 | buckets dev/prod séparés sous juridiction UE, jetons limités, URL signée expirée, copie média indépendante | aucun accès inter-environnements ni exposition permanente |
| Archive | clôturer sans replay autorisé et motif | dérogation traçable |
| UX | 360/390/768/1440 px, long poste, clavier | aucun débordement majeur, accessibilité |
| Affiches | export navigateur 1080×1350, accents, noms longs, mobile, coût mémoire | aperçu/export cohérents sans surcharge du VPS |
| Infra | redémarrage, restore, health | données intactes, rollback praticable |

## 3. Jeux de données de test

Fournir une base d'essai **anonymisée** séparée de la production. Fixtures nominatives de communication basées sur des exemples publics sont autorisées uniquement comme **démonstration**, sans présumer d'un statut réel ni pousser d'images protégées. Séries : `alumni_draft`, `confirmed_handoff`, `missing_job_title`, `publication_done`, `postponed_after_announcement`, `episode_without_replay`, `two_sessions_same_alumni`, `feedback_duplicate_import`.

## 4. E2E essentiel T01 — Passage de relais complet

1. Responsable se connecte ; crée « Alumni Test », promo, emploi, portrait factice et proposition d'épisode.
2. Production se connecte : voit proposition mais n'a pas le droit de confirmer un contact extérieur.
3. Responsable confirme date/fuseau, déclenche « Transmettre ».
4. Production reçoit une notification, ouvre le dossier, pose une demande interne de confirmation d'intitulé.
5. Responsable répond ; Production marque résolue ; états persistants au rechargement.
6. Revenir dans tableau de bord : nombre de demandes ouvertes mis à jour ; une seule notification du même relais.

**Attendu :** aucune communication externe, aucune action attribuée à l'alumni, acteurs et timestamps visibles dans l'audit.

## 5. E2E essentiel T02 — Contenus et publication

1. Créer brouillon annonce et affiche à partir de la fiche, logos autorisés, recadrage d'un portrait test.
2. Exporter le PNG 1080×1350 ; vérifier taille/absence de débordement et accents.
3. Appuyer « Copier le message » : il reste non publié.
4. Responsable valide la version ; Production confirme **manuellement** la publication dans communauté.
5. Changer la date ou la fonction : invalidation de la validation de nouvelle version ; historique de l'annonce originale conservé.

**Attendu :** version originale approuvée et publication restent traçables ; aucune double publication silencieuse.

## 6. E2E essentiel T03 — Jour J à clôture

1. Renseigner lien Teams de test et publier un formulaire de feedback natif de test.
2. Afficher conducteur sur mobile pour Responsable.
3. Responsable marque session réalisée après simulation.
4. Production prépare/constate merci immédiat et partage de formulaire.
5. Ajouter lien YouTube test ou « indisponible avec motif », importer transcript factice, sélectionner et valider une citation.
6. Créer affiche « MERCI » et brouillon replay ; vérifier blocage de partage si lien absent.
7. Clôture par Responsable, archivage et réouverture en lecture.

**Attendu :** toutes les pièces présentes, exceptions documentées, liens accessibles selon droits.

## 7. Cas E2E critiques additionnels

- **T04 Date/heure :** tester explicitement le 25 octobre 2026, 18h UTC+2 puis 18h Europe/Paris ; l'UI affiche correctement les deux instants et demande une clarification si entrée ambiguë.
- **T05 Report :** créer annonce déjà publiée, reporter, vérifier notifications futures reprogrammées et nécessité d'un message correctif.
- **T06 Contrôle de privilèges :** appeler API directe via client non UI pour toutes mutations sensibles ; 403 et aucune écriture.
- **T07 Concurrence :** édition simultanée d'un même épisode par deux navigateurs ; pas d'écrasement silencieux.
- **T08 Données historique :** import exemple CSV ancien, mapping, rejets, relance identique, dates correctes, statut legacy distinct.
- **T09 Récupération :** sauvegarder DB+médias, restaurer dans environnement isolé, vérifier login, médias, épisodes, historique.
- **T10 Incidents :** panne API ou DB, déconnexion ou refresh, erreur intelligible et reprise sûre.
- **T11 Auth fermée :** appeler les endpoints d’inscription email, tenter un premier login Google hors liste, une liaison non vérifiée et un compte révoqué ; aucun accès ni identité métier créée.
- **T12 Feedback natif :** soumettre une réponse via le lien public, vérifier absence d’accès API interne, fermeture/révocation, limite de débit et import historique idempotent.

## 8. Tests frontend/a11y

- Focus visible, labels, tabulation, Escape pour modals, texte lisible, ratio contrastes, icônes avec alternatives.
- Affiches très longues : nom sur 2 lignes, poste long et accents (`Ézéchiel`), cas photo portrait/paysage.
- 360/390 px, orientation paysage, zoom 200 %, réseau mobile lent, champs clavier virtuel, bouton collé en bas sans masquer contenu.
- Capture comparée à la maquette validée et différences justifiées.

## 9. Portes quantitatives de recette

- **Zéro échec de test bloquant** sur auth fermée email/OAuth, permissions, feedback public, sauvegarde/restore, transitions, publication, date/heure.
- **Zéro blocage** E2E T01/T02/T03 sur environnement candidat.
- Tests unitaires/intégration CI verts sur branche de livraison ; coverage utile sur domaines critiques (ne pas masquer absence de tests par seul chiffre global).
- Disponibilité et HTTPS vérifiés sur environnement production avant ouverture ; documentation d'exploitation testée par une personne autre que l'auteur de la commande.
- Recette signée par les deux organisateurs ; anomalies mineures assorties de contournement/délai.

## 10. Modèle de rapport de test

```text
Exécution : date/heure, environnement, commit SHA, jeu de données
Commande/outil : ...
Résultat : X réussis / Y échecs / Z ignorés
Scénarios manuels : ... (preuve/capture si utile)
Sécurité/permissions : ...
Écarts, gravité, reproductibilité : ...
Go/No-Go proposé : ...
```

Références : [spécifications](03_SPECIFICATIONS_FONCTIONNELLES.md) · [lots](12_PLAN_IMPLEMENTATION.md) · [go-live](19_RECETTE_FINALE_ET_GO_LIVE.md).

## Recette exécutée au Lot 1 (21 octobre 2026)

- API sur `voix_alumni_test` isolée : 8 tests réussis couvrant santé, session, inscription email refusée, garde OAuth sur identité inconnue, rôles 401/403, révocation, origine CSRF, déconnexion et rôle forgé. Le flux de rappel Google réel reste non testé sans identifiants.
- Playwright 1.64.0 dans `mcr.microsoft.com/playwright:v1.64.0-noble` : 6 parcours réussis (connexion, navigation, état vide, déconnexion, desktop/mobile), sans bibliothèques Chromium ajoutées au VPS. Captures anonymisées sous `Docs/recette/lot-1/`.
- Procédure de récupération privée exercée sur un compte de démonstration : ancien mot de passe refusé, nouveau accepté, ancienne session révoquée. Session Better Auth conservée après redémarrage effectif du processus API. Les données affichées par le tableau de bord sont vides et proviennent de l’API, sans fixture métier.

## Recette locale du Lot 2 (21 octobre 2026)

- Base `voix_alumni_test` isolée : tests API Lot 1 et Lot 2, dont refus de création d'épisode/contact/relais par Production, masquage des notes de contact, refus d'une version obsolète, doublons indicatifs, profil sans épisode, plusieurs épisodes par personne, date envisagée distincte, `Europe/Paris` et `Africa/Dakar`, refus des heures d'été ambiguës/inexistantes, report, annulation, audit et notification interne unique.
- Scénario A Playwright : Responsable crée une fiche fictive sans épisode, la retrouve après rechargement, complète poste/entreprise, crée ensuite un épisode relié et relit les données persistées. Scénario B : Responsable crée fiche et relation, programme et confirme l'épisode, transmet ; Production se connecte, retrouve le dossier et le relit après rechargement. Chaque scénario est joué en desktop et mobile, avec huit captures sous `Docs/recette/lot-2/`.
- Le premier passage complet Playwright a eu 10 succès et 2 échecs dus à une assertion du Lot 1 exigeant encore une liste vide ; l'assertion a été corrigée pour vérifier la navigation réelle. Le passage suivant a eu 12 succès et 0 échec. Le premier rendu de date affichait « Date à vérifier » ; la correction Intl et une assertion dédiée ont été rejouées avec succès.
- Les captures proviennent de données fictives réellement stockées dans la base locale ; ce jeu de recette n'est pas l'historique de production. Le callback Google réel, l'upload R2, l'import historique et les fonctionnalités des Lots 3+ restent hors de cette recette.

### Finition ciblée du Lot 2

- API : vérifier 25/10/2026 avant et après le recul d'heure (`Europe/Paris`), heure ambiguë refusée, et conversion distincte de `Africa/Dakar`. Le relais demeure autorisé lorsque « Portrait et droits d'usage à vérifier » reste dans le dossier. Les numéros 1–11 ne sont jamais attribués automatiquement aux nouveaux épisodes.
- E2E : base `voix_alumni_e2e` séparée ; tout test refuse une API sans marqueur d'isolation. Les comptes et données sont réinitialisés uniquement dans cette base avant recette. Vérifier desktop/mobile, dates `jj/mm/aaaa` sur 24 heures, libellés métier et non-recouvrement des boutons des formulaires par la navigation fixe sur émulation iPhone 13 en locale `fr-FR`.
- Porte future du Lot 4 : tester côté serveur tous les refus de diffusion avec portrait sans consentement actif, finalité correspondante et preuve, ainsi que l'invalidation après révocation ou changement de ressource. Ce moteur de contenu n'existe pas au Lot 2.

## Recette locale du Lot 5 — 22 octobre 2026

- Bases `voix_alumni_test`, `voix_alumni_e2e` et `voix_alumni_dev` vérifiées par leur nom avant migration. Migrations additives `0009`–`0011` appliquées à ces seules bases ; aucune migration de production.
- API : confirmation et relais, rôle Production/Responsable, lien Teams manuel, conducteur et revalidation, rappels lors d'un report/reconfirmation, jeton public, réponse anonyme/idempotence, import CSV répétable, versions de questionnaire, refus de publication de variante non approuvée, tenue constatée, replay avec droits, VTT synthétique, citation approuvée et clôture avec exceptions documentées. Tests de concurrence sur le lien et refus de rôle. Les ressources de test restent synthétiques.
- Playwright : flux de la fiche vers réunion et feedback, formulaire public sans session, résultat privé, session tenue, remerciement manuel, replay, transcription, citation et archive consultable, sur desktop et mobile. Captures dans `Docs/recette/lot-5/`. La recette d'archive emploie deux dérogations explicites pour l'affiche finale et le message replay ; la recette Studio des deux affiches reste dans le Lot 4.
- Vérifier avant usage réel : texte de notice et durée de conservation approuvés, domaine public/HTTPS, droits d'enregistrement/replay et citations réels, stockage R2 dev/prod et sauvegardes/restauration. Les tests isolés ne prouvent aucune diffusion externe ni aucune intégration Teams/YouTube.
