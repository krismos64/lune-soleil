# Vérification : tests et scripts

Déplacé du `README.md` le 30 octobre 2026, LS-302. La méthode des preuves par
mutation est décrite dans `docs/PREUVES-PAR-MUTATION.md`, et la chaîne qui
rejoue ces contrôles dans `docs/INTEGRATION-CONTINUE.md`.

## Tests, LS-68

```bash
npm run test              # Vitest, les trois projets
npm run test:unitaire     # sans base, lançable sans Docker
npm run test:composant    # rendu React en jsdom, sans base ni navigateur
npm run test:integration  # base éphémère, exige Docker
npm run test:e2e          # Playwright, quatre largeurs, deux sessions partagées
```

| Commande | Ce qu'elle exerce |
|---|---|
| `test:unitaire` | manipulation d'URL de base éphémère, sans base |
| `test:composant` | le rendu d'un composant React isolé, pour les états qu'aucun autre projet n'atteint |
| `test:integration` | la primitive SQL de réservation, sur le schéma réel |
| `test:e2e` | rendu, débordement mesuré aux deux bords, accessibilité axe-core, écrans d'administration ouverts par une vraie session |

**Le projet `composant` existe pour un besoin précis**, ajouté par LS-113 :
certains états dépendent d'une donnée **globalement** absente. Les deux états
vides « aucune catégorie » s'affichent quand la table entière est vide, ce que la
fixture de bout en bout ne peut pas produire puisqu'elle insère toujours une
catégorie ; et vider la table en cours de suite ferait voir cet état aux
travailleurs voisins, la base étant partagée.

**Il porte aussi ce qui se mesure sur l'ARBRE D'ACCESSIBILITÉ**, LS-225 : le nom
accessible d'un contrôle, l'annonce d'une région live, le comportement d'un bloc
repliable après une action. Ces cas ne dépendent d'aucune largeur et demandent un
compte, une commande et une livraison en bout en bout, donc quatre fois leur
prix. C'est ainsi qu'un nom accessible collé, « 2étoiles sur 5 », a été trouvé sur
un écran qui paraissait juste à l'œil depuis LS-61.

Il ne remplace pas la mesure de bout en bout, qui reste la seule à voir une
**mise en page** réelle : jsdom ne calcule aucune largeur, donc ni débordement ni
zone tactile ne s'y mesurent.

Les tests d'intégration créent une base **éphémère** au nom unique, y appliquent
`prisma migrate deploy`, puis la détruisent. La base de développement n'est
jamais touchée, et aucune exécution ne dépend de la précédente.

Le schéma vient des migrations et non de `db push` : les contraintes `CHECK`
n'ont aucun équivalent déclaratif, une base poussée accepterait la survente que
ces tests doivent voir refusée.

Sans Docker, `test:integration` **échoue** en nommant la cause, il ne s'ignore
pas. `test:unitaire` reste vert, ce qui le rend utilisable sur une machine nue.


## Scripts de vérification

Les comptes se mesurent plutôt qu'ils ne se recopient, ils bougent à chaque
story : `ls scripts/*.sh | wc -l` pour le total, `ls scripts/*mutation*.sh | wc -l`
pour ceux qui prouvent les autres. Ils valaient 86 et 37 le 9 septembre 2026 en
fin de journée, contre 84 et 36 le matin : la ligne s'est périmée dans la journée
même où elle a été écrite pour cesser de se périmer, ce qui est l'argument le
plus court en faveur de la commande plutôt que du nombre. La
liste ci-dessous n'en cite qu'une partie.
`preparer-base-locale.sh` n'y figure pas, il s'appelle par `npm run db:preparer`
et `db:reinitialiser`, cités plus haut.

