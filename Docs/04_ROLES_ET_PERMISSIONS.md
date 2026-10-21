# 04 — Rôles, autorisations et validations

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Fixer un modèle d’accès simple, réellement appliqué côté serveur.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## Principes

- **Deux comptes nominatifs**, `RESPONSABLE` et `PRODUCTION`. Pas de rôle configurable ni imitation de « changer de rôle » en exploitation.
- Better Auth fournit la session dans le backend Hono ; l'autorisation nominative et le rôle métier sont vérifiés côté serveur. Les inscriptions publiques email et Google OAuth restent désactivées, même pour une adresse de domaine connu.
- Les deux voient la liste des épisodes, le parcours global et les ressources partagées. Les actions sont différenciées et attribuées.
- La Responsable **seule** suit la relation avec l'alumni. Production peut préparer des contenus mais ne peut ni marquer un contact avec l'intervenant ni diffuser vers ce dernier.
- Une action « publication communautaire » peut être effectuée par Production si cela correspond à la réalité, mais demeure un **constat manuel**, pas un envoi technique.
- Le backend refuse les opérations hors droits même si l'UI permet de deviner l'URL.

## Matrice d'autorisation V1

`L` = lecture ; `C` = création ; `M` = modification ; `V` = validation ; `—` = interdit. Légende : « service » = opération backend, non simple bouton caché.

| Action | Responsable | Production | Règles |
|---|---|---|---|
| Voir intervenants et épisodes partagés | L | L | auth requise |
| Proposer un alumni | C/M | C (brouillon interne) | la Responsable conserve le contact externe |
| Marquer contact/interessement/confirmation alumni | M/V | — | journaliser auteur + date |
| Transmettre dossier à la production | V | — | notification interne et idempotence |
| Compléter poste, bio, promo, photo (donnée descriptive) | M | M | modification majeure invalide visuel |
| Voir coordonnées personnelles | L si utile | À limiter / masquer par défaut | base légale et besoin établis |
| Créer demande d'information interne | C/M | C/M | destinataire = Responsable ; pas alumni |
| Répondre au nom du contact alumni | M | — | réponse interne, pas adresse externe |
| Préparer questions, conducteur | L/M | L/M | Responsable détient validation finale d'animation |
| Préparer texte, affiche, ressources | L/M | C/M | auteur/version tracés |
| Valider affiche/message | V | demande de validation | workflow de validation configurable seulement après décision humaine |
| Constater publication dans communauté | L/M | L/M | canal réel + horodatage + auteur |
| Définir lien Teams/formulaire | L/M | C/M | vérification par tâches |
| Marquer session réalisée | V | proposition | confirmation Responsable |
| Transcription et replay | L/V | C/M | droits média avant publication |
| Clôturer épisode | V | demander la clôture | dérogations auditées |
| Inviter/retirer compte organisateur | décision propriétaire | décision propriétaire | administration bootstrap limitée |
| Exporter/supprimer données sensibles | décision propriétaire + journal | décision propriétaire + journal | politique de conservation |

## Validation et séparation des devoirs

La maquette prévoit « Obtenir la validation requise » par la Responsable sur l'étape Affiche & annonce. En V1, traiter la validation comme une action distincte du travail de Production, avec commentaire et horodatage. Si la Responsable produit elle-même un contenu, les règles d'auto-validation devront être explicites et décidées par le propriétaire.

## Portées des données

L'application peut être mono-organisation, mais l'autorisation `episode:read` doit valider l'identité ; ne pas compter sur un ID obscur. Pour médias, fournir URL signée temporaire si stockage privé. Les feedbacks anonymes et notes internes ne doivent jamais apparaître dans une page publique de présentation.

## Tests d'autorisation impératifs

1. Production appelle un endpoint « confirmer le contact alumni » : **403** sans mutation.
2. Production crée une demande dont `recipient_user_id` serait un participant externe : **422** ou **403**.
3. Utilisateur non authentifié lit média privé : **401** ; ancienne URL signée expirée : **403**.
4. Responsable valide un contenu, puis Production édite poste/nom : validation précédente automatiquement invalidée.
5. Frontend « switcher de rôle » ne permet pas d'obtenir la permission backend d'un autre rôle.
6. Suppression d'un utilisateur n'efface pas son historique d'action (références conservées selon règles de confidentialité).

## Bootstrap et évolution

Le premier propriétaire peut créer les deux comptes via commande d'administration ou écran verrouillé ; aucun « admin/admin » ni mot de passe envoyé en clair. Une éventuelle équipe élargie serait un chantier V2 indépendant et non un motif d'anticiper 30 permissions granulaires en V1.

Références : [auth sécurité](13_SECURITE_ET_CONFIDENTIALITE.md) · [API](09_CONTRATS_API.md).
