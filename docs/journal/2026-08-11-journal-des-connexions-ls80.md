# 11 août 2026, journal des connexions, LS-80

Seconde session du jour, après LS-81. Story terminée et fusionnée sur `main`,
PR #87, quatre commits.

## Ce qui est livré

Une table dédiée `journal_connexion`, distincte de `journal_audit` : ce dernier
exige `type_cible`, `id_cible` et un `detail` non nul, et son acteur désigne un
compte existant. Une tentative échouée sur une adresse inconnue n'a ni cible ni
acteur, et c'est précisément le cas qui révèle un balayage.

Portée administration et clients, réussites et échecs, règle **E13**. Trois
règles numérotées nouvelles : E13 la journalisation, E14 la purge à six mois,
E15 l'écriture qui ne bloque jamais une connexion.

Le hook `after` de Better Auth capte les chemins de connexion, plutôt qu'un appel
par écran qu'un oubli rendrait incomplet sans aucun symptôme.

Écran d'administration derrière `exigerAdministratrice`, en cartes empilées :
sept informations par ligne imposeraient un défilement horizontal à 320 px, qui
masquerait la colonne d'issue, la seule qu'on vient lire.

## Un défaut attrapé par le premier test écrit

`limiteDeConservation` employait `setMonth`, qui travaille en heure locale. Le
premier test a mesuré une dérive d'une heure entre août et février, au passage à
l'heure d'hiver : le calcul dépendait du fuseau de la machine, ce que
l'invariant 8 interdit. Corrigé en `setUTCMonth`, puis corrigé une seconde fois,
voir plus bas.

## Ce que la relecture a trouvé, et qui compte plus que le reste

`ls-critical-reviewer` a été passé deux fois, et **les deux passes ont trouvé des
défauts réels que la suite de tests ne voyait pas**. Six au total.

### Première passe, quatre défauts

**Aucune connexion par passkey n'était journalisée.** La table des chemins visait
`/sign-in/passkey`, qui n'existe pas : le plugin expose
`/passkey/verify-authentication`. Le hook sortait donc sans rien écrire sur le
moyen que l'ADR-021 pose en principal pour l'administration, et la valeur d'enum
`PASSKEY` n'était produite par aucun chemin réel. Le nom évident était faux, et la
suite n'exerçait que le mot de passe.

**Les tentatives refusées par la limitation de débit échappaient au journal.**
Better Auth applique la limitation dans `onRequest` et rend le 429 immédiatement ;
`better-call` sort alors sans appeler l'endpoint, les hooks `after`, ni même
`onResponse`, vérifié dans `router.mjs:103`. Aucun point d'extension de la
bibliothèque ne voit ces requêtes. Avec cinq tentatives par minute autorisées, une
attaque de trois cents tentatives en cinq minutes ne laissait que vingt-cinq
lignes : la relecture y voyait une saisie maladroite au lieu d'un balayage.

Troisième valeur d'enum `REFUSEE_LIMITATION`, et une enveloppe dans l'adaptateur
de route, seul endroit en aval qui voit ces réponses.

**`limiteDeConservation` débordait de mois.** `setUTCMonth` ne borne pas le
quantième : le 31 août moins six mois rendait le **3 mars**, le 31 mars rendait le
1er octobre. La limite partait vers l'avant, donc la purge supprimait des lignes de
**moins** de six mois, jusqu'à trois jours de trop, contredisant le choix du `lt`
strict fait pour l'inverse. Quatorze quantièmes par an concernés, et le test
ancrait le 11 août, qui n'expose jamais le défaut.

**`emailTente` n'était borné ni en longueur ni en contenu**, quand
`agentUtilisateur` l'était pour exactement le même motif. Une adresse de 200 011
caractères entrait telle quelle, et un mot de passe collé dans le champ email
était persisté en clair : le critère 2 vise le champ `password`, ce chemin le
contournait par l'autre champ.

### Seconde passe, deux défauts, dont un ouvert par la correction

**L'écran annulait le bénéfice de `REFUSEE_LIMITATION`.** Les deux ternaires
`issue === "REUSSITE" ? ... : ...` étaient binaires : la troisième valeur retombait
en silence dans la branche « sinon » et s'affichait « Échec » en rouge. TypeScript
ne voyait rien, chaque ternaire ayant une branche par défaut.

C'est le **piège d'index partiel déjà rencontré sur ce projet, transposé de la base
vers l'écran** : ajouter une valeur à un enum ouvre en silence un filtre écrit pour
les valeurs précédentes. Remplacé par des `Record<IssueConnexion, ...>`, dont
l'exhaustivité est prouvée : retirer une entrée fait échouer `tsc` en TS2741.

