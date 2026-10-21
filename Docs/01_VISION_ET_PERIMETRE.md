# 01 — Vision, utilisateurs et périmètre

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Définir ce qu’est le produit et ce qui constitue une V1 utilisable.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Problème réel à résoudre

Aujourd'hui, l'organisation est dispersée entre une feuille Google Sheets, messages WhatsApp, affiches, contacts d'intervenants, liens Teams, formulaires, fichiers vidéo et publications YouTube. Les organisateurs doivent réconcilier manuellement les dates, statuts, versions de contenu et tâches effectuées. Une nouvelle session recommence presque de zéro.

**Résultat attendu :** un lieu unique de préparation et d'historique, structuré comme un parcours d'épisode, sans exiger de remplacer immédiatement les plateformes externes utilisées par la communauté.

## 2. Utilisateurs et responsabilité

| Persona | Utilisation principale | Limite explicite |
|---|---|---|
| Responsable de l'initiative | Vivier alumni, prises de contact, confirmation, transmission, décisions, conducteur d'animation | **Seule interlocutrice des intervenants** |
| Coordination & Production | Dossiers, questions à transmettre, affiches, WhatsApp, logistique, feedback, replay et archives | Ne contacte pas les alumni directement |
| Communauté participante (publique) | Lit annonces, assiste au webinaire, éventuellement répond au feedback | Pas de compte organisateur ni d'accès aux dossiers |

Le MVP n'exige que deux comptes internes. Ne pas inventer rôles « Marketing », « Commercial », « Administrateur global » ou facturation.

## 3. Vision produit

**Voix d’Alumni Studio** est un espace de travail qui montre **où en est chaque épisode, ce qu'il manque, qui agit ensuite et quelles ressources ont été produites**. Il doit proposer des modèles prêts à adapter, des rappels contextuels et un historique exploitable, sans automatiser les relations humaines avec les intervenants.

## 4. Principes non négociables

1. Un alumni existe sans épisode ; un alumni peut intervenir à plusieurs dates.
2. La proposition d'épisode est distincte de la confirmation : dates et statuts ne sont pas confondus.
3. Le passage de relais produit une notification interne et un suivi sans rompre l'unicité de contact externe.
4. Un message **brouillon** ou **copié** n'est pas une publication ; une image « générée » n'est pas « validée ».
5. Les données de la maquette ne sont pas synchronisées et ne constituent pas des faits opérationnels.
6. En cas de report, conserver événements et dates historiques ; recalculer les échéances futures, pas les actions déjà réalisées.
7. Respecter l'autorisation d'utiliser portrait, marque, enregistrement, citation et données personnelles.

## 5. Périmètre cible en trois horizons

| Capacité | V1 pour premier épisode officiel | V2 | V3 |
|---|---|---|---|
| Comptes privés et rôles binôme | **Obligatoire** | — | — |
| Vivier intervenants, notes, fichiers | **Obligatoire** | enrichissement assisté | — |
| Épisode, workflow, tâches, relais, journal | **Obligatoire** | modèles de parcours configurables | — |
| Alertes internes, échéances recalculées | **Obligatoire** | digest email | notifications multi-canal |
| Messages et modèles WhatsApp copiables | **Obligatoire** | bibliothèque enrichie | uniquement API autorisée |
| Affiche annonce + merci, prévisualisation/export réel | **Obligatoire en V1 : studio simple et export réel** | éditeur avancé | déclinaisons automatiques |
| Lien Teams et suivi de publication | **Saisie manuelle et vérification** | Graph si autorisé | automatisation facultative |
| Formulaire feedback | **Formulaire natif obligatoire**, réponses protégées et import historique | enrichissement des statistiques | segmentation avancée |
| Replay, transcription, citation, archivage | **Liens / fichiers + revue humaine** | extraction/assistants | publication intégrée autorisée |
| Migration du Google Sheets | **Obligatoire si données fournies** (prévisualisation, dédoublonnage, contrôle) | — | — |

Un **MVP utilisable** n'est pas réduit à une démonstration graphique : données persistantes, authentification, rôles, historique et workflow doivent être réels. Pour les visuels, la recette impose au moins une filière documentée produisant les deux formats finalisés, idéalement native.

## 6. Hors périmètre V1

Inscription payante, billetterie, CRM multi-organisations, messagerie vers alumni, extraction automatique LinkedIn non autorisée, transcription autonome non vérifiée, publication WhatsApp groupe par API non vérifiée, réseau social alumni complet, analytics individuels de visionnage, abonnement/paiement, administration d'une équipe nombreuse.

## 7. KPI utiles — ne pas « remplir » avec des valeurs inventées

- Épisodes à venir, en préparation, terminés, archivés ; statut du dernier parcours.
- Actions obligatoires échues / en retard et délai de préparation.
- Taux de fiches complètes, demandes internes ouvertes et leur délai de réponse.
- Publications constatées versus brouillons prêts ; replay disponible oui/non.
- Réponses feedback par épisode **si sources réelles disponibles**, sans supposer nombre de participants.

## 8. Hypothèses, dépendances et décisions ouvertes

- **Validé par l'utilisateur :** maquette esthétique/UX, équipe de deux, rôle central de la Responsable et contact alumni uniquement par elle.
- **Validé après rédaction initiale :** monorepo TypeScript, React/Vite + Tailwind CSS + shadcn/ui, Node.js/Hono + Better Auth intégré, Drizzle + PostgreSQL ; studio d'affiches simple et feedback natif en V1.
- **À décider :** domaine final, politique de conservation, propriété des comptes Google OAuth et règles de publication du feedback natif.
- **À confirmer immédiatement :** heure réelle de l'épisode du 25 octobre 2026 en raison du changement d'heure en France ; ne rien envoyer automatiquement avant résolution.

## 9. Critères de succès / non-succès

**Succès** : les deux responsables réalisent une session fictive complète sans spreadsheet et savent chacun quelle est la prochaine action ; la session réelle suivante est suivie dans l'application ; le lien Teams, le feedback, les messages et le replay sont retrouvables.

**Échec** : application seulement visuelle ; étapes « terminées » sans preuve ; données perdues au reload ; personnes réelles contactées automatiquement ; fusion des profils/épisodes ; changement d'heure non clarifié ; impossibilité de restaurer les données.

Références : [workflows](02_WORKFLOWS_ET_REGLES_METIER.md) · [spécifications](03_SPECIFICATIONS_FONCTIONNELLES.md) · [recette](19_RECETTE_FINALE_ET_GO_LIVE.md).
