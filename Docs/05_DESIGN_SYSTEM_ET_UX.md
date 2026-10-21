# 05 — Charte visuelle, composants et règles UX

> **Projet :** Voix d’Alumni Studio · **Édition :** 21 octobre 2026 · **Statut :** Spécification initiale à valider lors du lot 0
> **Objet :** Faire de la maquette validée la référence de fidélité et de comportement.
> **Référence UX :** `Docs/voix_alumni_studio_prototype.html` (maquette de démonstration validée ; ne pas la modifier automatiquement).


## 1. Référence obligatoire

Le fichier `Docs/voix_alumni_studio_prototype.html` est **la référence visuelle acceptée**, autonome et interactive. Ne pas en faire l'application finale en conservant données fixtures et localStorage comme source métier ; recréer une interface composantisée en gardant l'ambiance, la densité, les contrastes et les parcours. Avant tout chantier UX : ouvrir et comparer les écrans réels, desktop/mobile, avec les captures de référence approuvées.

Implémentation validée : React/Vite avec Tailwind CSS et composants shadcn/ui. Mapper les jetons ci-dessous dans le thème CSS ; adapter les composants copiés à la maquette. Les styles par défaut de shadcn/ui ne sont pas une nouvelle charte.

## 2. Palette relevée dans le HTML de la maquette

| Jeton | Hex maquette | Usage recommandé |
|---|---|---|
| `--ivory` | `#F8F5F1` | fond général |
| `--white` | `#FFFDFB` | panneaux/cartes |
| `--sand` | `#DFC6B0` | filets, ornements, contours |
| `--gold` | `#BB9676` | accents/actions secondaires |
| `--deep` | `#181817` | textes profonds |
| `--muted` | `#77736E` | textes secondaires |
| `--line` | `#EAE1D8` | séparateurs |
| `--pale` | `#F0E8DF` | encarts légers |
| `--green` | `#347B60` | états positifs, non décoratifs |
| `--ink` | `#30302D` | texte général |

Le branding « officiel » des flyers a aussi des références ivoire/beige doré ; conserver **les valeurs extraites de la maquette pour la plateforme** et confirmer la gamme exacte des fichiers de logos originaux avant production des visuels.

## 3. Typographie, hiérarchie et grilles

- Grandes capitales sérif raffinées pour titres et noms (prototype : `Georgia`), sans-serif sobre pour UI et labels ; lettres espacées pour les sur-titres.
- Maintenir les trois niveaux visibles : **identité/épisode**, **action principale**, **détails secondaires**.
- Panneau latéral desktop ~253 px dans le prototype ; grille cartes proportionnée et bordures fines ; arrière-plan crème non saturé.
- Pas de modal pour des workflows de plus de quelques champs : formulaire dédié ou drawer avec progression.
- Limiter les toasts aux confirmations réelles. Bannir « succès » lorsque l'API a échoué.

## 4. Navigation cible

`Tableau de bord`, `Épisodes`, `Intervenants`, `Studio créatif`, `Communications`, `Feedback`, `Médiathèque`, `Paramètres` ; la fiche d'épisode est une route interne consultable depuis les listes. Navigation téléphone simplifiée (exemple de prototype : Accueil, Épisodes, Alumni, Messages, Studio) avec accès aux autres sections par menu « Plus » si nécessaire.

Ne pas sacrifier feedback, calendrier ou médiathèque simplement parce que la barre mobile n'a que cinq emplacements. Éviter le scroll horizontal forcé.

## 5. Composants minimaux

`AppShell`, `Sidebar`, `MobileBottomNav`, `PageHeader`, `RoleContextBadge`, `MetricCard`, `EpisodeHero`, `EpisodeCard`, `StatusBadge`, `JourneyStepper`, `TaskItem`, `AssigneePill`, `RequestPanel`, `RichMessagePreview`, `AssetCard`, `PosterPreview`, `ConfirmationDialog`, `EmptyState`, `Skeleton`, `NotificationList`, `FormField`, `DateTimeTimezonePicker`, `AuditTimeline`.

| Composant | Exigence UX |
|---|---|
| JourneyStepper | état actif, progression, erreurs bloquantes, étapes non linéaires |
| TaskItem | cocher/décocher avec confirmation serveur et auteur, pas simple localStorage |
| PosterPreview | aperçu du **moteur d'export réel** ou rendu déterministe commun |
| MessagePreview | copie explicite + publication manuelle séparée |
| RequestPanel | montrer demande et réponse ; destinataire « Responsable » non éditable vers alumni |
| DateTimeTimezonePicker | zone IANA + heure locale et équivalent dans le fuseau de l'autre organisateur |
| StatusBadge | couleurs lisibles, toujours accompagnées d'un libellé textuel |

## 6. Écran épisode — priorité de fidélité

Référence prototype : titre intervenant/promo, date, badge, barre de progression, liste verticale des huit étapes à gauche, panneau d'étape à droite avec tâches, responsabilités, règle métier et CTA. Conserver ces éléments ; remplacer les données simulées par API et les cases par mutations persistantes.

Sur téléphone : déroulé des étapes en liste ou accordéon, suivi du panneau courant, actions primaires accessibles sans contournements, liens médias ouvrables, textes WhatsApp sélectionnables et copiables.

## 7. Studio visuel et règles de composition

- Format annonce et merci : **1080 × 1350 px** (4:5) au minimum, avec preview responsive ; versions HD si besoin.
- Logos ESMT/CPS importés à partir d'assets fournis, sans recréation par IA des marques. Prévoir placement version affiche annonce ou merci suivant modèle.
- Portrait en noir et blanc sans altération identitaire, recadrage manuel possible, remplacement photo.
- Nom en serif de grande taille, poste/entreprise en sans-serif espacé, « Promo », date/heure, signature « S'INSPIRER · PARTAGER · RÉUSSIR ENSEMBLE ».
- Citation de remerciement = texte revu et attribué avec autorisation, longueur limitée avec débordement signalé.
- Tester le cas « Alassane Mballo / Technical Leader Tender MV/LV » (poste long), « Sennen Ekouagne » (nom), et le nom accentué « Ézéchiel Ouattara ».

## 8. Accessibilité et qualité responsive

- Contraste textes/badges conformément aux recommandations WCAG AA lorsque applicable ; les accents dorés clairs ne doivent pas porter seuls une information essentielle.
- Focus visible, navigation clavier, labels de champs, erreur expliquée, éléments tactiles suffisamment grands.
- Test à 360/390/430/768/1024/1440 px, paysage mobile, zoom 200 %, textes longs, connexion lente.
- Indiquer formats de dates compréhensibles : « dim. 25 oct. 2026, 18:00 UTC+02:00 » plutôt qu'une abréviation ambiguë.
- Aucun bouton factice en production. Les actions « bientôt disponible » sont clairement désactivées ou absentes.

## 9. Contrôles de non-régression visuelle

Avant chaque validation du lot UI : captures desktop/mobile des 8 rubriques, comparaison à la maquette validée, audit du scrolling, vérification des états vides et des erreurs. Aucun « rebranding moderne » non demandé. Si une divergence est inévitable pour l'accessibilité, la documenter avec compromis proposé.

Références : [spécifications](03_SPECIFICATIONS_FONCTIONNELLES.md) · [affiches](06_COMMUNICATIONS_ET_TEMPLATES.md).
