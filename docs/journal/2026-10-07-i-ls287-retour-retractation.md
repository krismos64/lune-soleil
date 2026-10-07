# 7 octobre 2026 : LS-287, le retour en rétractation confronté à la loi

Suite de `2026-10-07-h`.

## Sources lues

Sur Légifrance, le 7 octobre 2026 :

- **L221-23**, version en vigueur depuis le 28 mai 2022 ;
- **L221-24**, version en vigueur depuis le 1er juillet 2016, sans version plus
  récente.

## Ce qui a été fait

- **Email d'accusé de rétractation.** Il ne citait que la réception du colis.
  Il cite maintenant aussi la preuve d'expédition, premier des deux faits de
  L221-24 alinéa 2, et dit comment la transmettre. « Dans son état d'origine »
  devient « bien protégé », recommandation et non condition.
- **Page légale, état du bijou.** « Un état permettant sa remise en vente »
  posait une condition que la loi ne pose pas. Un bloc « État du bijou
  retourné » reprend L221-23 alinéa 3.
- **« L'atelier » est défini** sous « Éditeur du site ».
- **Défaut plus grave, trouvé par `ls-critical-reviewer` sur `main`.** La page
  faisait partir les quatorze jours du remboursement du premier des deux faits.
  L221-24 alinéa 1 les fait partir de l'information de la décision, et
  l'alinéa 2 permet seulement de différer. La page promettait donc jusqu'à
  quatorze jours de plus que la loi. Texte corrigé, ainsi que le commentaire
  du dépôt qui répétait la règle fausse. **Le code ne calculait aucune
  échéance**, il trie seulement par ancienneté.
- **`Reply-To` sur l'adresse de contact publiée**, `FACTURE_EMAIL_CONTACT`. Rien
  ne garantissait que la réponse à un email, canal de la preuve d'expédition,
  arrive dans une boîte relevée.
- `legal.md` porte une ligne sur l'état du bien retourné. Espace insécable
  avant un deux-points de titre.
- **Mutations vues** : l'email réduit à un seul fait, « remise en vente »
  réintroduite, l'ancien délai remis, le `Reply-To` retiré. Chacune fait
  rougir son test.

## Dérives

- J'avais d'abord relu le diff sans remonter au paragraphe voisin du délai :
  c'est la revue critique, en suivant le chemin de la preuve, qui l'a trouvé.

## Tickets

- **LS-287** close à la fusion.
- **LS-288** créée : date réelle de la preuve, adresse de retour, rappel de
  L221-23 dans l'outil de remboursement.

## À vérifier par Christophe

`FACTURE_EMAIL_CONTACT` doit désigner une boîte que l'exploitante relève, en
production comme dans `.env.example`. Je ne lis pas le `.env`.
`./scripts/verifier-environnement.sh` dit seulement si la variable est posée.

## Prochaine étape

LS-288, puis les réponses de l'exploitante aux questions 38 à 42.
