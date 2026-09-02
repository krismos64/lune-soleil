# Validation des entrées et convention d'erreur

Posé par LS-71. Ce document est la convention que toute story suivante applique
au lieu d'improviser la sienne.

L'invariant 7 est absolu : **toute entrée non fiable est validée côté serveur
avec Zod.** Une entrée non fiable est tout ce qui vient du réseau, paramètre
d'URL, `FormData`, corps de requête, en-tête, cookie, ou sortie d'un modèle de
langage.

## Où valider, et pourquoi à deux endroits

| Couche | Ce qu'elle valide | Ce qu'elle ne fait pas |
|---|---|---|
| `app/`, Server Actions et gestionnaires de route | la forme de l'entrée reçue, puis délègue | aucune règle de gestion, aucune transaction |
| `services/` | la forme de ses arguments, au point d'entrée du cas d'usage | ne lit jamais `Request`, cookie ni `FormData` |

**Ce n'est pas une redondance.** Un service s'appelle depuis un adaptateur, mais
aussi depuis un autre service, une tâche planifiée ou un test : par ces chemins,
aucun adaptateur n'a validé quoi que ce soit. Le point d'entrée du cas d'usage
est le seul endroit que tous les appelants traversent.

Le coût est négligeable, la validation étant une comparaison en mémoire, sans
accès à la base.

## Le socle, `src/lib/validation.ts`

```ts
import { schemaQuantite, valider } from "@/lib/validation";

const quantite = valider(schemaQuantite, entree); // ou lève EntreeInvalideError
```

| Schéma | Ce qu'il accepte | Ce qu'il refuse |
|---|---|---|
| `schemaMontantCentimes` | entier positif ou nul | tout décimal, négatif, `NaN`, infini, chaîne |
| `schemaQuantite` | entier strictement positif | zéro, négatif, décimal, non fini |
| `schemaIdentifiant` | UUID | toute autre forme de chaîne |
| `schemaHorodatageUtc` | ISO 8601 avec `Z` ou décalage explicite | une date sans fuseau, un horodatage numérique |
| `schemaAdressePostale` | adresse de France métropolitaine | clé inconnue, code postal en 97 ou 98, pays autre que `FR` |
| `schemaLignePanier`, `schemaPanier` | composés des précédents | panier vide |
| `schemaNomClient` | nom du destinataire, obligatoire aux trois modes | un champ réduit à des caractères invisibles |
| `schemaEmailClient` | adresse email, `z.email()` | une expression régulière maison refuserait des adresses valides |
| `schemaTelephone` | numéro français, séparateurs tolérés puis retirés | facultatif, la chaîne vide passe |
| `schemaModeLivraison` | les trois modes d'ADR-025, **écrits en dur** | toute valeur ajoutée à l'enum Prisma sans tarif |
| `schemaPointRetrait` | point copié en entier, libellé et adresse | un point réduit à son identifiant |
| `schemaChoixLivraison` | mode et point liés par une **équivalence** | un `DOMICILE` porteur d'un point autant qu'un `POINT_RELAIS` sans point |
| `schemaSaisieExpedition` | transporteur, mode **exécuté**, numéro de suivi facultatif, point lié par la même **équivalence** | un mode de retrait sans point, un domicile qui en porte un, un numéro de suivi au-delà de 64 caractères |
| `schemaCoordonnees` | nom, email, téléphone facultatif | composé des trois précédents |
| `schemaAdresseFigee` | adresse **recopiée par une commande**, avec le `nom` du destinataire | relire une adresse figée avec `schemaAdressePostale`, qui refuse ce `nom` |
| `schemaEmetteurFacture` | identité légale lue dans l'environnement, SIRET à quatorze chiffres | une valeur absente, un SIRET espacé ou tronqué |
| `schemaLigneInstantane` | une ligne du document, deux libellés séparés | un total de ligne stocké, il se déduit |
| `schemaInstantaneLegal` | contenu intégral et **versionné** de la facture, LS-126 | un document sans ligne, sans mention, ou de version inconnue |

Zéro est accepté sur un montant et refusé sur une quantité, et c'est la seule
différence entre les deux schémas : zéro centime est un montant légitime, en
franchise en base de TVA ou sur un avoir soldé, zéro article n'est pas une
quantité.

**`schemaModeLivraison` est écrit en dur et non dérivé de l'enum Prisma**, et
c'est délibéré : ajouter une valeur à l'enum ouvrirait sinon **en silence** la
saisie à un mode dont aucun tarif n'existe. Le projet a déjà rencontré ce piège
deux fois, sur un index partiel puis sur un affichage.

**`schemaInstantaneLegal` vaut à l'écriture ET à la lecture, LS-126.** La
colonne `facture.instantane_legal` est un `Json` : elle accepte n'importe quelle
forme, et une clé oubliée ne se verrait qu'à la relecture du document, des années
après la vente. Le champ `version` est ce qui rend cette relecture possible : le
jour où la structure change, les factures déjà émises gardent la leur et restent
lisibles, l'invariant 4 interdisant de les réécrire.

**`schemaAdresseFigee` existe parce qu'une adresse figée n'est pas une saisie.**
Elle porte le `nom` du destinataire, absent du formulaire où le nom est un champ
voisin. Relire une adresse figée avec `schemaAdressePostale` échoue,
`z.strictObject` refusant la clé inconnue : le défaut s'est vu par un test
d'intégration de LS-126, pas à la relecture d'un document ancien.

**`schemaChoixLivraison` porte une équivalence, pas une implication.** La
contrainte `chk_commande_mode_point_relais` s'écrit
`(mode IN ('POINT_RELAIS','LOCKER')) = (point_relais_id IS NOT NULL)` : ne
vérifier qu'un sens laisserait passer la moitié des cas jusqu'à la base, où le
`CHECK` rejetterait l'écriture avec un message incompréhensible pour le
visiteur.

