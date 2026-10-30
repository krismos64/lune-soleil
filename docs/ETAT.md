# État du projet

Déplacé du `README.md` le 30 octobre 2026, LS-302. Chaque story livrée met à
jour cette page : le tableau des phases et les comptes, relevés dans Jira au
moment d'écrire. `docs/journal/` porte le détail de chaque session.

Projet en cours de développement. **La boutique tourne en production depuis le
9 septembre 2026** mais n'est pas ouverte commercialement : il manque les clés de
**paiement**, LS-153, et les contenus de l'exploitante.

**Le catalogue porte des pièces réelles et le site est ouvert à
l'indexation**, relevé le 4 octobre 2026 : `robots.txt` s'est rouvert **seul** à
la première pièce publiée, comme LS-234 le prévoit, l'état se déduisant du
catalogue sans interrupteur. Le compte de pièces se lit sur `/catalogue`, il ne
s'écrit pas ici. Ce que LS-153 appelle « première mise en ligne » reste
l'ouverture **commerciale**, distincte de la mise en ligne technique.

Les clés d'envoi d'email **sont posées** depuis le 10 septembre 2026, LS-214.

Les portes de sortie des phases 1 et 3 sont constatées, voir plus bas. **La
phase 0 est close le 20 octobre 2026**, avec sa dernière story, LS-19 la
médiation.
Le tableau ci-dessus porte le compte mesuré.

**Plusieurs phases avancent en parallèle**, et ce n'est pas un dérapage : le
travail suit les dépendances réelles plutôt que l'ordre des numéros.