```bash
./prisma/sql-manuel/verifier-schema.sh           # schéma sur base réelle, exige Docker
./scripts/verifier-regles.sh                     # .claude/rules/ : schéma, code, couverture
./scripts/verifier-regles-mutation.sh            # prouve le précédent par mutation
./scripts/verifier-config-claude.sh --strict     # cohérence de la config Claude Code
./scripts/verifier-config-claude-mutation.sh     # prouve le précédent par mutation
./scripts/verifier-migration-mutation.sh         # garde-fous de migration, sans base
./scripts/verifier-tests-mutation.sh             # prouve la suite de tests, exige Docker
./scripts/verifier-tests-non-ignores.sh          # aucun test ignoré ni focalisé, sans base
./scripts/verifier-propagation-docs.sh           # socle Zod et VALIDATION.md accordés
./scripts/verifier-hook-secrets.sh               # prouve le hook anti-fuite de secrets
./scripts/verifier-image-docker.sh               # sécurité de l'image, exige Docker
./scripts/verifier-image-docker-mutation.sh      # prouve le précédent par mutation
./scripts/verifier-actions-sensibles.sh          # réauthentification des actions sensibles
./scripts/verifier-actions-sensibles-mutation.sh # prouve verifier-actions-sensibles.sh par mutation
./scripts/verifier-gardes-administration.sh      # garde de rôle, par fonction
./scripts/verifier-gardes-administration-mutation.sh # prouve verifier-gardes-administration.sh par mutation
./scripts/verifier-rendu-texte-simple.sh         # rendu HTML interdit sur le contenu de section
./scripts/verifier-rendu-texte-simple-mutation.sh # prouve le précédent par mutation
./scripts/verifier-contraste.sh                  # contraste WCAG des paires couleur et fond, LS-84
./scripts/verifier-contraste-mutation.sh         # prouve le précédent par mutation
./scripts/verifier-bordure-controle.sh           # bordure d'un contrôle au seuil de 3:1, C36, LS-108
./scripts/verifier-gabarit-titre.sh              # le titre des espaces privés se pose dans le layout, LS-228
./scripts/verifier-bordure-controle-mutation.sh  # prouve le précédent par mutation
./scripts/verifier-loading-et-404.sh             # aucun loading.tsx ne masque un 404, LS-146
./scripts/verifier-loading-et-404-mutation.sh    # prouve le précédent par mutation
./scripts/verifier-chargement-administration.sh          # tout écran d'administration a un état de chargement, LS-188
./scripts/verifier-chargement-administration-mutation.sh # prouve le précédent par mutation
./scripts/verifier-etats-non-nominaux-mutation.sh        # les états non nominaux de l'administration, LS-113
./scripts/verifier-lien-evitement.sh                     # le lien d'évitement de l'administration et sa cible, LS-194
./scripts/verifier-lien-evitement-mutation.sh            # prouve le précédent par mutation
./scripts/verifier-ponctuation-chargement.sh             # les annonces de chargement, ponctuation et caractère, LS-195
./scripts/verifier-ponctuation-chargement-mutation.sh    # prouve le précédent par mutation
./scripts/verifier-bascule-mot-de-passe.sh               # tout champ de mot de passe client porte sa bascule, LS-179
./scripts/verifier-bascule-mot-de-passe-mutation.sh      # prouve le précédent par mutation
./scripts/verifier-environnement.sh                      # le .env local : présence, forme, doublons, concordance, LS-156
./scripts/verifier-environnement.sh --exemple-seul       # le seul sens jouable en CI, sans .env
./scripts/verifier-environnement-mutation.sh             # prouve le précédent par mutation, bac à sable
./scripts/verifier-hook-secret-argument.sh               # le hook refuse un secret passé en argument, LS-156
./scripts/verifier-hook-alertes.sh                # le démarrage de session montre les alertes ouvertes, LS-257
./scripts/verifier-hook-alertes-mutation.sh       # prouve le précédent par mutation
./scripts/verifier-cle-b2-durcie.sh                      # la clé Backblaze sans deleteFiles, sur le VPS, LS-223
#   quatre sens, dont une suppression réelle exigeant un refus ; cible inexistante
./scripts/engendrer-medias-test.mjs                      # les déclinaisons des photos de test, avant le build e2e, LS-187
./scripts/engendrer-images-marque.mjs                    # favicon, manifeste et image de partage, LS-147
#   `--verifier` échoue tant que les fichiers versionnés ne correspondent pas au source
./scripts/verifier-medias-test.sh                        # le générateur ci-dessus contre la fixture et ADR-007
./scripts/verifier-seo.sh                        # métadonnées de référencement de toute route, LS-137
./scripts/verifier-seo-mutation.sh               # prouve le précédent par mutation
./scripts/verifier-mentions-retractation.sh      # les trois emplacements de l'article L221-23, LS-136
./scripts/verifier-mentions-retractation-mutation.sh  # prouve le précédent par mutation
./scripts/verifier-palette-secours.sh            # couleurs en dur de l'écran de secours, LS-146
./scripts/verifier-palette-secours-mutation.sh   # prouve le précédent par mutation
./scripts/verifier-navigation-administration.sh  # chaque écran d'administration est navigable, LS-162
./scripts/verifier-navigation-administration-mutation.sh # prouve le précédent par mutation
./scripts/verifier-navigation-client.sh          # toute navigation interne passe par Link, LS-110
./scripts/verifier-navigation-client-mutation.sh # prouve le précédent par mutation
./scripts/verifier-en-tetes-securite.sh          # les cinq en-têtes de sécurité, ADR-038, LS-139
./scripts/verifier-en-tetes-securite-mutation.sh # prouve le précédent, chaque en-tête séparément
./scripts/verifier-en-tetes-production.sh        # les mesure SERVIS par le domaine réel, LS-139
./scripts/verifier-route-echec.sh                # garde la page qui lève à dessein, LS-191
./scripts/verifier-route-echec-mutation.sh       # prouve le précédent par mutation
./scripts/verifier-fixtures-e2e.sh               # adresses de test fixes, plafonds préservés, LS-168
./scripts/verifier-fixtures-e2e-mutation.sh      # prouve le précédent par mutation
./scripts/verifier-base-e2e.sh                   # isolement de la base de bout en bout, LS-189
./scripts/verifier-base-e2e-mutation.sh          # prouve le précédent par mutation
./scripts/verifier-reintegration-stock-mutation.sh # étape 9 du parcours 5, LS-173
./scripts/amorcer-compte-administration.sh       # promeut le compte de l'exploitante, LS-175
#   la procédure complète vit dans docs/PROCEDURE-AMORCAGE-ADMINISTRATION.md
./scripts/verifier-comptes-production.sh         # une administratrice, aucun compte de test, LS-175
./scripts/verifier-description-accessible.sh          # aucun aria-describedby annulé par un aria-label, C39, LS-161
./scripts/verifier-description-accessible-mutation.sh # prouve le précédent par mutation
./scripts/verifier-numerotation-etapes-mutation.sh    # prouve le sens « numéros d'étape en doublon » de verifier-config-claude.sh, LS-202
./scripts/verifier-revalidation-layout.sh             # une Server Action revalide le layout quand le layout lit la donnée, C37
./scripts/verifier-revalidation-layout-mutation.sh    # prouve verifier-revalidation-layout.sh par mutation
./scripts/verifier-prefetch-administration.sh         # les liens de l'administration désactivent le préchargement, C40, LS-166
./scripts/verifier-prefetch-administration-mutation.sh # prouve le précédent par mutation
./scripts/verifier-graphie-marque.sh                  # le nom commercial suit le logo et ne s'écrit qu'une fois, LS-193
./scripts/verifier-graphie-marque-mutation.sh         # prouve le précédent par mutation
./scripts/verifier-grep-q-pipefail.sh                 # aucun tube vers grep -q nouveau sous pipefail, SIGPIPE, LS-237
./scripts/verifier-grep-q-pipefail-mutation.sh        # prouve le précédent par mutation, quatre cas
./scripts/verifier-mutations-a-sec.sh                 # chaque expression mute modifie encore son fichier, LS-254
./scripts/verifier-mutations-a-sec-mutation.sh        # prouve le précédent par mutation, six cas
./scripts/verifier-prefixe-medias.sh                  # NEXT_PUBLIC_MEDIA_PREFIXE atteint le bundle construit, LS-197
./scripts/verifier-prefixe-medias-mutation.sh         # prouve verifier-prefixe-medias.sh par mutation
./scripts/verifier-registre-traitements.sh       # registre RGPD confronté au schéma
./scripts/verifier-registre-traitements-mutation.sh # prouve le précédent par mutation
./scripts/verifier-nginx.sh                      # résolution de l'adresse client, LS-91
./scripts/verifier-nginx-mutation.sh             # prouve le précédent par mutation
./scripts/verifier-taches-planifiees.sh          # toute tâche déclarée est déclenchée, LS-206
./scripts/verifier-taches-planifiees-mutation.sh # prouve le précédent par mutation
./scripts/verifier-ecart-production.sh           # la mesure d'écart production contre main, LS-220
./scripts/verifier-ecart-production-mutation.sh  # prouve le précédent par mutation
./scripts/verifier-deployer-recreer.sh           # l'action de recréation du déploiement, LS-289
./scripts/verifier-deployer-recreer-mutation.sh  # prouve le précédent par mutation, sur des copies
./scripts/verifier-plafonds-corps.sh             # service, Next et Nginx s'accordent sur la taille, LS-207
./scripts/verifier-plafonds-corps-mutation.sh    # prouve le précédent par mutation
./scripts/mesurer-site-deploye.sh                # Core Web Vitals du site déployé, LS-140
./scripts/verifier-statut-base-morte.sh          # le catalogue rend 500 base morte, ADR-039, LS-211
./scripts/verifier-statut-base-morte-mutation.sh # prouve le précédent par mutation
./scripts/verifier-sauvegarde-mutation.sh        # éprouve les 6 garde-fous de la sauvegarde, LS-139
sudo ./scripts/incident-disque-plein.sh          # incident 3, sur un disque dédié, LS-139
# Durcissement SSH : se lance SUR la machine, les valeurs effectives de sshd -T
ssh <hôte> 'sudo bash -s' < scripts/verifier-durcissement-ssh.sh   # 9 sens, LS-139
#
# Déploiement, LS-138 et LS-139. Ceux-là vivent sur la MACHINE, pas dans scripts/ :
#   deploiement/deployer.sh              bascule, retour arrière, état, purge des images
#   deploiement/sauvegarder-base.sh      sauvegarde quotidienne, base et fichiers
#   deploiement/verifier-seuil-disque.sh alerte de seuil, unité systemd horaire
#   deploiement/copier-sauvegarde-hors-site.sh  copie chiffrée vers Backblaze B2
# Le workflow « Déployer en production » les appelle par une clé SSH enfermée
# qui ne peut exécuter QUE le premier. Voir docs/deploiement/EXPLOITATION.md.
#
# `deployer.sh` est installé en /usr/local/sbin/lune-soleil-deployer et NE SE MET
# PAS À JOUR TOUT SEUL : le modifier dans le dépôt ne change rien à la machine.
./scripts/verifier-emetteur-facture.sh            # identité légale des factures, sans afficher les valeurs
./scripts/decider-suite-complete.sh              # portée de la chaîne selon le diff, LS-169
./scripts/verifier-decision-suite.sh             # prouve le précédent sur 24 cas, chiffre que le script imprime
./scripts/verifier-protection-branche.sh         # réglages de main dont la chaîne dépend, LS-176
./scripts/verifier-verdict-audit.sh              # panne du registre npm contre vulnérabilité, LS-176
./scripts/verifier-verdict-audit-mutation.sh     # prouve le précédent par mutation, échec différé, LS-256
./scripts/verifier-filtre-audit.sh              # exemption d'audit par avis, paquet et date limite, LS-258
./scripts/verifier-filtre-audit-mutation.sh     # prouve le précédent par mutation, LS-258
./scripts/verifier-jira.sh                       # epics et dépendances du backlog, local
./scripts/controle-fumee.sh                      # santé du service déployé, LS-73
./docs/prototypes/reservation-test.sh            # concurrence sur la pièce unique, exige Docker
./docs/prototypes/interblocage-panier.sh         # interblocage sur panier, exige Docker
./docs/prototypes/interblocage-liberation-confirmation.sh # ordre des verrous, LS-120
```

