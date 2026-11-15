# 15 novembre 2026 : nocturne rouge, repère du bandeau à 768 px

## Demande

Christophe : « où en est-on ? », puis accord pour corriger le nocturne de la
nuit (run 43695875991, issue #647), premier passé sur LS-325 et LS-326.

## Constat

Cinq échecs, tous à 768 px, tous à **14 px** de débordement :
`erreur-administration.spec.ts:214` et `:244`,
`etats-non-nominaux-administration.spec.ts:354` (réauthentification),
`parametres-administration.spec.ts:408` et `passkeys-administration.spec.ts:227`,
ces deux derniers sur la réauthentification aussi. `npm audit` à zéro, image
construite.

Rien ne se reproduisait sur macOS, ni avec la police système ni en injectant
Verdana. **Reproduit à 14,0 px** dans `mcr.microsoft.com/playwright:v1.62.1-noble`
avec `fonts-dejavu-core`, contre le serveur de test local, par l'algorithme de
`debordementHorizontal` : le fautif est `.famille` du repère d'écran.

## Cause

De 768 à 1099 px, la barre latérale laisse au bandeau environ 518 px. Les
actions en prenaient 352 sous DejaVu (« Aller à… Ctrl K » 173, « Voir la
boutique » 171), et le texte du repère tombait à **74 px**.

- Sur un écran hors rubrique (réauthentification, frontière d'erreur), le
  repère n'écrit que « Administration », un seul mot de 88 px : il sort de sa
  boîte de 14 px.
- **Défaut que la mesure ne voyait pas**, relevé en chemin : sur les écrans à
  rubrique, `overflow-wrap: anywhere` coupait les noms d'un seul mot en plein
  mot, « Statistiques », « Commandes », « Paramètres », « Rétractations »,
  « Connexions ». Rien ne déborde, donc aucun test ne rougissait. La revue
  d'interface de LS-326 avait mesuré sous Verdana sur macOS.

## Correction

Le rappel « Ctrl K » du bouton « Aller à… » ne s'affiche plus qu'à partir de
**1100 px**, seuil où le contenu de l'administration passe déjà en ligne
(LS-326). Le raccourci marche à toute largeur. Le bouton passe de 173 à 111 px.

Mesuré sous DejaVu, 16 écrans plus la réauthentification, à 768, 1024, 1099,
1100 et 1280 px : texte du repère à 136 px à 768, **aucun mot coupé**, seuls
« Factures et avoirs » et « Stocks et marchés » se replient entre deux mots à
768 ; à 1100 et 1280 px, rien ne change. Les quatre écrans fautifs : 0 px.

## Preuves

- Spec LS-326, deux tests neufs : aucun mot du repère coupé sur seize écrans ;
  rappel masqué sous 1100 px, visible au-dessus.
- **Mutation** (seuil remis à 768 px) : le test du rappel rougit à 768 et au
  redimensionnement à 1099 px, 2 échecs. Le test des mots coupés reste vert
  sur macOS, dont les polices sont plus étroites : il ne mord que sous DejaVu,
  donc en CI. Pour le défaut lui-même, la preuve est la mesure en conteneur,
  14 px avant, 0 après.
- Specs concernées aux quatre largeurs : 205 passés, aucun échec.
- Suite de bout en bout complète sur macOS : 3 010 passés, 92 ignorés par
  largeur, aucun échec.
- Types, lint, `verifier-regles.sh`, `verifier-redaction-francaise.sh` au vert.

## Reste

- Issue #647 : à fermer sur le premier nocturne vert.
- Déploiement en production, la fusion publiant l'image : sur accord.
- Tickets ouverts inchangés : LS-320, LS-291, LS-35.

## État des tickets

- LS-326 : Terminé, correctif du nocturne en commentaire.