| Phase | Epic | Stories ouvertes | Ce qui reste |
|---|---|---|---|
| 0, cadrage | LS-1 | 0 | **close** le 20 octobre 2026 : LS-19, la médiation, close le même jour, le CM2C désigné et publié en production |
| 1, fondations | LS-2 | 0 | **close**, porte de sortie constatée le 13 août 2026 |
| 2, catalogue et médias | LS-3 | 0 | **LS-145 est close** le 8 octobre 2026 : F-ADM-07 mesurée sur le téléphone de l'exploitante, 2 min 30 pour la cible de trois minutes. **LS-123 est close** le 8 octobre 2026, ses huit critères remplis. Demandes du 4 octobre 2026 : **LS-265 est close**, un même prix appliqué à plusieurs articles après un récapitulatif déclinaison par déclinaison ; **LS-266 est close**, un article archivé se retire de l'espace de l'exploitante sans quitter la base, contrainte C45, récupération par le développeur dans `EXPLOITATION.md` ; **LS-279**, le 7 octobre 2026, porte ce retrait dans la liste des archivés en action groupée, avec une confirmation qui nomme chaque article, et réaligne la barre de sélection |
| 3, panier et paiement | LS-4 | 0 | **close** le 11 septembre 2026. LS-86 portait le dernier critère, le récapitulatif sur les trois modes de livraison |
| 4, factures et expédition | LS-5 | 1 | **Le 29 octobre 2026, première commande réelle expédiée** : **LS-218 close** sur la première étiquette réelle, 4,10 € TTC débités par Sendcloud en Locker, égal au tarif client, et avec elle **LS-27** ; **LS-296 close**, la création passe par l'API v3 de Sendcloud, la v2 rendant 403 à ce compte, et un refus net se distingue d'un état inconnu. **LS-297 close** le même soir : la facture porte « Lune-soleil » en titre et le nom légal en petit avec « EI », figés dans l'instantané en version 2, article R526-27, arbitrage de Christophe ; F-2026-0001 reste telle qu'émise. **LS-33 est close sans objet** le 8 octobre 2026, Sendcloud ayant remplacé le compte Mondial Relay direct (ADR-035, ADR-042, LS-131), **LS-35** porte l'e-reporting au 1er septembre 2027, **LS-222 est close** le 13 septembre 2026, les emails HTML observés sur Yahoo, Gmail et OVH, les trois en boîte de réception. **LS-98 est close** le 11 septembre 2026, les paramètres commerciaux vivent en base, ADR-043 |
| 4bis, espace client et avis | LS-36 | 0 | **close**, et rouverte deux fois depuis : LS-221 a livré « Mes avis » puis **LS-225 la modification d'un avis par son auteur**, le 12 septembre 2026. Une phase close ne l'est que des tickets connus le jour où on la ferme |
| 5, rétractation et conformité | LS-6 | 0 | **close**, ses huit stories terminées le 10 septembre 2026 |
| 6, exploitation et ouverture | LS-7 | 6 | **Le 29 octobre 2026** : **LS-294 close**, Better Auth 1.7.14 contre quatre avis du 27 octobre, compteurs de limitation du projet sortis de `rate_limit` (migration `compteur_limitation`), nocturne vert, issue #593 fermée. **LS-295** (réauthentification par passkey et session volée) attend l'ouverture, arbitrage de Christophe. La recette de l'exploitante ouvre **LS-298, LS-299 et LS-300** : message « email vérifié », adresse du carnet dans le tunnel, vignette et lien des pièces au récapitulatif. **LS-299 close** le même soir : le tunnel propose le carnet du compte connecté, sans qu'aucun identifiant d'adresse ne remonte au serveur. **LS-300 close** le 30 octobre 2026 : vignette et lien vers la fiche de chaque pièce au récapitulatif, même onglet, aucun lien vers une fiche absente. **LS-298 close** le même jour : le lien de vérification annonce « Adresse email vérifiée », l'échec prime sur la réussite, rien ne revient au rechargement ; LS-301 ouverte pour le cas d'un appareil connecté à un autre compte. **Le 24 octobre 2026** : **LS-292 et LS-258 closes**, nocturne vert sans exemption (run 40079879000, 194 mutations sur 194). **LS-292** monte Next en 16.4.3 contre deux exécutions de code à distance (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr), avec zod, nodemailer et l'outillage, déployée `d0b5965` ; le report de LS-273 à `postinstall` est retiré. **Stripe est branché en mode réel** en production pour l'achat de recette de Christophe, LS-153 commentée, et **LS-293** remplacera la clé standard par une clé restreinte. **Le 8 octobre 2026** : LS-278 (archivage confirmé, confirmation renforcée pour vider la boutique, trace et alerte), LS-275 (polices du PDF en TTF), LS-140 (mesure sur le catalogue réel), LS-107 (sauvegarde lue sans exécuter l'environnement, rotation par jours, restauration complète exercée) et LS-228 (blocs d'état) closes. Restent LS-142 et LS-153, qui attendent l'exploitante et l'ouverture, LS-258 jusqu'au 17 octobre. **LS-273 est close** le même jour : un défaut de l'optimiseur d'images de Next 16.3.8 figeait une variante quand un visiteur partait, corrigé par un report de la 16.4.0 lancé à `postinstall`, nocturne vert. **Chantier d'animation, ADR-045** : LS-259 close, l'ADR accepté puis corrigé sur WCAG 2.2.2 ; **LS-260 livre l'accueil animé**, complété le 8 octobre 2026 par des portes de catégorie portant la vraie photo et un bandeau de réassurance illustré, image `f5331d9`, et **LS-261 le socle commun**, menu mobile plein écran sur `<details>` utilisable sans script et pied de nuit, puis **LS-262 Notre univers et le catalogue** et **LS-263 la fiche produit et les micro-interactions**, le 4 octobre 2026 : la refonte animée est complète. **LS-268 est close** : connexion en ciel de nuit, inscription en aube, contact devenu « Écrire à l'atelier », décors animés et formulaires immobiles, amendement d'ADR-045. **LS-269 est close** le 5 octobre 2026 : le sous-total des articles affiché au tunnel est confronté au sous-total figé, et les gardes de montant passent après la réservation pour que le refus de stock garde la priorité ; déployée le 6 octobre 2026 avec LS-270, image `4ae86ac`. **LS-270**, relevée par sa revue, rend non commandable un produit archivé ou en brouillon resté dans un panier : la réservation et le disponible du panier exigent un produit `ACTIF`, le 6 octobre 2026. **LS-271 et LS-272 sont closes** le même jour : quatre mutations visant un code déplacé par la refonte, et `source-map-js` 1.2.2 contre GHSA-68fv-2mgg-jv7q. **LS-273 est close** le 8 octobre 2026 : les délais dépassés sur `/administration/connexion` venaient de l'optimiseur d'images de Next, lu dans les traces du rapport Playwright de CI. **LS-274** monte `sharp` en 0.35.5 contre GHSA-wq5f-xc86-pv6w (`librsvg`), dépendance de production, **déployée le 6 octobre au soir** avec LS-269 et LS-270, image `93ae6b0` ; **close le 7 octobre 2026** sur le premier nocturne entièrement vert, issue #525 fermée. **LS-275 est close** le 8 octobre 2026 : le test de rendu PDF frôlait son délai à cause des polices WOFF, passées en TTF. **LS-276 est close** le 7 octobre 2026 : les chargeurs SVG et PDF de libvips sont bloqués pour tout le processus, `next/image` compris, constaté dans les journaux de production ; un SVG décalé de plus de 1024 octets était décodé par librsvg avant. **LS-277** : deux thèmes de Noël, « Noël 1 » sobre et « Noël 2 » franc, validés en maquette le 6 octobre pour l'accueil et les créations (`docs/prototypes/themes-noel/`), ADR-045 et ADR-046 amendés le même soir, puis **codés et déployés** : `NOEL_1` et `NOEL_2` remplacent `NOEL`, mouvement continu sous bouton de pause, aucun thème activé, choix dans Paramètres. **LS-278 est close** le 8 octobre 2026 : les 51 produits archivés d'un seul geste le 4 octobre, après un premier cas le 27 septembre, ont mené à la confirmation renforcée, à la trace d'auteur et à l'alerte de catalogue vide. **LS-280** : la page Livraison et aide refondue en motion design le 7 octobre 2026, maquette validée par Christophe (`docs/prototypes/aide-animee/`), critiquée par Codex qui en a aussi peint les deux aquarelles, ADR-045 amendé ; close et déployée le même jour, LCP inchangé en production. **LS-282 et LS-283** refondent les informations légales et le catalogue dans le même style, sans maquette sur l'autorisation de Christophe : médaillon d'aube partagé, sommaire légal collant, aucun mot juridique modifié, vérifié sur le texte servi en production ; closes et déployées le 7 octobre 2026, ADR-045 amendé. **LS-281**, relevée par sa revue, **close et déployée le même jour** : `data-borne` suspend désormais les animations de `::before` et `::after`, dont le reflet du sceau de l'accueil qui jouait hors de l'écran. **LS-285**, close le même jour : la première photographie du catalogue, élément du LCP, n'est plus chargée en différé, environ 880 ms gagnés en mobile ralenti. **Tout est déployé le 4 octobre 2026 au soir**, `1db60fb`, migrations de LS-266 et LS-267 appliquées, journal `2026-10-04-l`. **LS-267 est close** : thèmes saisonniers activables par l'exploitante, ADR-046, thème de Noël sur l'accueil et le catalogue, aperçu réservé à sa session. **LS-258 est close le 24 octobre 2026** : l'avis GHSA-vfj7-8cjw-p6xm sur `braces` est retiré par GitHub le 23 octobre 2026, et `scripts/audit-exemptions.json` est vide depuis le 24. **Le 23 au soir** : LS-236 (bandeau de réassurance), LS-237 (cause mesurée du faux négatif) et **LS-249** closes, cette dernière corrigeant `/aide` et les CGV qui annonçaient la livraison offerte « quel que soit le mode » ; LS-250, LS-251 et LS-252 ouvertes en chemin, toutes closes depuis. **La recette de l'exploitante du 23 septembre 2026** a produit LS-238 à LS-248, tous clos le jour même, **LS-239** sans correction faute de reproduction : panier borné au stock, ajout depuis la carte, catalogue paginé, sélection multiple de produits et de messages, messages **archivés et jamais effacés** (migration additive `message.archive_a`), photo agrandie, menu d'administration en cinq groupes. **Rien ne se supprime en base de production**, arbitrage de Christophe, LS-246. **LS-153 et LS-142 attendent l'exploitante**. LS-140 et LS-107 sont closes le 8 octobre 2026, mesurées sur le catalogue réel. **LS-150 est close** le 8 octobre 2026, arbitrage de Christophe : rien de plus que LS-137. **LS-228** a livré son gabarit de titre le 13 septembre 2026, sept titres sur quatorze rendaient en police système ; son second volet, les blocs d'état des deux vues d'ensemble, est livré le 8 octobre 2026, et la story est close. **LS-229** a livré le pendant public le 14 septembre 2026 : aucun titre des pages publiques ni des écrans de connexion n'employait le jeton, C42 ne couvrant que les écrans privés. La règle vit désormais dans `globals.css`, hors d'atteinte des sorties anticipées de layout, **C43** l'énonce, et les trois portes d'entrée reçoivent le gabarit à deux panneaux du prototype. **LS-230 est close** le 14 septembre 2026 : les 44 preuves par mutation tournent désormais, 37 par PR et 7 au nocturne. Six étaient cassées et cachaient cinq trous réels, et cinq mutations traînaient dans le dépôt, dont la garde d'accès à l'administration. **LS-231 est close sans correction** le 16 septembre 2026 : un échec sur six exécutions sur `tableau-bord`, jamais observé en CI, défaut connu et accepté. **LS-232 est close** le 17 septembre 2026 : le nocturne du 17 a rendu l'étape de bout en bout verte, 2155 tests passés contre douze échecs le 15, sans qu'aucun test disparaisse ni soit ignoré. **LS-233 a reçu un second correctif** le 17 septembre, et elle est close le 25, son premier ayant régressé : le filtre ancré sur `× ` et `✘ ` ne retenait plus rien sous les reporters de CI, Playwright passant à `github` et Vitest encodant la virgule en `%2C`. Le filtre lit désormais les quatre formes mesurées dans les deux modes. Le même diagnostic a montré que le step groupant six preuves sous `bash -e` en masquait quatre depuis le 14 septembre. **LS-234 est close** le 16 septembre, `robots.txt` déduit son état du catalogue. **LS-223, LS-226 et LS-227 sont closes** le 13 septembre 2026 : la clé Backblaze durcie, l'instabilité des tests et le cul-de-sac de la réauthentification. **LS-235 est close** le 24 septembre 2026. Le 22 : le nocturne annulé trois nuits sans alerte, borne locale posée et prouvée, plafond porté à 75 min, `npm audit` remonté hors d'atteinte, et l'alerte déplacée dans `veilleur-nocturne.yml`, **une étape interne ne pouvant pas signaler le dépassement du plafond de son propre job**. Le nocturne du 21 a été le premier à tourner avec la borne : **elle a coupé, et c'est sa réussite**, l'étape s'est nommée. Ce qu'elle a montré a déplacé le diagnostic, **le coût était la cause et non le plafond** : chacun des 147 cas d'intégration relançait la suite entière, 419 s pour 947 tests, soit 17 h 06. Le script cible désormais le fichier qui porte la garantie, 2377 s mesurées, et **cinq défauts préexistants** sont tombés au premier passage allant au-delà du cas 1. Le septième critère, le nocturne au vert, est rempli le 24. **Le 24 septembre 2026, avec LS-252**, les nuits des 22 et 23 ont nommé la cause restante : les dix cas de bout en bout rejouaient chacun toute la suite Playwright, 11 min pour le premier sur le runner. Ciblés, puis six corrections de cas périmés ou aveugles, dont un **oracle** sans test sur le remboursement de rétractation : première exécution complète, **180 mutations en 3507 s** en local. La borne de l'étape passe à 150 min et le plafond du job à 180, arbitrage de Christophe, à resserrer sur la durée par cas que le script imprime désormais. **LS-253 est close** le même jour, le catalogue d'administration débordait de 35 px à 320 px sous la police du runner Linux. **LS-251 est livrée** le 24 septembre : la réassurance sur la fiche (bloc 7), le panier et le tunnel, un sous-ensemble du même composant par écran. **LS-252 et LS-235 sont closes** le même soir : le nocturne est vert, `180 mutations, 180 detectees`, et l'étape des preuves passe de 2 h 05 à 1 h 22 depuis que chaque cas ne lance que son test attendu, bornes réglées sur cette mesure à 165 et 200 min. **LS-254** ajoute le contrôle à sec des expressions de mutation à chaque PR. **LS-250 est close** le 25 septembre : plus aucun tube vers `grep -q` sous `pipefail`, liste des restes supprimée. **LS-237** en est sorti, un faux négatif intermittent du cas 12 |
| 7, V1 cible | LS-8 | 0 | **close** le 11 septembre 2026. LS-149 portait le dernier critère : ADR-044 **écarte l'assistant IA** du périmètre plutôt que de le reporter |
| Contenus | LS-22 | 2 | **Le 8 octobre 2026** : **LS-44 close**, tous les matériaux viennent d'un distributeur établi dans l'Union, aucune mention d'origine des matières publiée ; **LS-26 close le 19 octobre 2026**, FAQ validée par l'exploitante, délai d'expédition, emballage et absence à domicile compris ; **LS-23 close** par arbitrage, une photographie suffit, le nombre se choisit par article ; **LS-24 close**, description et matières exigées et présentes sur les 50 pièces, dimensions et entretien facultatifs ; LS-25, LS-29 et LS-170 closes, critères remplis ; **LS-30 close**, la page Facebook devient le seul canal social, lien du pied de page et `sameAs`, sans QR code à la demande de l'exploitante. **LS-284 est close** le 7 octobre 2026 : pas de création sur mesure, arbitrage de Christophe, la mention sort du contact. **LS-264 est close** le 4 octobre 2026 : « Notre univers », un « nous » de marque, devient **« L'atelier »** à l'adresse `/atelier`, l'ancienne redirigeant en 301, arbitrage de Christophe. **attend l'exploitante**, rien n'est faisable sans elle. **LS-32 est close** le 11 septembre 2026, la neutralité de genre étant désormais gardée par un contrôle. **LS-25 a livré ses textes** le 20 septembre 2026, récoltés auprès d'elle et validés par elle : `/notre-univers`, devenue `/atelier`, est déployée, et elle a révélé que l'exploitante **exerce seule** quand tout le cadrage parlait de deux créatrices. Le visuel d'accueil, qui montrait des pièces n'ayant jamais existé, est **remplacé le 23 septembre 2026** par une bannière fournie par Christophe |

