# 13 août 2026, deux écrans du prototype que personne ne suivait

Quatrième session du 13 août, après la porte de sortie de la phase 1, le
branchement des actions sensibles et la conservation des avis. Exploration sans
ticket au départ, rattachée à LS-15 comme livrable de conception.

Christophe a demandé une analyse détaillée du prototype visuel, et si des tickets
étaient à créer ou à mettre à jour.

## Le prototype n'a pas bougé depuis le gel

Première question à trancher, parce que `PROTOTYPE.md` le déclare **gelé** depuis
le 5 août : est-il resté identique ?

Le paquet servi porte le même nom, `BoutiquePrototype-rkyYldyz.js`, et les cinq
écarts documentés se reproduisent tous. Vérifié par mesure et non à l'œil :

| Écart | Mesure du 13 août |
|---|---|
| LS-84, terracotta | `#b4643e` à 4,07:1 sur crème, 4,35:1 sur blanc |
| LS-85, régions live | zéro élément `aria-live`, `role=status` ou `role=alert` |
| LS-85, vignettes | exactement trois boutons sans nom accessible |
| LS-86, récapitulatif | parcours refait jusqu'à l'étape 4, l'adresse saisie absente |
| LS-87, éditeur | cinq parties, « Dimensions » en troisième position |

Le serveur ne renvoie aucun en-tête de date de construction : la conclusion
s'appuie sur le nom du paquet et la reproduction des écarts, pas sur une date.

Le 320 px tient aussi. `scrollWidth` reste à 320 sur toutes les pages publiques
et sur l'administration. Les tableaux d'administration s'étendent bien à 871 px,
mais **dans un conteneur `overflow-x: auto`**, qui est le patron attendu. Mesurer
le débordement d'un élément sans regarder son conteneur aurait produit un faux
positif.

## Le vrai apport : deux écrans sans aucun ticket

La table de correspondance de `PROTOTYPE.md` relie les huit parcours à leur
écran. Elle ne dit rien des écrans que le prototype porte **sans qu'un parcours
les mobilise**, et c'est exactement là que deux fonctions entières avaient
échappé au suivi.

L'administration compte **onze rubriques**, quand la table n'en nommait que
quatre. Deux ne correspondaient à aucun ticket, ouvert ou fermé, sur les 96 du
projet.

**Messages, le formulaire de contact.** Écran complet dans le prototype : liste
des demandes, détail, champ de réponse. Il énonce même la bonne règle, « les
demandes sont conservées même si l'envoi de l'email de notification échoue ».

Ce n'était pas un oubli anodin. `MODELE-CONCEPTUEL.md` avait retiré l'entité
`Message` le 28 juillet, faute de parcours qui la justifie, en renvoyant
explicitement à un ticket propre :

> Le formulaire de contact relève d'un ticket propre, où sa règle principale
> devra être posée : le message est persisté avant toute tentative d'envoi
> d'email, faute de quoi une panne d'email perd le message.

Ce ticket n'a jamais été créé. Une dette annoncée dans un document, jamais portée
dans l'outil de suivi, reste invisible aussi longtemps que personne ne relit le
document. Créé en **LS-97**.

**Paramètres commerciaux.** Réglages de livraison avec le seuil de gratuité,
alertes de l'administratrice, coordonnées de la boutique, compte administratrice.

Là encore le dépôt annonçait la chose sans la suivre : `frontend-design.md`
porte, en face de la gratuité à 39 €, la mention « valeur issue de la
configuration ». La règle suppose une configuration qui n'existe nulle part, le
seuil et les trois tarifs d'ADR-025 étant des valeurs figées. Créé en **LS-98**.

Les deux sont rattachées à l'epic LS-5, phase 4, dont le titre porte déjà le mot
« contact ».

## LS-84 est plus large que son titre

La mesure des styles calculés remonte deux familles d'usage du terracotta, pas
une :

```
COLLIERS        11.52px  graisse 700   4.07:1 sur creme
01 a 07         11.20px  graisse 400   4.07:1 sur creme
```

Les sept libellés numérotés sont en **graisse normale**. Ils échappent à
l'exemption « texte large ou gras » quelle que soit la lecture, là où le cas des
accroches en gras demandait de connaître le seuil de 18,66 px pour être vu.

La story n'est pas modifiée : son premier critère les couvre déjà. Un commentaire
a été ajouté pour que le contrôle automatique attendu soit conçu assez large dès
le départ, et que la mutation qui le prouve porte sur les deux cas.

## Trois écrans qui devancent la documentation

Signalés sans ticket, parce qu'ils ne demandent aucune correction :

- **Clients** énonce la dissociation de LS-95, mot pour mot dans son esprit
- **Stocks et marchés** affiche « Montant encaissé » sur les ventes externes, ce
  que LS-63 exige au Go-Live
- **Expéditions** distingue « Disponible au Point Relais » de « Remise au
  destinataire », le fait déclencheur du délai de rétractation

## Ce qui a été écarté

L'espace client du prototype porte **sa propre page de connexion**, distincte de
celle de l'administration. Cela confirme l'observation déjà notée pour LS-54, où
`/compte` redirige aujourd'hui vers `/administration/connexion`. Rien créé : LS-54
existe et porte déjà le sujet.

Aucune donnée du prototype n'est entrée dans le dépôt, ni nom, ni prix, ni stock.

## État des tickets

- **LS-97**, créée, à faire, epic LS-5
- **LS-98**, créée, à faire, epic LS-5
- **LS-84**, inchangée, commentaire de mesure ajouté
- **LS-85, LS-86, LS-87**, inchangées, écarts confirmés à l'identique

## Prochaine étape

Inchangée par cette session : la phase 2 reste le prochain chantier de code, avec
le découpage de LS-3. Les deux stories créées relèvent de la phase 4 et ne
commandent rien aujourd'hui.