**`trim()` ne suffit pas à refuser un champ vide.** Il retire les espaces ASCII
mais pas `U+200B` ni `U+FEFF` : un nom réduit à un caractère invisible
franchissait la saisie et produisait une étiquette de colis sans destinataire
lisible. Le refus porte donc sur la présence d'une lettre ou d'un chiffre,
plutôt que sur une liste d'espaces à exclure, qu'on finit toujours par laisser
incomplète.

## Cinq règles qui ne se déduisent d'aucun type

### 1. Un montant décimal se refuse, jamais ne s'arrondit

L'invariant 1 interdit tout flottant dans un calcul monétaire. `19.99` est un
prix en euros arrivé dans un champ de centimes : le refuser fait apparaître le
défaut, l'arrondir à `20` produit une facture fausse que personne ne verra
passer. Convertir des euros en centimes est le travail explicite de l'appelant.

Aucun `z.coerce` dans ce socle. Coercer `"19.99"` réintroduirait par la porte de
service exactement ce que la porte principale refuse.

### 2. Valider n'autorise jamais

L'invariant 2 tient entièrement : un identifiant conforme prouve sa **forme**,
jamais le droit d'accéder à la ressource qu'il désigne. L'identité vient de la
session ou d'un jeton signé, recoupée côté serveur par
`services/autorisation.ts`.

Un `commandeId` validé reste un `commandeId` reçu du réseau.

### 3. Le message d'erreur ne recopie pas l'entrée

L'invariant 9 interdit de journaliser un secret. Un message d'erreur finit dans
un journal, une trace ou une réponse HTTP.

Mesuré sur Zod 4 dans ce dépôt : les `issues` **ne portent pas** la valeur
refusée. Le vecteur réel est ailleurs, et il est facile à manquer : le problème
`unrecognized_keys` porte les **noms des clés** rejetées, et ces noms viennent de
l'entrée. Un corps hostile les choisit, `{ "cle_api_sk_live_xxx": 1 }`.

`formaterProblemes` remplace donc le message de Zod pour ce seul code, et rend le
**nombre** de champs non reconnus. Le diagnostic reste possible, la donnée ne
sort pas.

### 4. Une entrée refusée est un résultat, pas une panne

Un adaptateur capture `EntreeInvalideError` et rend une valeur exploitable par
l'interface. Laisser l'exception traverser produit la page d'erreur générique de
Next.js, qui perd le contexte et ne dit rien d'utile.

```ts
try {
  const lignes = valider(schemaPanier, entree);
} catch (erreur) {
  if (erreur instanceof EntreeInvalideError) {
    return { statut: "INVALIDE", message: erreur.details };
  }
  throw erreur; // une panne reste une panne
}
```

`src/app/(boutique)/commande/actions-tunnel.ts` porte le motif complet dans
`passerCommandeAction`, y compris la distinction entre refus métier, contention
et panne. Il remplace `src/app/panier/actions.ts`, supprimé par LS-117 : cette
action n'avait plus d'appelant depuis que la commande porte la réservation, et
`use server` la laissait exposée comme point d'entrée acceptant un identifiant
de commande arbitraire.

### 5. Un objet validé ne se répand pas

Construire l'objet transmis à l'ORM **champ par champ**, jamais
`...resultat.data`. Répandre l'entrée, même validée, fait dépendre la sécurité du
schéma seul : une clé ajoutée par inadvertance deviendrait aussitôt écrivable en
base. `services/utilisateur.ts` porte ce motif, règle E11.

Les objets emploient `z.strictObject`, qui **refuse** les clés inconnues. Un
objet permissif les ignore en silence : sur une adresse cela semble inoffensif,
la même habitude appliquée à un profil laisserait passer
`role: "ADMINISTRATRICE"` sans un bruit.

## Zod 4, trois pièges de version

Vérifié via Context7, ces API ayant changé depuis Zod 3.

| À écrire | À ne plus écrire | Pourquoi |
|---|---|---|
| `z.strictObject({ ... })` | `z.object({ ... }).strict()` | `.strict()` est déprécié en Zod 4 |
| `z.int()` | `z.number().int()` | `z.int()` borne aussi au safe integer range |
| `z.iso.datetime()` | `z.string().datetime()` | méthode dépréciée |

`services/utilisateur.ts` emploie encore `.strict()`, forme dépréciée mais au
comportement identique. Sa réécriture n'appartenait pas à LS-71 et n'est pas
urgente : la dépréciation ne change rien à la garantie.

## Ce que le socle ne remplace pas

**Les contraintes de la base restent la ligne de défense.** Les `CHECK` de
PostgreSQL protègent l'invariant ; le socle améliore la **qualité du refus**,
en refusant tôt et lisiblement au lieu de laisser remonter un `23514` brut en
page d'erreur serveur.

Les deux ne sont pas redondants et aucun ne dispense de l'autre : l'un dit que la
base refuse un état incohérent, l'autre que l'application ne l'atteint jamais.

## Preuve par mutation

`./scripts/verifier-tests-mutation.sh` porte trois cas sur ce socle, cas 13 à 15,
qui mutent une **borne** et jamais un message : un libellé réécrit ne change
aucun comportement.

Deux mutations ont été écartées avant d'y arriver, toutes deux restées vertes à
raison. Elles ajoutaient `probleme.input` au message en supposant que Zod y met
la valeur refusée, ce qui est faux. C'est en cherchant pourquoi ces mutations ne
prouvaient rien que le vecteur `unrecognized_keys` a été trouvé.
