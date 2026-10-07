# 7 octobre 2026 : LS-282 et LS-283, informations légales et catalogue

Suite de `2026-10-07-b`.

## Ce qui a été fait

- **Demande de Christophe** : refondre `/informations-legales` et
  `/catalogue` dans le style de l'aide, avec motion design, critique et
  images de Codex, **sans maquette**, autonomie complète sur la session et
  ADR modifiables. LS-282 et LS-283 créées sous LS-7.
- **Critique de Codex avant de coder.** Retenu : sommaire légal compact,
  collant seulement à partir de 1100 px ; rubriques avant tout décor à
  320 px ; en-tête du catalogue plus court que celui de l'aide ; ADR amendé
  avant les décors. Écarté sur son conseil : « création sur mesure » dans la
  bande de nuit, faute d'offre confirmée, ancres animées, sections repliables.
- **`MedaillonAube`**, composant serveur partagé, extrait de l'aide : trois
  pages l'emploient, chacune avec sa taille d'image.
- **Informations légales** : en-tête d'aube, médaillon absent sous 768 px,
  sommaire à icônes, sections en panneaux, icône tracée dans chaque titre.
  **Aucun mot juridique modifié** : les six sections extraites du source
  avant et après donnent 1195 mots identiques, et la comparaison voit un mot
  changé, prouvé par mutation (« quatorze » en « quinze »).
- **Catalogue** : en-tête d'aube court, médaillon à côté du titre, pastilles,
  bande de nuit « Écrire à l'atelier ». Hors thème de Noël seulement, par un
  critère unique, la classe `.ordinaire` posée depuis `estThemeDeNoel`.
- **ADR-045 amendé**, règles et aiguillage propagés. Deux aquarelles de
  Codex, une lettre aux pages blanches et un écrin vide, sans métadonnées.
- **Vérifié** : types, lint, Prettier ; 65 des 67 scripts de
  `controles.yml`, les deux autres rouges sur `main` aussi en local (mémoire
  du poste) ; Playwright sur onze specs des pages touchées et voisines, Noël
  compris. Référence de production avant déploiement, trois passages :
  catalogue 1816, 2201 et 1855 ms, informations légales 926, 1069 et 912 ms,
  CLS 0.

## Dérives

- **Revue `ls-frontend-revue`, défauts corrigés** : l'introduction légale
  annonçait des conditions de vente « réunies » alors qu'elles sont en
  rédaction ; un conteneur d'étoiles sans hauteur était sauté par le test à
  toutes les largeurs, sur le catalogue **et sur l'aide de LS-280** ; une
  étoile pouvait toucher le titre vers 768 px ; voile dégressif sous 768 px ;
  poussière d'or affichée en mouvement réduit contre la règle des
  paillettes ; deux critères « hors Noël » différents.
- **`data-borne="fin"` met en pause une animation déjà terminée**, qui
  signale alors `paused`. Le contrôle « animation terminée » se lit donc au
  temps écoulé, prouvé par deux mutations (étoiles à 9 s, rayons à 8 s).
- Le test existant du sommaire légal cherchait `main > section[id]` : les
  sections vivent désormais dans la colonne de contenu.
- La base locale de développement a un catalogue vide : la composition avec
  des cartes s'est vérifiée par des captures prises sur la base de bout en
  bout, test jetable non commité.

## Prochaine étape

PR, fusion, déploiement, mesure du LCP des deux pages en production, et
comparaison du texte légal servi avant et après sur les mêmes données.

## État des tickets

LS-282 et LS-283 en cours jusqu'à la mesure en production. LS-284 ouverte
sous LS-22 : confirmer ou retirer l'offre de création sur mesure du contact.
LS-281 ouverte.