**282 tickets terminés sur 291 hors epics**, les deux termes relevés dans Jira
le **29 octobre 2026** au soir, et jamais dérivés l'un de l'autre :
9 tickets non terminés relevés séparément, 2 En cours et 7 À faire, et
291 − 9 retombe bien sur 282. Journaux `2026-10-08-a` à `-f`, `2026-10-19-a` à `-d`, `2026-10-20-a`, `2026-10-24-a`, `2026-10-29-a` à `-d` et `2026-10-30-a` à `-c`. **La recette de l'exploitante du 23 septembre** a ouvert
LS-238 à LS-248, tous clos le jour même.

**Le chantier du nocturne est clos le 24 septembre 2026** : LS-233, LS-235,
LS-250, LS-252, LS-253 et LS-254, avec LS-251 livrée et déployée. Le nocturne est
vert deux fois de suite, `180 mutations, 180 detectees`, étape des preuves en
1 h 22. Journaux `2026-09-24-a` à `-e` et `2026-09-25-a`.

**Aucun ticket En cours ne dépend plus seulement du code**, constat refait le
29 octobre 2026. Les deux En cours attendent une rédaction validée ou
Christophe :

* **LS-28** attend la rédaction des CGV, la politique de confidentialité
  complète et la validation par un professionnel. Le médiateur n'est plus un
  bloqueur depuis le 20 octobre