**`verifier-config-claude.sh` sort toujours en 0 sans `--strict`**, y compris
quand il relève des anomalies : il les écrit sur la sortie d'erreur et rend 0.
Ce n'est pas un défaut, c'est ce qui permet de le brancher sur le hook `Stop`
sans bloquer une session légitimement interrompue en cours de travail, un ADR
écrit dont la table n'est pas encore à jour par exemple.

Conséquence à connaître : **le lire sur sa sortie, jamais sur son code de retour
seul**, et employer `--strict` pour trancher. Le piège s'est refermé le
1er septembre 2026 sur un `script | tail; echo $?`, qui rend le code de `tail`
et non celui du script.

**Ce script de mutation restaure `README.md` en sortant.** Il refuse de tourner
si le fichier porte des modifications non commitées, garde-fou à respecter :
commiter avant de le lancer, sans quoi la restauration emporte le travail en
cours.

`verifier-image-docker.sh` **ouvre les couches** de l'image plutôt que de relire
le `Dockerfile`. La différence est mesurée : un `.env` copié puis supprimé par
une couche ultérieure disparaît du système de fichiers et reste extractible de
l'image. Comme le dépôt est public et l'image part sur GHCR, c'est le seul
contrôle qui protège réellement l'invariant 9. Prouvé par neuf mutations, le
compte se mesure :

