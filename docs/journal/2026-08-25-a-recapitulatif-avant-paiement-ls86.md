# 25 août 2026, le récapitulatif avant paiement, et le mauvais article

Première session de la journée. LS-86 traitée avant LS-115, dont elle est le
bloqueur : établir par lecture de la source ce que l'information
précontractuelle impose d'afficher au récapitulatif avant paiement.

## Le résultat contredit l'hypothèse du ticket

La description de LS-86, la table des écarts de `PROTOTYPE.md` et mon propre
raisonnement de départ désignaient l'article **L221-5**. L'article qui gouverne
cet écran est **L221-14**.

La différence n'est pas cosmétique. L221-5 énumère onze catégories d'information
précontractuelle, dues avant que le consommateur soit lié. L221-14 alinéa 1
énumère **limitativement quatre** informations à rappeler au moment de la
commande par voie électronique : caractéristiques essentielles, prix, durée du
contrat, durée minimale des obligations. Les deux dernières ne concernent pas la
vente d'un bijou, contrat à exécution instantanée.

Le bon article s'est trouvé en partant du fait, « commande par voie électronique
», plutôt que du numéro que le ticket fournissait. Le réflexe était d'aller lire
L221-5 pour y chercher confirmation.

## L'adresse de livraison n'est imposée par aucun texte

Ni L221-14, ni L221-5, ni L111-1 ne l'exigent au récapitulatif.

Le site l'affiche quand même, pour les trois modes, par **arbitrage
d'ergonomie** de Christophe et non par obligation. `legal.md` écrit la
distinction explicitement : une obligation légale ne se retire pas sans nouvelle
vérification, une décision d'ergonomie se rediscute librement.

Le cas du Point Relais est tranché : l'adresse affichée est celle du point de
retrait, plus le nom du destinataire. L'adresse personnelle du client n'a aucun
usage quand le colis part au commerce partenaire, et en afficher une qui ne
servira pas induit en erreur.

## Deux obligations que le ticket ne mentionnait pas

Trouvées en lisant le texte plutôt qu'en cherchant à confirmer l'hypothèse.

**L221-14 alinéa 2** impose la mention « commande avec obligation de paiement »,
ou une formule analogue dénuée d'ambiguïté, **sur le bouton lui-même**. « Payer
», « Valider » ou « Confirmer ma commande » seuls ne satisfont pas l'exigence.

**L221-14 alinéa 3** impose d'annoncer les moyens de paiement et les restrictions
de livraison au plus tard **au début du processus de commande**. La zone France
métropolitaine Corse comprise d'ADR-025 est une restriction de livraison : elle
est due à l'entrée du tunnel, pas au récapitulatif. LS-115 devra la placer là.

## Un piège de version sur la sanction

L242-10 vise nommément L221-14 : jusqu'à **15 000 € personne physique et 75 000
€ personne morale**, version en vigueur depuis le 28 mai 2022, ordonnance n°
2021-1734.

Légifrance sert encore une version antérieure affichant 3 000 € et 15 000 €. Les
deux chiffres sont apparus dans la même session, l'un par la page datée
2021-10-01 de l'article, l'autre par la page de section. C'est le même piège que
la renumérotation de D111-17 en D111-10 déjà rencontrée sur ce projet.

## Une affirmation retirée faute de preuve

J'avais écrit dans `PROTOTYPE.md` que le prototype omet la mention obligatoire
du bouton. **Retiré** : le prototype est gelé et hors dépôt, `PROTOTYPE.md` ne
documente pas ce libellé, et je ne l'ai pas consulté. L'affirmation était
plausible et non vérifiée, ce qui suffit à l'écarter.

C'est LS-115 qui posera le bon libellé sur le code réel, ce que `legal.md` porte
désormais.

## Preuves

```
./scripts/verifier-regles.sh
  OK    78 identifiants, tous présents dans le schéma ou le code
  OK    toutes les règles portent un frontmatter paths
  OK    7 index partiels, aucune contrainte citée ne contredit son prédicat
  OK    31 dossiers de src/, tous couverts par au moins une règle
  règles conformes au schéma

./scripts/verifier-config-claude.sh --strict
  configuration Claude Code cohérente
  ---- code: 0
```

Aucun code touché, donc aucun test à rejouer. Prose enveloppée à 80 colonnes,
aucun tiret cadratin.

## État des tickets

| Ticket | État |
|---|---|
| LS-86 | **En cours**, quatre critères sur cinq remplis |
| LS-115 | Débloquée sur le fond, le contenu du récapitulatif est établi |

Le critère 5 de LS-86, test de bout en bout vérifiant que l'information saisie
se retrouve au récapitulatif pour les trois modes, **dépend du tunnel qui
n'existe pas encore**. Il revient à LS-115. Le ticket reste ouvert plutôt que
d'être clos à tort.

## Prochaine étape

**LS-115**, le tunnel de commande. Trois points établis par cette session
entrent directement dans son périmètre :

- le récapitulatif affiche l'adresse selon le mode, table dans `legal.md`
- le bouton porte la mention « commande avec obligation de paiement »
- la zone desservie s'annonce à l'entrée du tunnel, pas au récapitulatif

Deux constats faits en préparant la session et qui pèseront sur elle. La
**configuration des tarifs n'existe pas en code** : `.env.example` porte les trois
variables depuis le 30 juillet, aucun fichier de `src/` ne les lit. Et l'**API
Mondial Relay n'est pas accessible**, le compte attendant le compte bancaire
professionnel, LS-27 et LS-18 : l'intégration se fait derrière une interface,
testée par simulation, et le critère qui compte le plus, la panne qui ne bloque
pas la vente à domicile, est intégralement réalisable sans compte.
