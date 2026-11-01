# ADR-049 : retrait d'un avis par son auteur, et durée de la trace d'un avis écarté

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 1er novembre 2026 |
| Décideur | Christophe Mostefaoui |
| Complète | ADR-028 (conservation des avis), sur ce qu'il laissait sans réponse |
| Ticket | LS-305 |

## Contexte

ADR-028 fixe la conservation d'un avis **publié** : sans limite, tant qu'il
reste en ligne. Il laisse deux questions ouvertes, relevées le 1er novembre 2026
en relisant la page légale avec Christophe (LS-28) :

1. **Le retrait à la demande de l'auteur.** La page le promettait, ADR-028 le
   présente comme « le vrai contrepoids », et aucun chemin ne le permettait.
   L'arbitrage du 23 septembre 2026 (LS-246) interdit en outre toute
   suppression en base de production.
2. **La trace d'un avis refusé ou retiré par l'atelier.** Elle était conservée
   sans durée, alors que sa finalité, prouver la décision, s'éteint.

Aucun texte n'impose de durée pour ces données. L'article D111-10 2° b) impose
seulement d'annoncer la durée retenue.

## Décision

**1. L'auteur retire lui-même son avis depuis `/compte/avis`, quel que soit son
statut, et l'avis est anonymisé, jamais supprimé.** Le commentaire est vidé, le
lien au compte rompu, `Avis.effaceA` date le geste. Un avis publié ou en attente
passe `RETIRE` avec le motif « Retiré à la demande de son auteur. » ; un avis
déjà refusé ou retiré garde sa décision. La note reste, sans nom, rattachée à
une ligne de commande que l'article L123-22 du code de commerce fait conserver
dix ans. Règle R19.

**2. Un avis effacé ne se republie jamais.** `appliquerDecision` filtre sur
`effaceA` nul. La colonne est le seul marqueur fiable : un avis sans commentaire
dont le compte a été supprimé n'est pas effacé et reste modérable.

**3. La trace d'un avis refusé ou retiré est anonymisée cinq ans après la
décision**, par la purge quotidienne. Cinq ans est le délai de prescription de
droit commun, article 2224 du code civil, déjà retenu pour la trace de
rétractation. Le motif de la décision reste. Un avis publié n'est jamais touché,
ADR-028 inchangé sur ce point.

**4. La base garantit l'anonymat** : `chk_avis_efface_anonyme`, une implication
`effaceA` renseigné vers commentaire et auteur nuls.

## Alternatives écartées

**Supprimer la ligne.** Contraire à LS-246, et la ligne de commande est en
`RESTRICT` sur l'avis. Rien n'est gagné sur la donnée personnelle, que
l'anonymisation retire déjà.

**Retrait sur demande écrite, traité par l'exploitante.** Il exigeait un outil
d'administration et un délai, pour un geste que l'auteur peut faire seul,
authentifié par sa session.

**Marquer l'effacement par le motif ou par l'auteur nul**, sans colonne. Le
premier se confond avec un texte libre, le second avec un compte supprimé.

**Une durée plus courte pour la trace**, un an. Elle ne couvrirait pas une
contestation civile ni un contrôle sur la suppression d'avis défavorables.

## Conséquences

- Migration additive `20261101150000_avis_efface`, colonne nullable et contrainte.
- R6 est amendée : un avis écarté est conservé cinq ans, puis anonymisé.
- La rubrique « Avis de clients » de `/informations-legales` annonce le retrait
  et les cinq ans, la politique de confidentialité renvoie au retrait, le
  registre T7 porte la durée.
- Le test `purge-journaux` énumère la nouvelle entrée `Avis`.

## Risques

**Un retrait est définitif** : une seule ligne de commande porte un seul avis,
R2. L'écran le dit avant la confirmation.

**Une réponse de l'exploitante survit** à l'avis effacé, `ReponseAvis` n'étant
plus affichée. Elle est écrite par l'atelier, pas par l'auteur.

## Amendement du 1er novembre 2026, LS-306

**La note est effacée avec le texte**, au retrait par l'auteur comme à la purge
de cinq ans. La première version la gardait « sans nom » : reliée à une ligne
de commande, donc à un client identifiable, elle restait une donnée personnelle
sans finalité, ni affichée ni comptée. Relevé par une relecture externe et
confirmé. `Avis.note` devient nullable, et `chk_avis_note_selon_effacement`
pose l'équivalence : une note est nulle **si et seulement si** l'avis est
effacé. Il ne reste que la trace qu'un avis a existé sur cet achat et a été
retiré, à sa date : elle empêche un second avis, R2, et prouve que la demande a
été respectée, article 5.2 du RGPD.

**La finalité des cinq ans est écrite sur la page** : justifier la décision si
elle est contestée, par l'auteur ou lors d'un contrôle. La prescription de
l'article 2224 en fixe la longueur, elle n'en fait pas une obligation.