```bash
grep -cE '^mutation(_code)? "' scripts/verifier-image-docker-mutation.sh
```

Le motif exige le guillemet ouvrant : sans lui il compte aussi les deux
définitions de fonctions et annonce onze cas pour neuf.

`verifier-nginx.sh` garde **quatre sens** du fichier de configuration.

Le premier est la directive qui décide de l'adresse IP écrite au journal des
connexions, `proxy_set_header X-Forwarded-For $remote_addr`. La forme répandue,
`$proxy_add_x_forwarded_for`, concatène l'en-tête envoyé par le client, et il
suffit alors d'un jeton non analysable pour que Better Auth renonce à toute
adresse. Un visiteur choisirait ainsi de ne pas être journalisé, ce qui est pire
que le défaut d'origine.

Le contrôle **retire les commentaires avant de chercher**, parce que le fichier
cite la forme interdite pour expliquer pourquoi elle l'est : un `grep` brut
serait soit toujours rouge, soit satisfait par la phrase qui nie l'usage.

**Le quatrième sens s'ancre sur un CHEMIN et non sur une directive**, depuis
LS-205. Il refusait auparavant tout `alias` ou `root`, ce qui rendait ADR-007
inapplicable : plus rien ne servait les médias, et le catalogue aurait affiché
des images cassées pendant que `/api/sante` rendait 200. Un seul chemin est
désormais autorisé, `medias/public/`, et le contrôle exige aussi qu'il soit
**présent** — sans quoi il serait satisfait par un fichier où personne ne sert
les médias. Ce n'est pas une exemption mais un resserrement : la racine du
volume, qui publierait la quarantaine et ses données EXIF, la racine des
documents comptables et tout chemin parent restent refusés.

