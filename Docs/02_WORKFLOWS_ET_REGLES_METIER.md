# 02 — Workflows et règles métier

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Modéliser les parcours, responsabilités, transitions et cas exceptionnels.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Deux machines d'état indépendantes

### 1.1 Statut du profil alumni

`brouillon → à_contacter → contacté → intéressé → confirmé` ; branches possibles `à_relancer`, `indisponible`, `décliné`, `archivé`. « Déjà intervenu » doit être une **propriété dérivée** des épisodes achevés, pas un état exclusif qui empêche de le réinviter.

- `brouillon` : nom minimal, aucune date requise.
- `à_contacter` : proposition enregistrée, premier contact pas encore constaté.
- `contacté` : un contact a été **manuellement marqué** ; journaliser date/canal sans stocker inutilement le message privé.
- `intéressé` : accord de principe, date encore négociable.
- `confirmé` : date ou période convenue, accord de participation confirmé par la Responsable.
- `indisponible/à_relancer/décliné` : raisons facultatives, non bloquantes pour une future proposition.

**Invariant :** la Responsable est seule autorisée à déclarer des prises de contact et confirmations de l'alumni. Aucun changement automatique de statut basé sur une copie de message.

### 1.2 Statut de l'épisode

`proposition → à_confirmer → confirmé → en_préparation → prêt → réalisé → postproduction → clôturé` ; transitions transverses `reporté`, `annulé`, `à_corriger` depuis les états non clôturés. Le numéro d'épisode est attribué **une fois selon une règle choisie**, jamais basé sur l'ordre d'import aléatoire.

- `proposition` n'exige pas un numéro définitif ni de date : on peut créer un épisode candidat.
- `confirmé` exige intervenant valide, date/heure/fuseau et confirmation Responsable.
- `prêt` exige tâches bloquantes et validations de communication, **pas uniquement un pourcentage**.
- `réalisé` nécessite confirmation humaine que la session a bien eu lieu.
- `postproduction` contient remerciements et ressources en cours de traitement.
- `clôturé` nécessite les obligations définies à la section 4 ou une dérogation auditée.
- `reporté` conserve les dates précédentes et crée une nouvelle édition des échéances futures.
- `annulé` ne supprime ni l'alumni ni les contenus déjà diffusés.

## 2. Parcours des huit étapes issu de la maquette validée

| Étape | Propriétaire principal | Actions indispensables (résumé) | Dépendances / preuves |
|---|---|---|---|
| 1 Repérage et contact | Responsable | fiche, promotion/parcours connu, premier contact | journal du contact |
| 2 Confirmation et relais | Responsable | accord, date+zone, photo et poste, transmission | `handoff_at`, alerte Production |
| 3 Dossier et questions | Production | vérifier identité/fonction/photo, trame ; questions internes | sources, consentements, demandes internes |
| 4 Affiche et annonce | Production (+ validation Responsable) | affiche, texte, validation, publication, preuve | versions approuvées, `published_at` manuel |
| 5 Réunion et rappels | Production | lien, feedback, tests d'accès, rappel J-1, conducteur | URLs valides, échéances |
| 6 Jour J | Responsable anime | présence/accès, session, enregistrement autorisé | session tenue constatée |
| 7 Remerciements et feedback | Production | remerciement immédiat, lien de feedback partagé | envoi constaté, lien |
| 8 Replay et clôture | Production | replay, transcription relue, visuel final, partage, archive | URLs/fichiers, checklist clôture |

Les cases de la maquette illustrent les étapes ; en vraie application, `done` nécessite auteur, horodatage et parfois justificatif. La responsabilité est portée au niveau tâche ; la Responsable peut avoir une validation dans une étape possédée par Production.

## 3. Le passage de relais (contrat métier central)

1. Responsable crée un Alumni indépendant.
2. Elle associe un épisode candidat lorsqu'une session est envisagée.
3. Elle complète date/heure/fuseau, fonction, entreprise, photo et provenance (les champs non critiques peuvent rester « inconnus »).
4. Elle choisit « Transmettre à la production » ; l'action est explicite et horodatée.
5. Production reçoit une notification **interne**, ouvre le dossier, visualise les manquants.
6. Production crée une `InformationRequest` adressée à la Responsable, regroupable avec d'autres demandes.
7. Responsable contacte l'alumni **en dehors de l'application si nécessaire**, renseigne la réponse ou « information indisponible ».
8. Production reprend la préparation ; la Responsable conserve l'unique relation externe.

