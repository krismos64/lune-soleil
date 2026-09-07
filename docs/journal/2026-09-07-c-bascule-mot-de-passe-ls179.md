# 7 septembre 2026, c : relire son mot de passe, et six champs pour quatre annoncés

LS-179, choisie par Christophe après un point d'avancement. Le ticket demandait
un bouton de bascule sur quatre écrans. Le dépôt en portait **six sur cinq
fichiers**.

## L'écart de périmètre, trouvé avant d'écrire

La description annonçait « `type="password"` en dur » à deux emplacements, avec
une liste de quatre écrans. Une recherche sur tout `src/` en a donné huit, dont
deux pour l'administration, exclue à juste titre par ADR-021, et **deux pour le
profil, absents de la liste**.

Les deux champs oubliés sont « Mot de passe actuel » et « Nouveau mot de
passe ». Le second est le cas d'usage le plus fort de la story : c'est
exactement là qu'un mot de passe neuf de seize caractères se saisit, ce que
ADR-023 impose et que la story existe pour rendre praticable.

**Arbitrage de Christophe : les inclure.** La description du ticket est
corrigée par un commentaire.

Ce que cet écart dit du reste : le ticket avait été écrit en lisant deux
fichiers, pas en interrogeant le dépôt. Le contrôle livré avec la story relit le
dépôt à chaque exécution, et c'est sa raison d'être.

## Deux contraintes que la description ne pouvait pas prévoir

**Le profil est non contrôlé.** Les quatre écrans du parcours tiennent leur
valeur dans un `useState` ; le profil lit son `FormData` à la soumission et vide
ses champs par `formulaire.reset()`. Le forcer en contrôlé aurait cassé ce
`reset()`, qui ne remet pas à zéro un `useState` : les champs auraient paru
vides en gardant leur valeur, et le mot de passe aurait survécu à un changement
réussi, sur un poste possiblement partagé. Le composant accepte donc les deux
formes.

**Le contour de focus sort du cadre à 320 px.** `globals.css` trace 3 px avec
2 px de décalage, soit 5 px au-delà de la boîte, seuil posé par C34 en LS-196.
Sur le bouton collé au bord droit, un décalage positif sortirait de l'écran : le
contour part vers l'intérieur, seul écart assumé, raison écrite dans le CSS.

## Sept mutations, dont deux qui accusaient les tests

Les dix-sept tests en jsdom passaient du premier coup. Les éprouver a montré que
**deux d'entre eux ne prouvaient pas ce qu'ils annonçaient**.

```
M6  un second <input> rendu a cote   -> 17 verts, defaut non vu
M7  la valeur fuit dans l'annonce    -> mutation non appliquee, vert sans valeur
```

`getByLabelText` cible par le `htmlFor` du label : un second input sans `id` lui
est invisible. L'assertion `expect(champ()).toBe(avant)` retrouvait le bon
élément, l'identité tenait, et le composant en rendait deux. Le compte des
`input` sur le conteneur ferme le trou.

Le second test visait `role="status"` et un `aria-label`, donc il prouvait « la
valeur n'est pas **là** » en énonçant « la valeur n'est nulle part ». Il balaye
désormais tout le texte rendu et tous les attributs.

**M7 mérite une note de méthode.** Sa première exécution est sortie verte, et
elle ne prouvait rien : la substitution Perl avait échoué sur un `??`, message
d'erreur affiché puis noyé dans la sortie. Un vert sur une mutation non
appliquée ressemble exactement à un vert sur une mutation détectée.

## Le contrôle avait le défaut qu'il cherchait

`verifier-bascule-mot-de-passe.sh` porte cinq sens, tous éprouvés. Le cinquième
est resté vert :

```
M3  le libelle disparait du CODE  -> code 0, controle satisfait
```

Le composant **cite** « Afficher le mot de passe » dans un commentaire qui
explique `aria-controls`, cinquante lignes sous le code. Le `grep` nu trouvait
la prose et déclarait le libellé présent.

C'est la troisième forme du motif « contrôle satisfait par un commentaire »
déjà en fiche, et la plus difficile à parer : un libellé d'interface se cite
entre guillemets français, sans aucune marque syntaxique à exiger, contrairement
à la parenthèse ouvrante d'un appel de fonction. Il ne reste que le filtre des
commentaires, appliqué avant la recherche.

**Il n'a été vu que par accident.** La première mutation avait visé la première
occurrence, celle du commentaire d'en-tête, et le contrôle était resté vert pour
la bonne raison, le code étant intact. C'est en cherchant pourquoi cette
mutation ne rougissait pas que la vraie cible est apparue.

## Mesures

Rendu réel à 320 px, valeurs et non seuils franchis :

```
VIEWPORT 320 px
BOUTON   67,0 x 44,0 px, bord droit a 303,0
CHAMP    219,0 x 44,0 px
```

Suites : 504 tests unitaires, 17 en composant, 36 de bout en bout à 320 px dont
six neufs, `axe-core` sans violation sur les écrans modifiés. Contraste et
bordure de contrôle verts sur le CSS ajouté, 178 paires et 172 sélecteurs.

## Ce que la session ne prouve pas

Le rendu à 390, 768 et 1280 px n'a pas été mesuré en local, seul `mobile-320` a
été joué : c'est la largeur contraignante, et la chaîne d'intégration joue les
trois. Les deux écrans sous session, réauthentification et profil, ne sont pas
couverts en bout en bout ; leur comportement l'est en jsdom et la présence du
composant par le contrôle textuel.

## État des tickets

**LS-179 est livrée**, PR #272, en attente de la chaîne au moment d'écrire.

## Prochaine étape

Inchangée depuis ce matin : **LS-200**, le raccordement de l'API Sendcloud, qui
débloque LS-131 puis LS-33. Elle attend que Christophe crée les clés d'API dans
Sendcloud, Réglages puis Boutiques connectées : `.env.example` ne porte aucune
variable Sendcloud, vérifié.

Si ces clés ne sont pas disponibles, **LS-156** est le seul travail Haute
priorité entièrement autonome, et elle prépare le terrain de LS-200 en dérivant
de `.env.example` la liste des variables attendues.
