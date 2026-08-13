# Répondre à une demande de droits, procédure

Procédure interne de traitement des demandes fondées sur les articles 15 à 21 du
RGPD. Elle s'adresse à l'exploitante, et complète le registre des traitements,
`docs/architecture/REGISTRE-DES-TRAITEMENTS.md`, qui recense ce qui est traité.

**Ce document n'est pas la politique de confidentialité.** Celle-ci est un texte
public adressé aux clients, qui décrit ces droits dans leur langage ; elle relève
des contenus portés par Christophe, epic LS-22.

## Le délai, et il ne se négocie pas

**Un mois à compter de la réception**, article 12 paragraphe 3. Prolongeable de
deux mois pour une demande complexe, à condition d'en informer la personne dans
le mois initial en expliquant le motif.

Le délai court même si la demande arrive un dimanche d'août. Une demande sans
réponse dans le mois vaut refus implicite, et ouvre une réclamation devant la
CNIL.

## Avant de répondre, vérifier qui demande

**L'identité du demandeur se vérifie**, article 12 paragraphe 6, et c'est le
point où une erreur coûte le plus cher : répondre à un usurpateur, c'est
divulguer soi-même les données qu'on prétend protéger.

Ce qui suffit ici : la demande arrive depuis l'**adresse email du compte**. Cette
adresse est vérifiée à l'inscription, elle constitue donc un facteur raisonnable
pour un compte de boutique.

Ce qui ne suffit pas : une demande citant une adresse email dans son corps mais
envoyée depuis une autre. Répondre alors à l'adresse du compte, jamais à celle de
l'expéditeur.

**Ne jamais demander une pièce d'identité par défaut.** La CNIL le rappelle : la
copie d'un titre d'identité n'est justifiée qu'en cas de doute sérieux, et la
demander systématiquement collecte une donnée bien plus sensible que celles en
jeu.

## Article 15, droit d'accès, et article 20, portabilité

L'export est produit par `exporterDonneesPersonnelles`, dans
`src/services/suppression-compte.ts`. Il rend du JSON structuré par nature de
donnée : compte, adresses, commandes, avis, connexions.

**Il ne contient jamais l'empreinte du mot de passe ni la clé publique d'une
passkey.** Ni l'une ni l'autre n'est réutilisable par la personne, ce que
l'article 20 vise, et l'empreinte est un secret au sens de l'invariant 9. Leur
existence est rapportée, jamais leur valeur. Un test le verrouille.

Déclenchement, depuis la racine du dépôt, base de production configurée :

```bash
npx tsx -e '
  import { exporterDonneesPersonnelles } from "./src/services/suppression-compte";
  const donnees = await exporterDonneesPersonnelles(process.argv[1]);
  console.log(JSON.stringify(donnees, null, 2));
' "<identifiant-du-compte>"
```

**Aucun écran ne le déclenche aujourd'hui**, et c'est assumé : une demande
d'accès se compte en unités par an sur une boutique de cette taille, et le délai
d'un mois laisse largement le temps d'un traitement manuel. Un écran viendra si
le volume le justifie.

Transmettre le fichier **à l'adresse email du compte**, jamais à une autre.

## Article 16, droit de rectification

Le client corrige lui-même son nom et son adresse email depuis son compte. Une
demande de rectification portant sur ces champs se répond en indiquant le chemin.

**Une commande ne se rectifie pas.** Son instantané est figé, invariants 3 et 4 :
l'adresse de livraison d'une commande passée est un fait historique, pas une
donnée à jour. Une erreur d'adresse sur une commande en cours se traite
commercialement, en modifiant l'expédition, pas en réécrivant la commande.

## Article 17, droit à l'effacement

**Le client le fait lui-même**, depuis `/compte`, sans passer par l'exploitante.
La suppression exige une confirmation explicite et une preuve d'identité récente,
la suppression de compte étant une action sensible de la famille `IDENTIFIANTS`,
ADR-027 décision 3.

### Ce qui part, ce qui reste

| Donnée | Sort |
|---|---|
| compte, sessions, moyens de connexion, passkeys | **supprimés** |
| carnet d'adresses | **supprimé** |
| commandes et factures | **conservées**, dissociées du compte |
| avis publiés | **conservés**, auteur anonymisé |
| journal des connexions | **conservé** six mois, utilisateur anonymisé |

**Le droit à l'effacement ne prime pas sur l'obligation comptable**, article 17
paragraphe 3 point b : l'article L123-22 du code de commerce impose dix ans sur
les factures et pièces justificatives. Supprimer une commande serait une
infraction comptable.

C'est dit à la personne **avant** qu'elle confirme, sur l'écran de suppression :
laisser croire à un effacement total produirait une réclamation fondée sur une
attente que la loi ne permet pas de satisfaire.

**Le journal des connexions survit volontairement**, en `SET NULL`. Un intrus qui
compromet un compte ne doit pas pouvoir effacer ses traces en supprimant ce
compte.

### Si la suppression est refusée

L'écran affiche « ce compte ne peut pas être supprimé automatiquement ». Un seul
cas le produit : le compte a rédigé une **réponse à un avis**, référence en
`RESTRICT` assumé. Cela ne concerne que le compte d'administration, jamais un
compte client.

## Article 21, droit d'opposition

Aucun traitement de ce projet ne repose sur le profilage ni sur la prospection
commerciale automatisée. Une opposition portant sur les emails transactionnels se
répond en indiquant qu'ils sont nécessaires à l'exécution du contrat, article
6.1.b, et non fondés sur un intérêt légitime auquel on pourrait s'opposer.

## Tracer la demande

Consigner dans un fichier hors dépôt, les demandes portant des données
personnelles : date de réception, nature de la demande, date et contenu de la
réponse, et le cas échéant le motif d'un refus.

**Un refus se motive toujours** et mentionne la possibilité de saisir la CNIL,
article 12 paragraphe 4.