* **LS-290** attend la vérification de l'indexation de `/informations-legales`
  dans la Search Console, par Christophe. Le crédit est **déployé** depuis le
  19 octobre, lien sans `rel`

**LS-237 est close** le 23 septembre 2026, cause mesurée : un
`printf | grep -q` sous `pipefail`, que SIGPIPE faisait échouer sur un motif
pourtant trouvé, 17 fois sur 200. La même forme produisait le faux positif
transitoire de `verifier-config-claude.sh`. `verifier-grep-q-pipefail.sh`
l'interdit désormais ; **LS-250** a converti les 41 occurrences restantes le
25 septembre 2026, et **LS-252** a fermé l'arrêt de la preuve complète.

**LS-19 est close le 20 octobre 2026** : le CM2C est le médiateur, convention
signée par l'exploitante, coordonnées écrites dans `MEDIATEUR`. LS-28 attend la
politique de confidentialité complète et la validation d'un professionnel. **LS-123, LS-170,
LS-107 et LS-140 sont closes** le 8 octobre 2026, les deux dernières mesurées sur
le catalogue réel de 50 pièces photographiées. **LS-29 est close** le 8 octobre 2026,
arbitrage de Christophe, ses quatre critères remplis.

**LS-231 a été close sans correction** le 16 septembre, arbitrage de Christophe :
`tableau-bord.sequential.test.ts` échoue une fois sur six dans la suite
d'intégration complète, jamais seul, jamais observé en CI. Le défaut est connu et
accepté, le test n'est ni supprimé ni ignoré.

