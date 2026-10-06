# 6 octobre 2026 : LS-270, un produit retiré de la vente n'est plus commandable

Suite de `2026-10-06-a`.

## Ce qui a été fait

- **Contrôle avant zone critique** (réservation). Besoin dans le périmètre,
  aucune migration. Transaction existante de `passerCommande`, ordre des
  verrous inchangé : compteur, puis variantes triées. Refus par
  `CommandeRefuseeError`, qui nomme la pièce. Aucune écriture sur la variante,
  la vente en main propre d'une pièce d'un produit archivé reste permise
  (invariant 6). Le panier vit dans un cookie signé, donc un produit
  `BROUILLON` n'y entre pas par le parcours : la même garde le couvre quand
  même.
- **Tests écrits d'abord**, cinq, tous rouges sur le défaut : la commande
  aboutissait sur un produit archivé, et le panier comptait la ligne dans son
  total sous « retirée de la vente ».
- **Correction** : `SQL_RESERVER` exige `produit.statut = 'ACTIF'` dans son
  `WHERE`, et `lireVariantesDuPanier` ramène le disponible à 0 sur la même
  condition. Le produit n'est pas verrouillé : un archivage validé pendant la
  transaction n'est pas vu, la commande passe comme si elle l'avait précédé.
- **Deux mutations** ajoutées, cas 3 bis et 3 ter de
  `verifier-tests-mutation.sh`, prouvées à la main : 3 et 2 tests rougissent.
- Types, lint, 1765 tests sur 1765, contrôle à sec (242 expressions), règles.
- `database.md` et `MODELE-CONCEPTUEL.md` portent la condition. ADR-006 et les
  prototypes, documents datés, sont laissés tels quels.
- **Revue `ls-critical-reviewer`** : aucun défaut. Une commande payée dont le
  produit est archivé entre réservation et paiement reste confirmée et
  facturée, rien en aval ne relit le statut. Hors périmètre : `reserverPanier`
  n'a plus d'appelant en production.

## Ce qui a dérapé

- La première preuve manuelle des mutations est restée verte sans rien
  muter : `read` sans `-r` avalait les antislashs de l'expression. `git diff`
  vide l'a montré, et la seconde passe a muté pour de bon.

## Prochaine étape

Fusionner LS-270 puis la clore. LS-273 attend un échec capturé ou plusieurs
nocturnes verts. LS-258 : l'exemption `braces` échoit le 17 octobre. LS-269
et LS-270 ne sont pas déployées.

## État des tickets

LS-270 fusionnée à la clôture de cette PR. LS-271 et LS-272 closes. LS-273 et
LS-258 en cours. Comptes relevés dans Jira avant la clôture de LS-270 : 238
terminés sur 263 hors epics, 11 En cours et 14 À faire.
