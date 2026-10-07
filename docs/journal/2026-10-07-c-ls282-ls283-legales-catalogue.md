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

## Fusion et déploiement

- PR #542, CI verte en 17 min 30, fusionnée en rebase, `837f610`. Déployée
  par le workflow, run 37582213780, sans migration.
- **Texte légal servi en production avant et après, mêmes données** : 1077
  mots identiques.
- **LCP en production, trois passages** : informations légales 992, 960 et
  1067 ms contre 926, 1069 et 912 avant ; catalogue 2057, 1928 et 2040 ms
  contre 1816, 2201 et 1855 avant. Plages confondues, CLS 0, sous les
  seuils. L'élément du LCP du catalogue reste la photographie de bijou ;
  l'aquarelle du médaillon, visible à l'arrivée, passe en
  `fetchPriority="low"` dans la PR de clôture pour ne plus lui disputer la
  bande passante.
- Constaté hors périmètre : en mobile, la première photographie du catalogue
  charge sa variante de 1280 px, noté sur LS-283 pour LS-140.

- **Priorité basse déployée**, PR #543, `dcc3df1`, run 37585065081. Six
  passages : catalogue 1934, 2120, 2284, puis 1925, 1817 et 1929 ms. Sur les
  mêmes passages, l'aide inchangée a varié de 1064 à 1372 ms : le réseau
  domine l'écart, aucune régression ni aucun gain n'est établi à cette
  précision. Résultats publiés sur LS-282 et LS-283.

## Prochaine étape

LS-284 attend la réponse de l'exploitante. LS-281 reste à traiter :
`data-borne` ne suspend pas les animations des pseudo-éléments.

## État des tickets

LS-280, LS-282 et LS-283 closes et déployées. LS-281 et LS-284 ouvertes.