**Cinq phases sur huit sont désormais closes**, les phases 1, 3, 4bis, 5 et 7.

**La date du relevé se met à jour avec le compte**, et elle avait été oubliée
une fois : le chiffre disait 175 sous une date du 10 septembre, ce qui aurait
fait relire un compte pour un autre. Motif « un compte recopié n'est pas une
mesure », qui vaut pour la date autant que pour le nombre.

**Quatre des neuf tickets ouverts attendaient l'exploitante** au 8 octobre
2026 au soir : les trois de l'epic LS-22, FAQ (relecture seule), tarifs et
contenus juridiques, et LS-19, la médiation. LS-26 est close le 19 octobre et
LS-19 le 20, adhésion au CM2C faite en séance. Comptes relevés dans Jira ce jour,
`parent = LS-22 AND statusCategory != Done` rendant trois après la clôture de
LS-23, LS-24 et LS-44 en séance avec l'exploitante. Le 25 septembre il en
rendait dix.

**LS-107 et LS-140 ne sont plus bloquées par les photographies** : closes le
8 octobre 2026, la première par une restauration complète exercée, la seconde
par une mesure sur le catalogue réel de 50 pièces.
**LS-123 ne l'est plus** : `/notre-univers`, devenue `/atelier` le
4 octobre 2026 (LS-264), est livrée et déployée le 20 septembre 2026, son critère 1 se ferme et les sept liens morts avec. Un **premier article réel** est en ligne depuis
le 20 septembre 2026, « boucles d'oreilles Étoile filante » : il ne les débloque
pas, toutes trois demandant un catalogue fourni, mais il rend **LS-145
mesurable**, son chronométrage exigeant un téléversement réel avec le traitement
des déclinaisons.

