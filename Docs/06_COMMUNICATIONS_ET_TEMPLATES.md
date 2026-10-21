# 06 — Modèles de communication, questions et affiches

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Préciser données, états, textes types, contrôles et responsabilités éditoriales.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Modèle commun de template

Chaque modèle comporte : `key`, `version`, `locale=fr`, `channel`, `content`, `required_variables`, `optional_variables`, `owner_role`, `approval_required`, `active`, `created_at`. L'instance d'un message d'épisode copie la version du modèle (snapshot) ; une modification globale ne retouche pas un message déjà validé ou publié.

Variables communes : `{{alumni.full_name}}`, `{{alumni.promo}}`, `{{alumni.job_title}}`, `{{alumni.company}}`, `{{episode.number}}`, `{{episode.date_local}}`, `{{episode.time_local}}`, `{{episode.timezone_label}}`, `{{episode.meeting_url}}`, `{{episode.feedback_url}}`, `{{episode.youtube_url}}`.

**Sécurité :** échapper/sanitiser les données dans le HTML ; ne pas substituer un champ vide par une phrase trompeuse. Renvoyer une erreur UI « lien Teams manquant » avant validation de l'annonce si le template l'exige.

## 2. Modèle d'annonce — WhatsApp (copier puis publier manuellement)

```text
🎙 VOIX D’ALUMNI — PROCHAINE SESSION !

Nous aurons le plaisir d’échanger avec {{alumni.full_name}}, promotion {{alumni.promo}},
{{alumni.job_title}}{{alumni.company_phrase}}.

📅 {{episode.date_local}}
🕕 {{episode.time_local}} ({{episode.timezone_label}})
💻 En visioconférence

Au programme : parcours, expériences et conseils inspirants.
{{episode.meeting_line_optional}}

S’INSPIRER · PARTAGER · RÉUSSIR ENSEMBLE
```

**Avant approbation :** vérifier exactitude poste/promo, date et fuseau, autorisation d'utilisation du portrait joint, image finale ; décider si lien Teams est inclus dans l'annonce ou partagé plus tard. `{{alumni.company_phrase}}` est calculé sans ponctuation résiduelle si entreprise inconnue.

## 3. Modèle rappel J-1

```text
⏰ Rappel — Voix d’Alumni, épisode {{episode.number}}

Retrouvons {{alumni.full_name}} demain, {{episode.date_local}}, à {{episode.time_local}} ({{episode.timezone_label}}).

💻 Lien de la réunion : {{episode.meeting_url}}
À très bientôt !
```

**Contrôles :** si session reportée, bannir « demain » basé sur un ancien message ; recalculer dans le fuseau de l'événement et bloquer tant que l'heure n'est pas confirmée.

## 4. Merci à chaud + feedback

```text
🙏 Un grand merci à {{alumni.full_name}} et à toutes les personnes présentes à cette session de Voix d’Alumni !

Votre avis nous aide à améliorer les prochaines rencontres. Prenez deux minutes pour partager votre retour :
👉 {{episode.feedback_url}}

S’INSPIRER · PARTAGER · RÉUSSIR ENSEMBLE
```

Le message « merci à chaud » est **différent** de l'affiche finale de remerciement accompagnant le replay.

## 5. Remerciement final + replay

```text
🎬 La session Voix d’Alumni avec {{alumni.full_name}} est disponible en replay !

Merci à notre intervenant pour ce moment de partage.
▶️ Voir la vidéo : {{episode.youtube_url}}

« {{episode.approved_quote}} » — {{alumni.full_name}}

À très vite pour la suite !
```

Si aucune citation validée, supprimer proprement le bloc citation plutôt que d'inventer une phrase. Pas de lien YouTube « publié » avant publication constatée.

## 6. Report ou annulation

```text
📣 Mise à jour — Voix d’Alumni

La session avec {{alumni.full_name}} initialement prévue le {{episode.previous_date_local}} est {{episode.change_label}}.
{{episode.new_date_line_optional}}

Nous vous tiendrons informés des prochaines informations. Merci de votre compréhension.
```

Une publication corrective doit rappeler l'ancienne date **si celle-ci a effectivement été annoncée**, pas dans le cas d'un simple brouillon.

## 7. Demande interne d'informations (jamais vers alumni)

```text
Bonjour ! Pour préparer la session avec {{alumni.full_name}}, peux-tu confirmer :
{{request.bulleted_questions}}

Merci ! Dès que tu as les infos, tu peux compléter la fiche dans Voix d’Alumni Studio.
```

Destinataire interne = Responsable. Pas de bouton « Envoyer à l'intervenant ». Un éventuel bouton « Copier pour WhatsApp » est réservé aux échanges internes et requiert relecture humaine.

## 8. Trame d'interview et conducteur

**Questions communes proposées**, à éditer : « Quel souvenir marquant gardes-tu de ton parcours à l'ESMT/CPS ? », « Quels choix ont influencé ton début de carrière ? », « Quelles difficultés as-tu rencontrées ? », « Quelles compétences conseillerais-tu de développer aujourd'hui ? », « Quel conseil donnerais-tu à une personne qui commence ? ».

**Questions personnalisées :** issues du parcours fourni/confirmé (cloud, management, data, entrepreneuriat…), non de biographies supposées. Catégories : `parcours`, `premier_emploi`, `transition`, `metier`, `conseils`, `public` ; ordre, temps cible, priorité, note réservée à l'animatrice.

Exemple de conducteur adaptable : accueil/présentation 5 min ; études/transition 15 min ; expérience et métier 20 min ; conseils 10 min ; questions communauté 10 min. **Durées indicatives**, pas une norme imposée.

## 9. Templates d'affiches et assets

| Modèle | Sortie | Variables et visuels |
|---|---|---|
| `announcement_v1` | PNG 1080×1350, 4:5 | logos ESMT/CPS, mic Voix d'Alumni, photo B/N, nom, poste, entreprise, promo, date, zone |
| `thank_you_v1` | PNG 1080×1350, 4:5 | logos, photo, « MERCI », nom, promo/poste, citation facultative approuvée, note replay |

Asset officiel = fichier reçu avec informations de propriétaire/droits/versions. **Ne jamais inventer un logo institutionnel** ni attribuer une citation extraite d'un transcript non relu. Éviter l'IA pour « remplacer » le visage d'un intervenant.

## 10. Workflow éditorial et checklist de vérification

`brouillon → à_relire → validé → exporté / publié_manuellement`. Stocker `approved_by/at`, `snapshot_variables`, `template_version`, `published_by/at`, canal et preuve facultative. Pour toute correction du poste, de la date ou de la citation après validation : marquer `needs_reapproval=true`.

**Checklist annonce** : [ ] photo et droits [ ] orthographe [ ] entreprise/fonction [ ] date/heure/zone [ ] logo [ ] liens [ ] validation [ ] image exportée [ ] publication réellement effectuée.

**Checklist post-session** : [ ] merci immédiat [ ] feedback [ ] replay autorisé [ ] transcript vérifié [ ] citation approuvée [ ] affiche merci [ ] partage replay [ ] archive.

Références : [design](05_DESIGN_SYSTEM_ET_UX.md) · [automatisations](10_AUTOMATISATIONS_ET_INTEGRATIONS.md).
