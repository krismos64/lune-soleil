# 14 novembre 2026 : LS-323, douze thèmes d'ambiance

## Demande

Christophe transmet une liste manuscrite de l'exploitante : douze thèmes à
ajouter aux thèmes existants et à activer depuis son espace, « avec un beau
visuel, motion design et animations ». Un seul ticket pour le tout, pas de
tests inutiles, travail sans interruption.

La liste : Saint-Valentin (%), Pâques, printemps, automne, hiver, été,
journée de la femme (%), Octobre rose (%), Novembre bleu (%), « happy new
year », soldes d'été (%), hiver (%), lu comme les soldes d'hiver, « hiver »
figurant déjà plus haut sans la mention.

## Décisions prises en autonomie

- **Un socle commun plutôt que douze thèmes sur mesure.** Deux jetons par
  thème sous les mêmes noms, une table `AMBIANCES`, un jeu de composants
  `decor-saison.tsx`. Régime ordinaire d'ADR-046, comme `NOEL_1` : aucune
  exception au périmètre, aucun fond sombre. Sans maquette, comme LS-322.
- **« (%) » lu comme « thème associé à une réduction ».** Ces six thèmes
  portent un bandeau d'opération au contrat du bandeau Black Week :
  l'événement seul sans promotion, le taux de la promotion active sinon. Aucun
  taux écrit dans un thème.
- **« Journée de la femme » écrit « Journée internationale des droits des
  femmes »**, son intitulé officiel.
- **Octobre rose et Novembre bleu n'annoncent aucun don.**

## Fait

- `src/lib/theme-saisonnier.ts` : douze valeurs, table `AMBIANCES`,
  `ambianceDe`, `aMouvementContinu` étendu.
- `tokens.css` : douze blocs, `--ls-saison-un` et `--ls-saison-deux`, tous à
  4,5:1 au moins sur crème, sable et blanc (pire : corail de l'été sur sable,
  4,92:1).
- `decor-saison.tsx` : douze motifs dessinés en SVG, nuée (chute, montée,
  scintillement), couronne, médaillon, frise, marges, liseré de carte, ruban,
  bandeau d'opération. Aucune image générée.
- Accueil et catalogue : une seule branche pour les douze thèmes.
- Paramètres : seize choix rangés en quatre familles, pastilles de couleur,
  repère de période, aperçus de l'accueil et du catalogue par thème.
- Migration `20261114180000_themes_ambiance`, SQL manuels,
  `verifier-schema.sh`, `MODELE-LOGIQUE.md`.
- ADR-046 et ADR-045 amendés, `frontend-design.md`, `REFERENCES.md`,
  `ETAT.md`, agent `ls-frontend-revue`.

## Preuves

- `tests/e2e/themes-ambiance-ls323.spec.ts`, paramétré sur la table : 93
  passés aux quatre largeurs (attribut, `h1`, rien de promis, débordement,
  contrastes axe-core sur l'accueil et le catalogue des douze thèmes, sans
  script, borne de cinq secondes, bouton de pause, mouvement réduit, écran
  Paramètres, visiteur).
- Suites existantes : thèmes de Noël, Black Week, Paramètres et gabarit de
  titre, 273 passés ; intégration du thème, 7 passés, les seize valeurs
  enregistrées et relues ; composant du bandeau, 11 passés.
- `verifier-contraste.sh` : 15 blocs, 62 jetons. Mutation, corail de l'été
  éclairci à `#E8785C` : trois échecs nommés (2,70, 2,89 et 2,42:1), puis
  restauré. `verifier-contraste-mutation.sh` 11 sur 11,
  `verifier-migration-mutation.sh` 16 cas conformes, `db:verifier` 164
  réussites.
- Types, lint, mise en forme, `verifier-regles.sh`,
  `verifier-redaction-francaise.sh`, `verifier-bordure-controle.sh` au vert.

## Revue `ls-frontend-revue`

Aucun défaut bloquant. Mesuré sous Verdana aux quatre largeurs, cinq thèmes,
positions prélevées toutes les 150 ms : aucun décor sur un texte, un contrôle
ou une photographie, débordement nul sur 40 pages, bandeau sous promotion
simulé sans débordement à 320 px, seules `transform`, `opacity` et
`stroke-dashoffset` animées.

Corrigé dans la branche :

- « pour célébrer celles qui comptent », accord au féminin : devenu « pour une
  journée qui compte » ;
- le test du mode animé n'attendait que la première borne du catalogue : il
  attend chaque borne visible portant un décor de saison, exerce aussi
  l'accueil, et le mouvement réduit couvre les deux pages. 93 passés ;
- Paramètres : repère de période en majuscule, familles en `h3`, mention « à
  activer avec la promotion » sur les deux thèmes de soldes.

Laissé, signalé : le bouton de pause flottant recouvre par endroits la boîte
d'un titre ou d'une carte (antérieur, LS-277, étendu ici à douze thèmes) ; les
liens d'aperçu font 18 px de haut ; la case à cocher vit hors de son libellé.
Non vérifié par la revue : sept thèmes sur douze pour les croisements de
décor, la police DejaVu Sans du runner, le rendu réel sous promotion active.

## Ce qui a dérapé

- Le motif des filtres occupait toute la pastille : `.motif` fixait
  `width: 100%`, de même spécificité que la taille posée par le catalogue. Vu
  sur la première capture, corrigé en retirant la taille de la classe de base.
- `db:verifier` a rendu deux échecs sur mes deux cas neufs : il lit la base de
  développement, qui n'avait pas la migration. `db:preparer` puis 164 sur 164.

## Reste

- **Production non déployée.** La migration est classée destructive (retrait
  puis pose de la contrainte) : `./scripts/migrate-production.sh
  --confirm-destructive`, puis le workflow « Déployer en production », sur
  accord de Christophe. Aucun thème n'est activé par le déploiement.
- **À arbitrer par Christophe** : un code de promotion et un taux par
  opération pour les six thèmes « (%) ». Sans cela, la seule promotion
  activable reste `BLACK_WEEK` à 30 %, et la facture dirait « Black Week ».
- **Soldes** : mot réglementé, à n'activer que pendant les périodes légales,
  dates à vérifier aux sources avant chaque usage. Le mot s'affiche même sans
  promotion active, comme « Black Week » : usage à confirmer par Christophe.
- Issue #647 : toujours ouverte, le nocturne 102 du 14 à 08:27 UTC a tourné
  sur l'ancien `main` comme prévu. À fermer sur le premier nocturne vert.

## État des tickets

- LS-323 : En cours jusqu'au déploiement.
