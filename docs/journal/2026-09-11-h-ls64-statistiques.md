# 11 septembre 2026, h : LS-64, la page Statistiques

Une story dont le point à trancher était déjà résolu, et dont le document de
référence tenait lieu de spécification complète.

## Le point à trancher ne l'était plus

Le ticket demandait d'arbitrer entre ajouter `Paiement.confirmeA` et dériver la
date depuis `HistoriqueStatut`. **Le champ existe depuis LS-45**, et
`STATISTIQUES.md` porte l'arbitrage daté du 30 juillet, avec ses six règles
d'usage.

L'alternative écartée l'est pour un motif qui vaut d'être retenu : dériver
depuis l'historique ferait dépendre une **donnée comptable** d'un journal de
transitions.

## Le fuseau est la story

Une vente conclue le 3 juillet à **00 h 30 heure française** est stockée au
2 juillet **22 h 30 UTC**. Un regroupement fait en UTC la range au 2 juillet, et
le total du jour est faux pour l'exploitante comme pour l'e-reporting de LS-35.

`AT TIME ZONE 'Europe/Paris'` fait le travail dans la requête. **Un décalage
fixe d'une ou deux heures écrit en dur** passerait le test en été et le raterait
en hiver : c'est le piège que cette story existe pour fermer.

**Les tests portent les deux sens.** Une vente de 00 h 30 doit être **incluse**
dans le jour, une vente de 23 h 30 la veille doit en être **exclue**. Un test qui
ne vérifie que l'inclusion passerait sur une requête qui prend tout : motif
« valeurs qui coïncident ».

Ils sont datés en **juillet** et non en janvier, délibérément : en heure d'hiver,
Paris est à UTC+1, et un décalage d'une heure écrit en dur y passerait.

## Un module existait déjà, et je l'ai étendu

`lib/periode-comptable.ts`, écrit par LS-184 pour la comptabilité, portait déjà
`minuitAParis` et le calcul de décalage saisonnier. J'ai **étendu** ce module
plutôt que d'en écrire un second : le décalage de Paris se calcule à un seul
endroit, et un passage à l'heure d'hiver ne peut pas être juste d'un côté et
faux de l'autre.

**Les deux familles de périodes restent distinctes.** Celles de LS-184 servent la
comptabilité, qui raisonne en mois clos ; celles de LS-64 servent le pilotage,
qui raisonne en « depuis le début de ». Les fondre obligerait un écran à afficher
des choix qui n'ont pas de sens pour lui.

**Leurs bornes hautes diffèrent**, et ce n'est pas cosmétique : la comptabilité
filtre en `lte` et reçoit une borne inclusive, les statistiques filtrent en `<`
strict et reçoivent une borne exclusive. Rendre la même forme aux deux ferait
compter deux fois une vente conclue exactement à minuit.

## Trois règles d'affichage qui ne se relâchent pas

**Le brut n'est jamais diminué des remboursements.** Les trois montants
s'affichent ensemble, le net jamais seul : le brut répond à « combien ai-je
encaissé en juin », question à laquelle l'e-reporting devra répondre.

**Un avis est imputé à sa date d'émission**, jamais à celle de la vente. Une
vente du 28 juin remboursée le 4 juillet compte en juillet : imputer à la vente
changerait rétroactivement un montant déjà consulté, et dès septembre 2027 déjà
transmis à l'administration.

**Le net peut être négatif** et s'affiche tel quel. Un test le prouve sur un mois
sans vente portant un avoir de 50 €.

## Deux contraintes m'ont repris

`avoir.instantane_legal` est **obligatoire**, LS-49 : un avoir est un document
légal au même titre qu'une facture, invariant 4. Ma fixture l'ignorait.

`jeton_acces` manquait au nettoyage, et sa clé étrangère en `RESTRICT` l'a dit.
L'ordre de suppression suit les clés : une table effacée trop tard fait échouer
le nettoyage et pollue les tests **suivants** plutôt que le test courant.

## Un caractère qui casse un template literal

Mes commentaires SQL contenaient des backticks autour des noms de colonnes,
convention du dépôt dans les commentaires TypeScript. Dans un template literal
`$queryRaw`, ils **ferment la chaîne**. Les commentaires SQL emploient désormais
les guillemets français.

## Ce que la rubrique ne porte pas

**Aucun compteur dans la barre**, délibérément. Elle compte ce qui **attend un
geste**, messages non lus ou avis à relire : un chiffre d'affaires n'attend rien,
et le mettre en pastille ferait clignoter une information qui n'appelle aucune
action.

## Vérifications

```
npm run type-check                     vert
npm run lint                           vert
npm run format:check                   vert
npm run test                           1503 tests
vitest statistiques (intégration)      18 tests
playwright administration-connectee    4 tests sur l'écran
playwright navigation-administration   30 tests
verifier-navigation-administration.sh  conforme
verifier-contraste.sh                  toutes paires conformes
verifier-bordure-controle.sh           seuil 3:1 tenu
verifier-loading-et-404.sh             conforme
verifier-prefetch-administration.sh    conforme
verifier-atteignabilite-boutique.sh    conforme
verifier-regles.sh                     règles conformes au schéma
```

## État des tickets

**LS-64 développée**, epic LS-8, V1 cible. Neuf critères sur dix sont remplis ;
le critère 9 demande une mesure aux quatre largeurs avec les états vide,
chargement et erreur : les trois existent, et l'écran est mesuré aux quatre
largeurs par la table des écrans d'administration.

## Prochaine étape

**LS-123**, les pages de contenu, ou **LS-32**, la neutralité de genre.