**Le compte précédent, « 173 sur 217 », appariait deux populations
différentes** : son dénominateur comptait les epics, son numérateur non. Les
deux requêtes portent désormais le même filtre `issuetype != Epic`, un rapport
dont les deux termes ne comptent pas la même population ne voulant rien dire.

LS-212 à LS-215 sont nées en livrant et sont closes, LS-217 est née d'un défaut
trouvé en concevant LS-131 et a été **reprise dans cette story** plutôt que
différée, arbitrage de Christophe.

**L'epic LS-7 avance : LS-139, LS-210 et LS-211 sont closes.** LS-139 a fermé
trois trous réels que la lecture ne voyait pas : deux en-têtes de sécurité servis
sur cinq, SSH ouvert au mot de passe derrière un durcissement inopérant depuis
huit mois, et un disque qui croissait par les images de déploiement.

**LS-211 est déployée et vérifiée en production**, ADR-039 : le catalogue rend
500 quand la base est morte, pour tous les agents, là où il rendait 200 avec un
chargement figé. Une supervision qui lit le code HTTP voit désormais la panne.

**LS-140 est close le 8 octobre 2026**, mesurée sur le catalogue réel :
`scripts/mesurer-site-deploye.sh` porte neuf pages, dont une fiche produit tirée
du sitemap à chaque exécution. Toutes sous les seuils de web.dev, accessibilité
à 100 et CLS à zéro ; le catalogue, page la plus lente, est à 1978 ms de LCP
pour un seuil de 2500. Une boutique sans fiche au sitemap fait échouer la
mesure, LS-278.

