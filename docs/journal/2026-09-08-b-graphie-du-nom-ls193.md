# 8 septembre 2026, b : LS-193, un contrôle voisin était devenu aveugle en restant vert

Le nom suit désormais le logo, « Lune-soleil », et il ne s'écrit plus qu'à un
endroit. Le plus instructif est ce que le nouveau contrôle a trouvé dès sa
première exécution.

## L'écart, et où il se voyait

Le médaillon de `assets/logo-lune-soleil.png` écrit « Lune-soleil », trait
d'union et minuscule à soleil, ce que l'ADR-022 confirme. Le code portait
« Lune & Soleil ». Arbitrage de Christophe du 5 septembre 2026 : aligner le code
sur le logo.

L'écart se voyait **dans une seule image**. Le générateur composait
« Lune & Soleil » à côté du médaillon qui dit « Lune-soleil », dans l'image que
les réseaux sociaux affichent. Les six images sont régénérées, et la nouvelle a
été relue à l'œil.

## Douze fichiers l'écrivaient en dur, dont ceux qui l'importaient déjà

`layout.tsx` se servait de `NOM_BOUTIQUE` pour son gabarit de titre **tout en
recopiant** le nom dans le titre par défaut, trois lignes plus haut. C'est ce
genre de duplication qui laisse deux graphies coexister : chaque fichier était
cohérent avec lui-même.

Tous dérivent désormais la constante. Le contrôle en porte le second sens, plus
utile que le premier à long terme : sans lui, « Lune-soleil » se recopierait
dans vingt fichiers et le prochain changement rouvrirait le même écart.

## Le contrôle a trouvé un contrôle cassé

`verifier-seo.sh` cherchait « Lune & Soleil » **en dur** pour détecter un titre
qui redouble la marque. Au changement de graphie, il est devenu **aveugle en
restant vert**.

C'est le pire état pour un garde-fou : un contrôle rouge se voit, un contrôle qui
a cessé de voir ne s'annonce par rien. Il lit désormais la constante à la source,
et sa mutation de preuve est alignée.

**Un contrôle qui porte sa propre copie de la valeur qu'il juge se périme en
silence.** Mon propre contrôle applique cette leçon : il lit `NOM_BOUTIQUE` dans
`seo.ts` plutôt que d'écrire la graphie attendue.

## La dénomination sociale, vérifiée avant de toucher quoi que ce soit

Le critère 4 demandait de s'en assurer, et le ticket mettait en garde : une
dénomination sociale modifiée dans une facture serait une faute.

Elle vient de `FACTURE_RAISON_SOCIALE`, lue dans l'environnement par
`identite-legale.ts`, et **n'apparaît dans aucun fichier du dépôt**. Les mentions
légales et les factures ne pouvaient donc pas être atteintes par ce changement :
la séparation est structurelle, pas une précaution de rédaction.

## Trois pièges d'écriture, tous déjà en fiche

**Le script de mutation a effacé mon travail.** Deux fichiers que je venais de
corriger sont revenus à leur état commité, `git checkout` oblige. Motif « travail
non commité perdu », et mon propre script de preuve porte désormais le garde-fou
qui refuse de tourner sur un dépôt modifié.

**Perl a interprété la substitution.** `${new Date()...}` dans la ligne visée
fait échouer `perl -pi` sur « Can't locate object method "new" via package
"Date" ». Motif « substitution mal formée ». `sed` fait le travail.

**Ma vérification écrivait la chaîne interdite.** Le garde-fou qui contrôlait que
la mutation avait bien pris contenait « Lune & Soleil » en clair, donc le
contrôle le détectait et rougissait en permanence. Motif « le hook bloque son
explication ». La chaîne est composée à l'exécution.

## Le changement de `rpName` et les passkeys

Vérifié via Context7 plutôt que supposé : la spécification WebAuthn lie une
passkey au **`rpID`**, le domaine, jamais au `rpName` qui n'est qu'un libellé
d'affichage. Le `rpID` reste dérivé du domaine et n'est pas touché : les passkeys
déjà enregistrées ne sont pas affectées.

## Preuves

`verifier-graphie-marque.sh`, deux sens, **quatre mutations sur quatre**, dont
deux qui gardent le contrôle contre lui-même. La quatrième vise le mode de
défaillance rencontré sur `verifier-seo.sh` : vider la liste des fichiers
examinés doit faire échouer le garde-fou de cardinalité, jamais rendre un OK
silencieux.

`verifier-seo-mutation.sh` rejoué, **cinq mutations sur cinq**.

34 tests unitaires et 102 de bout en bout au vert. Une mutation de `NOM_BOUTIQUE`
vers l'ancienne graphie les fait rougir, critère 6, y compris les tests de bout
en bout qui lisent le HTML réellement servi.

## État des tickets

**LS-193 livrée.** Reste à fusionner sur `main`.

**LS-166, LS-174 et LS-163 closes** plus tôt dans la session, PR #296, #297 et
#298 fusionnées. Le compte passe à **142 tickets terminés sur 192** une fois
LS-193 close.

## Ce qui reste ouvert

Le journal cite forcément l'ancienne graphie, il **raconte** ce qui s'est passé :
`docs/journal/` est exclu du contrôle, le corriger réécrirait l'histoire.

Les quatre tests d'intégration sur `chemin_pdf` échouent toujours, défaut
préexistant identifié en LS-166.

## Prochaine étape

La série de quatre tickets courts est terminée. Le backlog réalisable sans VPS,
sans médiateur et sans Mondial Relay porte encore LS-175 et LS-189, la paire du
compte d'administration, puis LS-173, la réintégration de stock après retour.