**Règle :** aucun champ `alumni_email`/`phone` ne doit être exploité automatiquement pour une communication sortante. Les demandes internes ne doivent jamais prendre l'alumni comme destinataire.

## 4. Critères de passage et exceptions

| Porte | Exigences obligatoires | Dérogation |
|---|---|---|
| Confirmation | Réponse de la Responsable + date/fuseau confirmés | Aucune confirmation fictive |
| Approbation affiche | identité/fonction vérifiées, portrait autorisé, logo autorisé, version figée | correction puis nouvelle version |
| Publication annonce | message approuvé + affiche approuvée + canal choisi | diffusion manuelle tracée uniquement |
| Passage « prêt » | lien accessible, formulaire prêt, rappels préparés, conducteur transmis | motif + valideur obligatoires |
| Réalisation | présence/session réellement tenue | reporter/annuler au lieu de déclarer réalisé |
| Clôture | retour communauté, replay ou motif d'absence, ressources archivées | exception documentée et historisée |

Un enregistrement non autorisé => pas de publication vidéo. L'absence de replay n'empêche pas nécessairement une clôture **si** le motif explicite et la validation Responsable sont conservés.

## 5. Statuts de sous-objets

**Contenu** : `brouillon → à_relire → validé → prêt_à_publier → publié`, ou `rejeté`, `remplacé`. `copié` est un événement UI, **pas** un état de publication. Un contenu modifié après validation retourne en `à_relire`.

**Tâche** : `à_faire → en_cours → terminée` ; `bloquée`, `ignorée_avec_raison`. Stocker `completed_by/at`, preuve et `updated_at`. Ne pas laisser les tâches ignorées compter comme terminées sans décision explicite.

**Demande interne** : `ouverte → prise_en_charge → répondue → résolue` ; `annulée`. Les statuts `répondue` et `résolue` ne se confondent pas : Production peut encore demander une précision.

**Publication externe** : `prévue → réalisée/manuellement_confirmée → corrigée/retirée` ; journal de canal, date, opérateur, lien/preuve facultative. Ne jamais déduire `réalisée` depuis un export image ou un texte copié.

## 6. Replanification et fuseaux horaires

- Stocker `start_at` (UTC) **et** `event_timezone` IANA (ex. `Africa/Dakar`, `Europe/Paris`), avec affichage compréhensible côté utilisateurs.
- Toujours afficher une date locale **avec la zone et l'offset calculé pour cette date**. Ne pas coder en dur « GMT+2 ».
- Si date modifiée, recalculer les échéances **non exécutées** de type J-7, J-3, J-1, après-session. Conserver celles déjà réalisées et notifier de la nécessité éventuelle d'une communication corrective.
- Marquer `schedule_version` pour rattacher chaque rappel à la version du calendrier ; idempotence `episode+type+version`.
- **Anomalie à trancher** : l'affiche de l'épisode #10 indique `25/10/2026 à 18h GMT+2` alors que la France revient à UTC+1 ce jour-là. Confirmer s'il s'agit de **18h GMT+2 = 16h UTC** ou **18h Paris = 17h UTC**, avant annonces et rappels.

## 7. Cas limites à couvrir par tests

- Une fiche alumni sans épisode ni date ; deux épisodes avec la même personne.
- Une Responsable transmet deux fois : pas de notification doublonnée non justifiée.
- Production coche « publié » sans validation : refus serveur.
- Demande complémentaire créée après impression d'une affiche : contenu redevient à relire si champ critique change.
- Plusieurs retours de feedback anonymes et dépourvus d'adresse personnelle.
- Annulation après annonce déjà publiée : conserver annonce, proposer texte correctif.
- Replay absent ou non autorisé : clôture justifiée et non suppression des tâches.
- Un autre organisateur édite une fiche simultanément : détection de conflit/version.
- La date dépasse J-7 au moment de confirmation : tâche d'annonce due immédiatement, pas programmation dans le passé.

## 8. Événements d'audit attendus

`alumni.created`, `alumni.contact_status_changed`, `episode.created`, `episode.confirmed`, `episode.handed_off`, `episode.rescheduled`, `task.completed`, `request.created`, `request.resolved`, `content.approved`, `publication.confirmed`, `asset.uploaded`, `episode.closed`. Journaliser acteur, date, identifiant ressource, avant/après non sensible et source de l'événement ; protéger les notes privées.

Références : [modèle](08_MODELE_DE_DONNEES.md) · [API](09_CONTRATS_API.md) · [tests](14_PLAN_DE_TESTS_ET_RECETTE.md).