**Le nocturne est redevenu vert le 9 septembre 2026**, LS-210 close : les trois
vulnérabilités `vitest` sont corrigées par la montée en **4.1.11**, une version
corrective que `^4.1.10` autorisait déjà.

**Le blocage venait de npm lui-même, pas du projet.** Cinq voies avaient échoué
sur `Cannot read properties of null (reading 'edgesOut')`. L'erreur se reproduit
sur un `package.json` de six lignes ne contenant que `vitest` : c'est un bug de
**npm 10.9.8**, celui qu'embarque Node 22. `npx npm@11` passe.

Le correctif a donc été posé avec npm 11, et le dépôt reste sur npm 10 : le
`lockfileVersion` est inchangé et `npm ci` en 10.9.8 l'installe sans broncher,
ce qui a été vérifié avant de conclure. Détail dans le journal du 9 septembre,
session l.

**La phase 1 est close dans Jira depuis le 9 septembre**, ses 26 stories étant
terminées : l'epic était resté En cours alors que sa porte de sortie datait du
13 août, sa dernière story ouverte étant LS-96.

Un compte écrit à la main se périme sans bruit, et **le dénominateur bouge
autant que le numérateur** : il est passé de 180 à 217 entre le 5 et le
13 septembre 2026, chaque story livrée en créant parfois d'autres. Un
pourcentage qui progresse peut recouvrir un périmètre qui s'élargit.

**Les rapports de recette**, `docs/recettes/`, sont vides : le dossier attend la
recette de LS-142.

## La boutique tourne en production depuis le 9 septembre 2026

`https://lune-soleil.fr` répond 200 sur le VPS partagé avec l'autre service hébergé,
ADR-036. Trois conteneurs, schéma complet, sauvegarde quotidienne par unité
`systemd` avec restauration prouvée, ADR-037. Les tâches planifiées tournent,
toutes celles que déclare `TACHES`, et les médias sont servis depuis le volume.

**Les sauvegardes sortent du VPS depuis le 10 septembre 2026**, LS-107 :
chiffrées en AES256 puis copiées vers **Backblaze B2**, un fournisseur différent
d'OVH, à 03h15 UTC. Restauration prouvée de bout en bout, téléchargement,
déchiffrement et 225 objets lus par `pg_restore`. La clé de chiffrement vit hors
du serveur, sans quoi le dispositif ne couvrirait que la panne disque.

**Le déploiement est outillé depuis LS-138, et son déclenchement reste
MANUEL** : le workflow « Déployer en production » se lance à la demande, avec le
SHA complet du commit à déployer, et aboutit sur le VPS en dix-huit secondes. Le
retour arrière a été joué réellement.

**Un commit sur `main` ne déploie rien**, il publie une image. Le déclenchement
manuel est une décision, expliquée dans `deployer.yml` : les migrations tournent
depuis le dépôt, le garde-fou destructif exige une lecture humaine, et chaque
déploiement recrée des conteneurs chez un produit payant qui partage la machine. La clé SSH ne peut exécuter qu'un script,
sur un utilisateur hors du groupe `docker`.

**Il reste LS-153**, la première mise en ligne : poser les clés **Stripe** et
fixer l'ordre des opérations. Les clés SMTP sont posées depuis le 10 septembre
2026, LS-214.

Elle **attend l'exploitante**, LS-142 exigeant sa présence physique pour la
recette. **LS-175 est close** : le compte d'administration existe en production
avec sa passkey, la séance a eu lieu. Plus rien ne dépend du code seul.