**Douze mutations le prouvent**, dont les sept d'origine, ce qui montre que le
resserrement n'a rien ouvert.

`controle-fumee.sh` interroge `/api/sante` et décide si un déploiement est
retenu : code 0 si le service répond avec sa base, 1 sinon. Il vise la **route**
et non PostgreSQL directement, une base joignable depuis le poste de déploiement
ne prouvant pas que l'application la joint.

Le script de mutation réinjecte quinze fois un défaut réel et exige que
`verifier-regles.sh` échoue à chaque fois. Un contrôle vert ne prouve rien tant
qu'il n'a pas échoué sur le défaut qu'il prétend attraper.

Les neuf premiers cas portent sur ce qu'une règle **dit**, un prédicat d'index
partiel périmé. Quatre portent sur l'endroit où elle **se déclenche** : depuis
LS-88, `verifier-regles.sh` échoue si un dossier de `src/` n'est couvert par le
`paths` d'aucune règle. Les deux derniers portent la **frontière Prisma des
services**, LS-158 : un appel de modèle hors des dérogations de socle échoue,
et une dérogation périmée échoue aussi, dans l'autre sens. Le défaut était réel, éditer
`src/lib/auth.ts` ne chargeait aucune règle alors que ce fichier porte le secret
de signature et la limitation de débit. La liste des dossiers est relevée sur le
disque et non écrite à la main : créer un dossier sans règle fait rougir le
contrôle sans que personne ait à y penser.

