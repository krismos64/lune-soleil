# 11 septembre 2026, LS-61 : le renvoi d'invitation d'avis

Critère 3, le dernier de la story. Zone critique : jeton d'accès, autorisation.

## Ce que l'absence de renvoi coûtait

Une invitation partait **une fois et une seule**. Un client qui perdait son
email ne pouvait plus jamais déposer son avis, et rien ne permettait de lui en
renvoyer un. Cela se payait en avis non déposés, jamais en droit perdu.

Le critère 3 était « tenu par le code, non exerçable » : le bloc de tests qui le
couvrait révoquait le jeton par un `UPDATE` direct en base. Il prouvait que le
dépôt **refuse** un lien révoqué, jamais que quoi que ce soit sache le révoquer.

## Le piège central, point 8 de `database.md`

Le lien de l'email ne porte que le jeton de la **première ligne**, mais les
autres existent en base : n'en faire tourner qu'un les laisserait valides
jusqu'à leur terme. Sur une boîte partagée, un ancien lien déposerait un avis à
la place de son destinataire. Tous sont donc régénérés.

## Deux défauts graves trouvés en revue critique

### Une transaction avortée qui rend un succès

`deposerEnvoi` avale le P2002 de `envoi_en_attente_actif_unique`, ce qui convient
à un appelant qui dépose et s'en va. Mais **PostgreSQL a déjà avorté la
transaction** au moment de la violation : les trois écritures précédentes sont
perdues au `COMMIT`, et Prisma ne lève rien.

Le service rendait `RENVOYEE` sur une base **inchangée**, et `nombreEnvois` ne
bougeait pas, donc le plafond ne se rapprochait même pas.

**Vérifié par sonde isolée** : deux tables, une insertion valide puis un doublon
avalé dans la même transaction, résultat **zéro ligne écrite**.

Si la transaction aboutissait, l'email d'origine encore en attente partirait avec
l'**ancien** jeton que ce renvoi vient de révoquer : le client recevrait un lien
« remplacé » en étant invité à chercher un email plus récent qui n'existe pas.

Le refus passe donc **en amont** de la transaction, `REFUSE_ENVOI_EN_COURS`, par
`intentionActiveExiste`. Ne pas retirer cette garde ni déplacer `deposerEnvoi`.

### Une écriture du point 8 que rien ne prouvait

`dernierEnvoiA`, la quatrième écriture. La remplacer par un `void` laissait les
43 tests verts. L'assertion compare désormais à la valeur **d'avant**, un « non
nul » restant vert puisque le premier envoi l'a déjà renseignée.

## Cinq défauts trouvés en revue frontend

Le plus instructif est le motif « l'original a divergé de ses copies », appliqué
à l'envers : les **trois** composants voisins du même dossier rendent l'attente
**dans la région live**, celui-ci l'avait mise dans le seul libellé du bouton.

Les deux se combinaient mal : le bouton `disabled` perd le focus, donc un lecteur
d'écran n'y revient pas pour lire le nom qui vient de changer. **Aucune des deux
surfaces n'annonçait rien** pendant l'action la plus lente de l'écran.

| Défaut | Correction |
|---|---|
| la région live muette pendant l'envoi | elle porte l'attente, comme les trois voisins |
| le nom accessible du bouton qui mute | libellé **fixe** |
| `PLAFOND` énonce un fait sans dire quoi faire | il nomme ce qui reste possible, contacter le client |
| le succès ne dit pas où part le message | l'adresse destinataire est rappelée avant **et** après |
| l'état n'était lisible qu'après un clic | `lireEtatRenvoi` le passe depuis le serveur |

`PLAFOND` est le **seul refus dont l'écran ne permet pas de sortir** : aucune
remise à zéro n'existe. Sans phrase de sortie, l'exploitante recliquerait et
conclurait à une panne.

## Un échec intermittent fermé au passage, et il venait de moi

La suite rougissait **une fois sur deux** sur un test d'avoir, sans rapport
apparent. Cause : `statistiques.sequential.test.ts`, livré cette nuit avec LS-64,
ne vidait pas `compteur_numero` — seul des vingt-et-un fichiers qui créent des
commandes.

`avoir.sequential` assère `A-2026-0001`, donc suppose un compteur vierge : selon
l'ordre d'exécution il obtenait `0002`.

**Un échec intermittent coûte plus cher qu'un échec franc** : il dépend de
l'ordre des fichiers, et le diagnostic porte sur un fichier **autre** que celui
qui rougit. Deux exécutions consécutives confirment la fermeture.

## Preuve par mutation

| Mutation | Effet |
|---|---|
| ne révoquer que le premier jeton | le test à 2 lignes rougit |
| consommer au lieu de révoquer, règle L10 | 2 tests rougissent |
| plafond retiré | le test du plafond rougit |
| refus en amont retiré | le test de l'envoi en cours rougit |
| quatrième écriture retirée | le test de `dernierEnvoiA` rougit |

Cinq mutations, cinq détectées, restauration vérifiée.

## Preuves

```
npm run type-check   vert
npm run lint         vert
npm run test         96 fichiers, 1538 tests, deux exécutions consécutives
./scripts/verifier-gardes-administration.sh    42 actions, toutes gardées
./scripts/verifier-actions-sensibles.sh        cohérentes
./scripts/verifier-revalidation-layout.sh      conforme
./scripts/verifier-ponctuation-chargement.sh   C35 respectée
./scripts/verifier-description-accessible.sh   conformes
./scripts/verifier-redaction-francaise.sh      aucun cadratin, aucun accord
```

## Ce qui n'est pas fait, et se signale plutôt que se tait

**Aucun test de bout en bout ne couvre cet écran.** Les fixtures laissent
délibérément `Expedition.livreA` nul, pour que le signalement de suivi bloqué de
LS-216 reste visible : ma section ne s'affiche donc sur aucune d'elles. Ajouter
une fixture livrée dépasserait le périmètre et risquerait de déplacer ce que
LS-216 mesure.

Le rendu à 320 px n'a donc pas été mesuré. Le code n'implique aucun débordement,
les messages étant du texte qui s'enroule et le bouton portant les 44 px de
`--ls-touch-target`, mais cela demande un œil.

## Traçabilité

**Dépôt** : deux commits. **Journal** : ce document. **Jira** : LS-61 à
commenter. **Mémoire** : la fiche sur la transaction avortée par un doublon
avalé, qui dépasse cette story.

## Prochaine étape

LS-61 se clôt, ses sept critères étant remplis. Trois parties du parcours 7
restent non livrées et écrites comme telles dans `PARCOURS.md` : la réponse
publique de l'exploitante (usage non décidé), la modification d'un avis par son
auteur, et l'alerte de délai dépassé.
