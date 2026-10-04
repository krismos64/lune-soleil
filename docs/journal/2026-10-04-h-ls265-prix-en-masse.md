# 4 octobre 2026 : LS-265, un même prix pour plusieurs articles

Suite de `2026-10-04-g`. Première des demandes du 4 octobre côté
administration. Le déploiement attend toujours la fin de la session.

## Ce qui a été fait

Arbitrages de Christophe : le prix s'applique à **toutes les déclinaisons**
des produits choisis, et l'ancien prix ne laisse **aucune trace**.

- **Deux temps, jamais un seul** : l'exploitante coche des produits, saisit un
  prix, et reçoit d'abord un récapitulatif déclinaison par déclinaison, nom,
  libellé, prix actuel. Rien n'est écrit avant « Confirmer le prix ».
- **La confirmation est bornée à ce qui a été montré** : le formulaire renvoie
  les identifiants des déclinaisons listées, et la mise à jour, filtrée sur ces
  identifiants, sur les produits choisis et sur les déclinaisons non
  archivées, se fait en transaction. Si le nombre écrit diffère du nombre
  montré, tout est annulé et l'écran le dit (`RecapitulatifPrixPerimeError`).
- **Prix nul refusé en masse**, `schemaPrixEnMasse`, en centimes entiers par
  `centimesDepuisEuros`. Les déclinaisons archivées ne changent pas.
- **Les commandes passées ne bougent pas**, invariant 3 : elles portent leur
  prix figé, vérifié en intégration sur `prix_fige_centimes`.
- Actions `previsualiserPrixSelection` et `appliquerPrixSelection` derrière
  `exigerRole`, revalidation de la page seule, aucun comptage de la barre ne
  lisant le prix (C37).

## Ce qui a dérapé

- **Entrée dans le champ prix publiait la sélection** : le formulaire de
  sélection soumettait par son premier bouton, « Publier ». Relevé par
  `ls-frontend-revue` ; Entrée passe désormais par « Appliquer ce prix ».
- **La confirmation n'était pas bornée** dans la première version : un produit
  recevant une déclinaison entre le récapitulatif et le clic aurait changé de
  prix sans avoir été montré. Relevé par `ls-critical-reviewer`.
- Le focus ne revenait pas au champ en erreur : il était demandé pendant que le
  champ était encore désactivé. Déplacé dans un effet qui attend la fin de
  l'envoi.
- **Une de mes mutations ne prouvait rien** pour la seconde fois de la journée :
  un `return` placé avant le code le rendait inatteignable et la construction
  échouait. Refaite en retirant tout le gestionnaire de touche.
- Défaut **antérieur** relevé en chemin et sorti du périmètre : le tunnel ne
  confronte pas le sous-total des articles affiché au sous-total figé. Ticket
  **LS-269**, rattaché à LS-7, question juridique L221-14 signalée et non
  tranchée.

## Preuves

- Intégration : 29 tests sur `variantes.sequential.test.ts`, dont sept pour ce
  ticket.
- Bout en bout : `prix-selection-ls265.spec.ts` aux quatre largeurs, sur des
  produits archivés propres à chaque largeur, la base étant partagée.
- Six mutations attrapées par le test prévu : borne de confirmation retirée,
  refus du prix nul retiré, filtre des archivées retiré, interception d'Entrée
  retirée, focus d'erreur retiré, retour du focus à l'annulation retiré.

## Prochaine étape

LS-266, retirer un article archivé de l'espace de l'exploitante sans le
supprimer de la base. Puis LS-268 et LS-267, chacun avec sa maquette, et le
déploiement en fin de session.

## État des tickets

LS-265 close à la fusion. LS-264 close à la fusion de sa PR. LS-266, LS-267,
LS-268 et LS-269 à faire. LS-258 en cours jusqu'au 17 octobre.
