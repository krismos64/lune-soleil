# 12 septembre 2026, LS-29 : les dix emails, et trois diagnostics faux avant le bon

Seconde session du jour, après le déploiement. L'exploitante était présente avec
Christophe, ce qui a débloqué LS-29 sur son point le plus coûteux : le ton.

## Ce qui est livré

| Sujet | État |
|---|---|
| LS-29, les dix modèles d'email | **fusionnée**, PR #405, reste En cours |
| LS-224, la fenêtre de course du remboursement | **corrigée**, deux critères ouverts |
| LS-221, l'écran « Mes avis » absent | **créée** |
| LS-222, la mise en forme HTML des emails | **créée** |
| LS-223, la clé Backblaze avec `deleteFiles` | **créée** |

186 tickets terminés sur 214 hors epics, relevés dans Jira.

## Le ton, obtenu en quelques minutes

L'exploitante n'avait que peu de temps. Plutôt que de lui soumettre dix textes à
valider, six questions lui ont été posées, celles dont la réponse ne pouvait
venir que d'elle : signature, vouvoiement, sa phrase pour remercier d'une
commande, ce qu'il ne faut jamais écrire, le mot pour ses pièces, et comment elle
annonce un colis parti.

**L'atelier Lune-soleil**, vouvoiement, « faits main » et « artisanal », « votre
colis est en route ». Les dix textes ont été rédigés à partir de là, et elle les
a validés.

Christophe a tranché deux points en séance : **« article » et jamais « bijou »**,
et **« nous » et jamais « je »** malgré une exploitante seule, la signature
« L'atelier » étant un collectif.

## Six modèles sur dix n'existaient pas

**Dix est le périmètre de LS-29, pas le total du projet.** Le dépôt en porte
**quinze**, les cinq d'authentification préexistant à cette story. J'ai écrit
« dix » dans un commentaire de LS-222 en additionnant de mémoire, et le compte
était faux : il se mesure.

```
sed -n '/export type ModeleEmail/,/;$/p' src/integrations/email/index.ts \
  | grep -coE '"[a-z-]+"'
```


Le constat qui a changé le périmètre : LS-29 paraissait être un travail de
rédaction, c'était aussi du développement. Manquaient l'expédition, le
remboursement, la confirmation de contact au client, et trois notifications
d'administration.

**F-MAIL-02, la facture, n'a pas de modèle et ce n'est pas un oubli.** Elle est
portée par le lien signé de `commande-confirmee`, permanent et personnel.

## Deux affirmations fausses, l'une repérée par Christophe

**« Ces deux liens ne sont pas retrouvables ailleurs »**, dans la confirmation de
commande. Christophe a demandé si l'espace client ne les portait pas. Vérifié :
l'écran de détail porte la facture **et** la rétractation, et une commande passée
sans compte se rattache après inscription. La phrase était fausse depuis LS-172.

**L'accusé de contact n'annonçait aucun délai.** J'avais appliqué la règle de
LS-29, « aucun délai inventé », sans lire que `REPONSES-EXPLOITANTE.md` portait
depuis le 3 septembre les **24 heures données par l'exploitante**. La règle
interdit un délai inventé, pas un délai qu'elle a fixé.

## Trois diagnostics opposés en une heure, sur un test instable

C'est la part la plus instructive de la session, et la plus coûteuse.

Un test de concurrence du remboursement rougissait en intégration continue.

```
1er diagnostic   « le defaut preexiste »   -> LS-224 creee, sur une bissection partielle
2e diagnostic    « c'est mon code »        -> LS-224 FERMEE a tort
mesure sur cinq  1 succes sur 5 AVANT      -> le ticket avait raison
```

**Le test échouait quatre fois sur cinq avant tout travail du jour.** Chaque
verdict reposait sur **une seule exécution**, donc sur un tirage : assez pour
fabriquer n'importe quelle conclusion.

J'ai fermé un ticket juste en écrivant qu'il reposait sur un diagnostic faux, et
failli fusionner une PR en attribuant un défaut réel à `main`.

## Le défaut, et ce que son commentaire disait

`marquerIntentionAboutie` était appelé **avant** la transaction qui écrit
l'avoir. Entre ces deux instants, le montant n'était compté par **aucun** des
deux termes de la borne : ni par `montantAvoirCentimes`, l'avoir n'existant pas
encore, ni par les intentions en cours, celle-ci venant d'en sortir.

**Le commentaire de `reserverIntentionRemboursement` décrivait cette fenêtre et
l'assumait :**

> « son seul effet serait d'autoriser une demande concurrente que le CHECK
> rattraperait »

C'est exact, et c'était le problème. `chk_facture_avoir_borne` rattrape
l'**argent**, jamais le **message** : l'exploitante lisait une erreur serveur là
où elle devait lire « le montant dépasse le restant ».

Le marquage vit désormais dans la transaction de l'avoir. Dix succès sur dix.

## Deux défauts de mon code trouvés par la CI, pas par moi

**`commandeId` sur la clé d'outbox.** La clé `(commandeId, modele)` faisait
échouer le **second remboursement** d'une même commande, la violation d'unicité
avortant la transaction donc l'avoir. Or un partiel se répète légitimement. Un
test d'intégration l'a attrapé.

**Un appel Prisma direct depuis un service.** `verifier-regles.sh` étape 6c :
« `avoir.ts` appelle un modèle Prisma directement ». La lecture vit maintenant au
dépôt.

**Ma liste locale de contrôles était de nouveau trop courte**, exactement le
motif que le journal du 11 septembre décrivait. Corrigé pour la suite, la liste
s'extrait du workflow :

```bash
grep -oE '\./scripts/verifier-[a-z0-9-]+\.sh' .github/workflows/controles.yml | sort -u
```

Jouée entièrement avant le dernier envoi : zéro échec, et la CI est passée.

## Ce qui n'est pas fait, et se signale

**LS-29 reste En cours.** Aucun de ces dix modèles n'a jamais été envoyé pour de
vrai, critère 4. Et l'exploitante a validé le ton, pas les dix textes dans leur
version définitive.

**LS-224 reste En cours** sur deux critères : aucune mutation n'exerce le
correctif, et `payments.md` ne porte pas la règle. Un correctif de concurrence
que rien n'exerce se défait au premier remaniement, ce qui est précisément ce
qui s'est produit ici.

**Aucun interrupteur ne couvre la rétractation.** Les cinq booléens d'ADR-043 ne
la prévoient pas, et emprunter `alerteCommandePayee` ferait qu'en la décochant
l'exploitante couperait aussi les rétractations. Elle part donc toujours. Un
sixième interrupteur demande un ADR, LS-219 le porte.

## Preuves

```
npm run type-check                   vert
npm run lint                         vert
npm run format:check                 vert
modeles-email                        48 tests
message-contact (integration)        21 tests
remboursement-garde                  10 sur 10, dix essais
tous les controles du workflow       0 en echec
CI PR #405                           verte
```

## Prochaine étape

**LS-145** reste le meilleur candidat sans dépendance : mesurer F-ADM-07 au
chronomètre, cible posée en LS-15 et jamais mesurée.

**Deux tickets faisables** issus de cette session : LS-222, la mise en forme HTML
des emails, qui n'attend personne ; et les deux critères ouverts de LS-224.

**LS-29 attend un envoi réel**, donc un déploiement. La correction du nom
`contact` → `Stacy` attend elle aussi d'être déployée.