**Un mot de passe contenant une arobase traversait le filtre.** `@` est l'un des
caractères spéciaux les plus choisis quand une politique en exige un.
`P@ssw0rd!2026` était persisté en clair sur un dépôt public. Le test du critère 2
était **vert parce que sa constante n'avait pas d'arobase**, donc tombait du bon
côté du filtre : il validait un filtre qu'il ne traversait pas.

## Deux défauts hors périmètre, corrigés aussi

**`verifier-tests-mutation.sh` laissait une mutation sur le disque.** Il mutait
`src/services/reauthentification.ts` sans que ce fichier figure dans `MUTABLES`,
donc sans jamais le restaurer. **Chaque exécution depuis LS-81 réintroduisait le
défaut de sécurité que cette story avait corrigé avant sa fusion**, une preuve
d'identité absente considérée comme fraîche. Trouvé parce que la suite complète
rougissait après un script annonçant « 27 mutations, 27 détectées ».

Un garde-fou refuse désormais toute mutation d'un fichier absent de la liste,
prouvé en retirant `REAUTH`.

**La suite unitaire doit tourner sans Docker.** Le test de `lireResultat` importait
le hook, donc le service, donc Prisma. La fonction est sortie dans
`src/lib/issue-connexion.ts`, sans aucun import du projet, même motif que
`mot-de-passe.ts`.

## Un contrôle qui a atteint sa limite

`verifier-config-claude.sh` a annoncé « README annonce **1** mutations » là où le
README disait « trente-et-une ». Sa table de conversion s'arrêtait à trente,
`trente-et-une` n'était pas reconnu, et l'alternance retenait `une` seul. Le
message était juste dans son intention et faux dans son chiffre, ce qui fait
suspecter le document plutôt que l'outil. Table étendue à quarante, prouvée dans
les deux sens.

Même motif que l'extension de dix à trente, faite en son temps pour la même
raison : un contrôle qui se tait quand il ne comprend pas est pire qu'un contrôle
absent.

## Preuves

```
npm run type-check                        vert
npm run lint                              vert
npm run format:check                      vert
npm run build                             vert
npm run test                              203 tests, 12 fichiers
env -u DATABASE_URL npm run test:unitaire 118 tests sans base
npm run test:e2e                          33 tests, trois largeurs
npm run db:verifier                       95 réussites, 0 échec, 32 tables
npm run db:verifier:conception            95 réussites, 0 échec
./scripts/verifier-regles.sh              vert, 16 dossiers couverts
./scripts/verifier-config-claude.sh       vert
./scripts/verifier-tests-mutation.sh      31 / 31 détectées
```

La suite passe de 177 à **203 tests**, la mutation de 23 à **31 cas**.

Rendu vérifié sur serveur de production local, session d'administration réelle,
aux quatre largeurs, débordement nul partout. Les trois badges se distinguent :
vert « Réussite », ambre « Refus de cadence », rouge « Échec ».

Le badge ambre emploie `--ls-accent-gold-deep` et non `--ls-warning`, mesure à
l'appui : ce dernier donne **4,04:1** sur blanc, sous le seuil AA de 4,5:1, et un
badge de 14 px gras n'est pas du « texte large », qui commence à 18,66 px. Le
jeton sémantique évident aurait franchi la règle de contraste.

## État des tickets

**LS-80 terminée**, les neuf critères remplis.

**LS-90 créée**, registre des traitements, Must / Go-Live, epic LS-2, bloquée par
LS-80. Le registre n'existe nulle part dans le dépôt et couvre tous les
traitements, pas seulement ce journal : l'écrire ici aurait produit un document
partiel qui aurait l'air complet.

**LS-91 créée**, proxies de confiance, Should / Go-Live, epic LS-2, bloquée par
LS-80. Sans `trustedProxies`, l'adresse IP restera **nulle** derrière le Nginx du
VPS : depuis Better Auth 1.6.21, une chaîne `X-Forwarded-For` à plusieurs sauts est
refusée tant qu'aucun proxy de confiance n'est déclaré. La colonne est nullable et
rien ne casse, ce qui rend le défaut silencieux.

## Ce qui reste ouvert

**La purge n'est appelée par personne.** La tâche planifiée qui la déclenchera est
LS-72, story suivante.

## Prochaine étape

**LS-72**, squelette du conteneur de tâches planifiées et table de verrou. Le
modèle `VerrouTache` existe déjà dans le schéma depuis LS-13, avec son champ
d'expiration et son unicité sur le nom : la story se réduit aux routes internes,
au service de prise et relâche, au test de concurrence et au conteneur.

Elle accueillera aussi l'appel de `purgerJournalConnexion`.