`docs/deploiement/EXPLOITATION.md` porte l'exploitation courante,
`PREPARATION-SERVEUR.md` la mise en place initiale.

## Où lire le détail

**Ce tableau dit l'état, pas l'histoire.** `docs/journal/` porte une page par
session, avec ce qui a été fait, ce qui a dérapé et pourquoi.
C'est là que se lit le détail d'une story livrée, et la page la plus récente
donne l'état du projet plus vite que Jira.

## Porte de sortie de la phase 1, constatée le 13 août 2026

Les quatre termes exigés par LS-2, vérifiés **sur un clone neuf** dans un
répertoire vierge et non sur la machine de développement, LS-75.

**Les nombres de ce tableau sont ceux CONSTATÉS le 13 août 2026**, jour de la
porte de sortie, et ils ne se mettent pas à jour : ils attestent d'une mesure
faite ce jour-là. Le dépôt porte 39 tables au 11 septembre 2026 au soir,
`parametre_boutique` étant arrivée avec LS-98. Pour l'état courant, lancer
`npm run db:verifier`, qui compte plutôt qu'il n'affirme.

| Terme | Preuve |
|---|---|
| Clone neuf lançable avec procédure écrite | `npm ci` puis `db:preparer` : 34 tables, 29 contraintes `CHECK` sur 29 attendues, 8 index partiels, application servie, `/api/sante` opérationnelle |
| Tests au vert en intégration continue | 262 tests Vitest et 33 Playwright sur le clone, chaîne verte sur `main` |
| Administration protégée par second facteur | passkey d'ADR-021, réauthentification d'ADR-027 sur les actions sensibles, `/administration` répond 307 vers la connexion |
| Application déployable | image construite depuis le clone, 7 contrôles de sécurité au vert, aucun `.env` dans les 10 couches ouvertes |

**Déployable ne veut pas dire déployée**, et c'était le constat du 13 août 2026 :
la phase 1 prouvait que l'image se construit et que le service démarre, le VPS et
la mise en production appartenant à la phase 6.

**Dépassé depuis le 9 septembre 2026** : la boutique tourne, voir la section État
plus haut. La distinction reste juste dans son principe, une image qui se
construit ne disant rien de ce qui l'exécute.

Trois écarts de procédure ont été trouvés par cet exercice et corrigés dans ce
document : l'activation du hook de secrets, absente de la procédure de démarrage,
les variables réellement obligatoires du `.env`, et le comptage estimé du
garde-fou de `db:verifier`. Une procédure ne se vérifie que sur une machine qui
n'a rien.

## Le jalon qui compte

Le premier jalon technique majeur n'est pas le nombre de pages livrées. C'est la
réussite d'un achat de bout en bout sur une variante en stock à un exemplaire,
avec réservation atomique, événement de paiement idempotent, commande cohérente,
mouvement de stock unique et document de facturation exact.

Le test de concurrence correspondant est écrit avant l'implémentation du
paiement et conservé en intégration continue.

**Franchi hors des tests le 31 août 2026**, au navigateur, avec les clés Stripe
réelles du compte de l'exploitante en mode test, sur une variante à un
exemplaire : réservation atomique portant un `commandeId`, événement
`checkout.session.completed` accepté en `200` après validation de signature,
commande `CONFIRMEE` à 2349 centimes, **un seul** mouvement `VENTE_WEB` de -1,
facture `F-2026-0001` dont l'instantané légal porte l'identité de l'émetteur et
la mention de l'article 293 B. Aucune `AlerteCritique`.

**Le document PDF suit depuis LS-129**, livrée le 1er septembre 2026 : une
facture émise produit son fichier après le commit du webhook, et un échec de
rendu laisse `chemin_pdf` nul en levant une alerte plutôt qu'en annulant le
paiement. **Le téléchargement par le client est livré**, LS-57 et LS-132 closes :
`compte/commandes/[id]/facture/route.ts` pour un client connecté, et
`facture/[jeton]/route.ts` par lien signé expirant pour un achat sans compte.
