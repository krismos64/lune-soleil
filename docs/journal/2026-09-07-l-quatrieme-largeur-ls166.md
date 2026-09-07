# 7 septembre 2026, l : LS-166, la largeur manquante en cachait un autre

Le projet `tablette-768` tient en quinze lignes de configuration. Ce qu'il a
révélé a occupé toute la session : un préchargement qui boucle sans fin et
laisse parfois la navigation bloquée pour toujours.

## Ce que la largeur devait montrer, et ce qu'elle a montré

`CLAUDE.md` énonce quatre largeurs à l'invariant 10, `playwright.config.ts` n'en
déclarait que trois. La manquante est celle où les dispositions basculent :
`min-width: 768px` fait passer la barre d'administration de repliée à
permanente, et les grilles d'une pile à plusieurs colonnes.

**Aucun défaut de mise en page n'est propre à 768 px**, ni débordement ni
violation axe-core. Le rendu fluide tient, et c'est le constat écrit que le
critère 2 demandait à défaut de corrections.

Ce que la quatrième largeur a révélé est ailleurs, et n'a rien d'une question de
disposition.

## Le préchargement bouclait sans fin

Toutes les routes d'administration sont `force-dynamic`, et `staleTimes.dynamic`
vaut **zéro** par défaut, vérifié via Context7 : une réponse préchargée est
périmée à l'instant où elle arrive. Next.js la jette, repart, recommence.

Journal du navigateur sur le tableau de bord **au repos** : chaque rubrique
enchaîne `200`, `ERR_ABORTED`, puis une requête neuve avec un jeton `_rsc`
différent. Onze rendus serveur en boucle, chacun interrogeant PostgreSQL, pour
un écran que personne ne touche.

**Ce n'est pas qu'une dépense.** La navigation réelle entre en concurrence avec
ce flot et perd parfois la course : l'URL change, et le `<main>` n'arrive
**jamais**, ni celui de la page ni celui de son `loading.tsx`. Mesuré : toujours
bloqué après 61 secondes, deux essais sur quatre. La personne reste devant une
coquille vide, sans rien qui lui dise quoi faire.

Vingt liens portent désormais `prefetch={false}`, règle **C40**.

## La parade évidente était fausse, et la mesure l'a dit

`staleTimes.dynamic` est le réglage que la documentation met en avant, et c'est
celui qu'il ne fallait pas poser ici : il rend réutilisable le **layout**, donc
les pastilles de comptage. À cinq secondes, la barre annonce encore « 1 message
non lu » sur une liste qui n'en montre plus aucun.

Il a fait passer `navigation-administration` de deux largeurs en échec à trois,
et ajouté un échec sur les états non nominaux. **Il n'a rien fermé et a ouvert
autre chose.** Le motif est écrit dans `next.config.ts`, à l'endroit exact où la
prochaine session serait tentée de l'ajouter.

## Quatre hypothèses fausses avant la bonne

Le test `classer un message ferme son bloc de gestes` a résisté longtemps, et
c'est la partie instructive de la session.

J'ai d'abord cru à une **accumulation de messages** en base : la mesure a montré
un seul message par largeur, `session-administration.setup.ts` nettoyant au
démarrage. Puis à un **composant remonté** par la revalidation : démenti par
`toBeDisabled` qui passait pendant que le message manquait. Puis à un `disabled`
**d'origine serveur** qui survivrait à ce remontage : démenti en inversant les
deux assertions, ce qui a fait échouer `toBeDisabled` sur les quatre largeurs.

La cause réelle n'est apparue qu'en ancrant l'assertion sur la région
`role="status"`, **parce que cet ancrage rapporte la valeur lue** au lieu de
« element(s) not found » : la région affichait « Enregistrement en cours… »
pendant les trente secondes entières. La Server Action était simplement lente,
sa revalidation de layout recalculant onze comptages sous quatre largeurs
concurrentes.

**Un locator qui dit ce qu'il a lu vaut mieux qu'un locator qui dit qu'il n'a
rien trouvé.** Trois hypothèses seraient tombées plus vite avec cette forme.

## Trois défauts de test préexistants

Ils échouaient sur `main` avant cette branche, la mesure de référence les porte.

Le plus net : `getByLabel("Mot de passe")` trouvait **deux** éléments depuis que
LS-179 a ajouté la bascule d'affichage, dont le nom accessible porte la même
sous-chaîne. `exact: true` le ferme. Le réflexe `getByRole("textbox")` aurait été
faux, un `input[type=password]` ne portant pas ce rôle.

`factures-administration` forçait 1280 px tout en tournant aux quatre largeurs,
donc quatre fois le même parcours. `navigation-administration` comparait deux
nombres venus de deux rendus serveur, que le `Promise.all` de LS-201 ne pouvait
pas accorder : il supprimait l'écart entre deux lectures du test, pas celui
entre les deux rendus.

## Le contrôle s'est trompé sur son propre dépôt

`verifier-prefetch-administration.sh` a rendu **deux faux positifs** à sa
première exécution, sur des liens parfaitement conformes. `error.tsx` explique
son choix en écrivant « `<Link>` ET NON UN `<a>` NU » dans le commentaire qui
précède le lien : pris pour une balise, ce texte faisait chercher `prefetch`
dans quelques caractères de prose.

Motif connu de ce dépôt, « le commentaire qui décrit la règle la déclenche ». Le
quatrième sens du script de mutation garde désormais cette propriété : retirer le
saut des commentaires doit faire crier le contrôle sur un dépôt conforme.

## Mesures

| | largeurs | durée | tests |
|---|---|---|---|
| avant | 3 | 2 min 07 s | 1106 |
| après | 4 | 2 min 40 s | 1466 |

Le facteur quatre tiers annoncé par le ticket est vérifié. Aucun plafond de débit
n'est neutralisé : la quatrième largeur coûte deux comptes de plus, amorcés une
seule fois dans la vie de la base, et zéro appel d'authentification en régime
établi.

`verifier-config-claude.sh` a attrapé une divergence que j'aurais ratée, le
README annonçant encore trois largeurs.

## Ce qui reste ouvert

**Quatre tests d'intégration échouent sur `main`**, tous sur `chemin_pdf` :
`facture.sequential`, `acces-document.sequential` et deux de
`comptabilite-administration.sequential`. Leurs assertions attendent
`chemin_pdf` nul, état d'avant LS-129 ; depuis, le rendu du PDF a lieu après le
commit dans le même appel, donc la colonne est renseignée quand le test relit.
Reproductible en isolation sur une base éphémère neuve. Aucun fichier de cette
PR ne touche ce domaine, les corriger ici aurait mélangé deux sujets.

**La confirmation « Message classé » vit dans un `useState`** du composant
client, donc elle disparaît si la liste se re-rend, alors que son texte demande
justement de rafraîchir la page. Signalé sans ticket.

## État des tickets

**LS-166 livrée**, PR #296, commit `3d9f8a5`. Reste à fusionner sur `main`.

Comptes inchangés par ailleurs : **139 tickets terminés sur 192**, LS-166 portant
le compte à 140 une fois close.

## Prochaine étape

**LS-174**, le numéro d'avoir lisible une seule fois, puis LS-163 et LS-193,
la série de tickets courts décidée en début de session.
