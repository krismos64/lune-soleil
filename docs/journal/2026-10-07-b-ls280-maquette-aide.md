# 7 octobre 2026 : LS-280, la page Livraison et aide en motion design

## Ce qui a été fait

- **Demande de Christophe** : refondre `/aide` en motion design, assortie à
  l'accueil, avec critique et images de Codex, et une maquette à valider avant
  tout code. LS-280 créée sous LS-7, aucun ticket n'existant.
- **Contradiction signalée** : ADR-045, point 7, classe l'aide en page Action,
  micro-interactions seulement. La maquette sert d'arbitrage, comme LS-268 pour
  le contact ; l'amendement s'écrira si elle est validée.
- **Maquette** `docs/prototypes/aide-animee/` : héros d'aube avec aquarelle
  cerclée et anneau tracé, trois fiches de mode comparables, franchise à part,
  parcours du colis en quatre étapes avec un colis qui le parcourt, cadran de
  quatorze lunes pour la rétractation, deux parcours de retour, FAQ sur un ciel
  de nuit. Deux aquarelles générées par Codex, réencodées sans métadonnées.
- **Mesuré dans le navigateur** : fin de la plus longue séquence à 4,5 s,
  aucune animation infinie, zéro animation et tout le décor dessiné en
  mouvement réduit, aucun débordement à 320 px.
- **Codex a critiqué deux fois** : la page actuelle, puis la maquette. Retenu
  et écarté détaillés dans le README de la maquette.

- **Maquette validée par Christophe** le même matin. ADR-045 reçoit son
  amendement (l'aide passe de « micro-interactions » à « décor animé à
  l'entrée de chaque section, contenu immobile »), propagé à
  `frontend-design.md` et à la table de `REFERENCES.md`.
- **Portage** dans `src/app/(boutique)/aide/` : composant serveur, aucun
  composant client propre, mouvement tout en CSS borné par `data-borne`.
  Tarifs et seuil lus en configuration, message si elle est invalide. Les
  deux aquarelles entrent dans `public/habillage/`, documentées.
- **Vérifié** : types, lint, Prettier ; Vitest complet 1766 sur 1766 ;
  Playwright 400 sur 400 sur six specs (aide, informations légales, portes
  d'entrée, contact, référencement, gabarit de titre), sur un build refait ;
  `verifier-regles`, `contraste`, `metadonnees-habillage`,
  `atteignabilite-boutique`, `propagation-docs`, `tests-non-ignores` verts.
  Rendu contrôlé à 320 et 1280 px. LCP de référence en production avant
  déploiement : 1067 ms, CLS 0, performance 100, accessibilité 100.
- **Revue `ls-frontend-revue`** : six défauts, tous corrigés (voir plus bas).

## Dérives

- J'avais écrit « emballé à la main » dans une étape du parcours : le type
  d'emballage fait partie des questions 38 à 42 sans réponse, LS-26. Retiré.
- Une session parallèle sur LS-279, dans le même dossier, a embarqué les
  brouillons de la maquette dans deux commits poussés, `8704483` et `4b2e564`,
  dont deux PNG de 2 Mo. Prévenue, elle a réécrit sa branche non fusionnée :
  la PR #539 porte `88c49a0`, `f6b8c5b` et `9c59aec`, dont aucun ne touche
  `docs/prototypes`, vérifié après `git fetch`. Cause : un `git add -A` dans
  un dossier partagé. LS-280 est commitée depuis un worktree séparé pour ne
  pas changer de branche sous l'autre session.
- Défauts relevés sur la page en production, à corriger au portage : le lien
  « page de contact » du bloc FAQ s'affiche en bleu navigateur ; le contact
  annonce des « délais » sur une page qui n'en publie aucun.

- **Le bouton « Déclarer une rétractation » de la maquette menait à une
  404** : `/retractation` n'existe pas, seule `/retractation/[jeton]`, lien
  signé de l'email. `verifier-atteignabilite-boutique.sh` l'a vu. Il devient
  « Mes commandes », et la puce reprend mot pour mot les pages légales.
- **Le trait du chemin du colis était un `::after`**, que
  `[data-borne="attente"] *` n'atteint pas : il se dessinait hors de l'écran.
  Le test e2e l'a vu au premier passage ; je l'avais d'abord assoupli en
  excluant les pseudo-éléments, ce qui masquait le défaut. La revue l'a
  relevé : le trait devient un élément, le test garde sa sévérité. **Les
  autres pages bornées ont le même angle mort**, ticket ouvert.
- **Les étoiles de décor de la FAQ couvraient deux lettres à 320 px**, vues à
  l'écran : masquées sous 768 px, tenues au tiers droit au-delà.
- **Worktree et Docker Compose** : depuis `../lune-soleil-ls280`, Compose
  déduit un autre nom de projet et tente de recréer `lune-soleil-db-e2e`.
  `COMPOSE_PROJECT_NAME=lune-soleil` le corrige. Le `.env` y est un lien
  symbolique posé par Christophe.
- **Un contrôle visuel a d'abord montré l'ancienne page** : Chrome servait sa
  feuille de style en cache. Le build était à jour, vérifié sur les noms de
  fichiers servis par `curl`.

## Prochaine étape

PR, CI verte, fusion en rebase, puis déploiement par le workflow « Déployer en
production » sur accord de Christophe, et mesure du LCP de `/aide` en
production par `scripts/mesurer-site-deploye.sh`, à confronter aux 1067 ms
d'avant. LS-280 se clôt sur cette mesure.

## État des tickets

LS-280 en cours, critères 1 à 6 remplis, le 7 attend le déploiement. LS-279
close et déployée par l'autre session.