`verifier-config-claude.sh` contrôle ce qui dérive sans casser aucun test : un ADR
absent de la table d'aiguillage de `docs/REFERENCES.md`, un `CLAUDE.md` au-delà de
200 lignes, un renvoi vers un fichier inexistant, une fiche mémoire hors index, un
journal manquant alors que du code a été commité, un motif `paths` de règle qui ne
matche aucun fichier suivi. Un hook `Stop` le lance en fin de
session, et `--strict` le rend bloquant dans la chaîne d'intégration.

Il vérifie aussi que **chaque hook déclaré pointe vers un script exécutable**.
Ce contrôle protège la protection elle-même : la documentation de Claude Code
pose qu'un hook dont la commande ne peut pas être lancée produit une erreur **non
bloquante**, et que l'action continue. Un `hook-block-secret-files.sh` renommé,
déplacé ou privé de son bit exécutable laisserait donc passer la lecture des
`.env` sans que rien ne s'arrête, et il n'existe aucun lint officiel de
`settings.json` pour le dire à notre place.

Les agents et les skills cités par `CLAUDE.md` sont vérifiés par leur **nom nu**,
`ls-critical-reviewer` ou `story`, qui est la forme d'invocation réelle : le
contrôle des renvois ne voit que les chemins écrits en entier, et renommer un
dossier laissait la consigne pointer dans le vide.

`verifier-jira.sh` surveille le backlog : un ticket sans epic parent, une
dépendance annoncée dans une description sans lien Jira. Il reste **hors
intégration continue**, la CI n'ayant pas ces identifiants et le dépôt étant
public. Sans les trois variables `JIRA_*` de `.env.example`, il le dit et sort en
0 plutôt que de prétendre avoir vérifié.

Il **recompte** aussi ce qui est annoncé à la main : hooks déclarés dans
`settings.json`, overrides de `package.json`, largeurs de `playwright.config.ts`,
cas des deux scripts de mutation, `README.md` de garde des dossiers de `src/`.
Ces contrôles existent parce que chacun de ces comptes a été faux au moins une
fois, sans que rien ne le voie.

**La table des nombres en lettres monte à soixante-dix-sept**, étendue
plusieurs fois depuis LS-80, et ce n'est pas du confort. Le chiffre écrit ici
a dit « quarante » jusqu'au 11 septembre 2026 : le mesurer plutôt que le lire,
`grep -oE 'echo [0-9]+' scripts/verifier-config-claude.sh`.
Elle s'arrêtait à « dix » : au-delà, la conversion rendait une chaîne vide et la
comparaison était **sautée**, donc verte sans avoir rien vérifié. Le seuil était
déjà franchi à l'époque, `verifier-tests-mutation.sh` portant alors vingt-et-un
cas ; il en porte **148** au 9 septembre 2026, compte relevé par
`grep -cE '^cas "' scripts/verifier-tests-mutation.sh` et jamais de mémoire. Un contrôle qui se tait
quand il ne comprend pas est pire qu'un contrôle absent : il occupe la place et
personne ne le remplace.

**Il ne corrige rien, et c'est délibéré.** Un chiffre faux est souvent le symptôme
d'une modification non documentée : le corriger en silence ferait perdre
l'information utile. Le 4 août 2026, « deux hooks » était faux parce qu'un
`PostToolUse` avait été ajouté sans être écrit nulle part.
