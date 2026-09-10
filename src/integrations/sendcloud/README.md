# integrations/sendcloud/

Points de retrait et **suivi des colis** Mondial Relay, servis par l'**API
Sendcloud**.

## Pourquoi ce nom

**Le transporteur est Mondial Relay, le fournisseur d'API est Sendcloud.** Les
deux ne se confondent pas : Mondial Relay redirige son offre sans contrat vers
Sendcloud, agrégateur qui porte le contrat, ADR-035. Le dossier s'appelait
`mondial-relay/` jusqu'à LS-200, ce qui désignait le transporteur et mentait sur
l'API réellement appelée.

## Ce qui entre ici

- l'appel HTTP à Sendcloud et la lecture de ses identifiants dans
  l'environnement
- la traduction de sa réponse vers le type `PointRetrait` du projet
- la traduction de ses pannes en `TransporteurIndisponibleError`

## Ce qui n'entre pas

- la décision d'afficher ou non la liste, qui appartient à l'écran
- le choix des modes proposés, qui appartient à `lib/livraison.ts`
- une clé en clair : les deux identifiants viennent de l'environnement

## Découpage des fichiers

| Fichier | Rôle |
|---|---|
| `index.ts` | le contrat des points de retrait, ses erreurs, la dégradation, **aucun appel réseau** |
| `fournisseur.ts` | l'appel HTTP réel, recherche des points de retrait, LS-200 |
| `statuts.ts` | la correspondance des statuts de suivi, ADR-042, **aucun appel réseau** |
| `suivi.ts` | l'appel HTTP réel, lecture du statut d'un colis, LS-131 |
| `methodes.ts` | la correspondance mode vers méthode d'expédition, **aucun appel réseau**, LS-218 |
| `expedition.ts` | l'appel HTTP réel, **création d'un colis et de son étiquette**, LS-218 |

`statuts.ts` porte la règle la plus coûteuse du projet si elle est fausse :
`livreA` ouvre le délai de rétractation, et l'article L221-20 le porte à douze
mois quand l'information est incorrecte. **Deux** statuts constatent la remise,
`Delivered` au domicile et `Shipment collected by customer` en point de retrait.

`index.ts` est importable par un test ou un service sans exiger la moindre
variable d'environnement, même découpage que `integrations/stripe`.

## Points de vigilance

**Les DEUX clés sont secrètes.** Sendcloud les combine en `publique:secrete`
puis encode en base64 pour une authentification HTTP Basic : la clé dite
publique est un identifiant, jamais une clé publiable au sens de Stripe. Aucune
ne prend le préfixe `NEXT_PUBLIC_`.

**`expedition.ts` DÉPENSE DE L'ARGENT RÉEL**, seul module du projet dans ce cas.
Sendcloud n'a **pas de mode test** : chaque création aboutie produit un envoi
facturé, 4,10 € en point relais et 7,49 € à domicile, ADR-035, et une annulation
ne rembourse pas. Trois conséquences tenues :

- le client est **injectable** et aucun test du dépôt ne joint l'implémentation
  réelle. Le chemin nominal n'est donc couvert par aucun test automatique, ce
  qui est assumé : le couvrir coûterait une étiquette par exécution de la CI
- les clés sont **neutralisées** dans `playwright.config.ts`, `webServer`
  héritant sinon du `.env` local qui les porte
- le service **vérifie en base avant d'appeler** : commande introuvable, statut
  incompatible ou expédition existante coûtent une lecture, jamais une étiquette

**Le poids est un forfait de 200 g**, arbitrage du 10 septembre 2026 : aucun
poids n'existe au schéma, le catalogue ne portant que des boucles d'oreilles. La
tranche Sendcloud s'arrête à 0,251 kg, et les cinquante grammes de marge
couvrent l'emballage. Une pièce plus lourde au catalogue rouvrira le sujet, et
le poids par variante deviendra alors une story.

**Une panne dégrade, elle ne ferme jamais la vente.** Le domicile n'exige aucun
appel externe, cas d'erreur du parcours 1. C'est la raison d'être des trois
modes d'ADR-025.

**Le numéro de rue se concatène simplement**, `street` et `house_number` étant
deux champs séparés, mesuré sur 1040 points le 10 septembre 2026. Ne pas
réintroduire de détection de doublon : « RUE DU 8 MAI 1945 » avec un numéro
« 8 » y verrait un doublon et perdrait le vrai numéro. Le numéro vide existe en
revanche, 16 cas sur 1040, et rend la voie seule.

**L'identifiant Sendcloud est un entier**, le contrat du projet le veut en
chaîne. La conversion se fait ici, le reste du code ne voit jamais le type du
fournisseur.
