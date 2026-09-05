# 5 septembre 2026, session H : la frontière d'erreur de l'administration, LS-191

Quatrième story de la journée. Choisie parce qu'elle porte un impact fonctionnel
réel sur l'outil que l'exploitante utilisera tous les jours, et qu'elle ne dépend
ni du VPS, ni de Mondial Relay, ni du médiateur.

## Un écart signalé avant de coder

**Trois tickets se recouvraient.** LS-127, du 27 août, porte chargement ET erreur
sur « trois écrans », et sa description dit que `find` ne rend **rien**. Le code
en portait seize, plus un `error.tsx` et un `loading.tsx`. Ses deux sujets avaient
été repris par des tickets plus récents et plus précis : LS-191 pour l'erreur,
LS-188 pour le chargement.

Les cinq critères de LS-127 ont été confrontés un par un à ceux des deux tickets
repreneurs avant de proposer sa fermeture, y compris le piège du `loading.tsx` qui
annule un 404, porté par le critère 2 de LS-188. Aucun ne restait orphelin.
Arbitrage de Christophe : fermer LS-127.

## Le défaut fermé

`global-error.tsx` **remplace le layout racine**, contrainte de Next.js. Quinze
écrans sur seize n'ayant aucune frontière, une panne de base y faisait perdre la
barre de navigation, donc tout moyen d'aller ailleurs sans saisir une URL.

Un seul `error.tsx` sous `administration/` couvre les seize, la frontière
s'appliquant à tout le sous-arbre.

**`messages/error.tsx` est gardé**, arbitrage du critère 5. Une frontière plus
proche l'emporte, et la sienne dit ce que celle-ci ne peut pas dire : « aucun
message n'est perdu ». C'est la seule rubrique où l'exploitante peut craindre
d'avoir perdu une demande client. Une frontière redondante se retire, une
frontière plus précise se garde.

## L'identifiant affiché ici, refusé ailleurs

Le critère 4 exige le `digest` à l'écran, alors que `(boutique)/error.tsx` et
`global-error.tsx` le **cachent** au nom de l'invariant 9. L'écart est délibéré et
tient à deux choses : ces pages s'affichent devant n'importe qui, celle-ci devant
la seule exploitante ; et le `digest` est une **empreinte** du message, calculée
par hachage, précisément faite pour désigner une erreur sans la divulguer.

Vérifié via Context7 dans `create-error-handler.tsx` de Next.js 16.2.12.

## Ce que le critère 6 a demandé

« Un test provoque une erreur réelle et vérifie que la barre survit. » Aucun
chemin propre n'existait : aucun écran n'accepte d'entrée qui le ferait échouer,
et couper la base pendant la suite casserait tous les autres fichiers.

**Arbitrage de Christophe : une route de test, gardée hors production.**
`administration/echec-rendu` lève à dessein et rend **404** partout ailleurs,
mesuré sur une vraie construction de production.

L'ordre de ses deux instructions **est** la protection : `notFound()` avant
`throw`. Les inverser laisse un fichier qui se relit sans alerter, et donne à
quiconque atteint le site le moyen de provoquer une erreur serveur à volonté.
Trois contrôles la gardent, chacun voyant ce que les autres ne voient pas.

## Quatre défauts trouvés par les mutations, dans mon propre travail

**Le contrôle textuel lisait un commentaire.** Il cherchait `notFound()` dans le
fichier entier, et l'en-tête de la page **explique** que la garde s'exécute avant
le `throw` : le motif était trouvé ligne 24, dans la phrase qui le décrit, trente
lignes avant l'instruction réelle. Il restait vert sur l'ordre inversé.

**Un cas du script de mutation ne mutait rien.** `\Q...\E` rend `\n` littéral en
même temps qu'il échappe les métacaractères : la substitution ne retirait aucune
ligne, et le cas comptait comme non détecté sans qu'aucun défaut n'ait été
introduit.

**Le contrôle des tests ignorés a refusé un `test.skip`** que j'avais écrit pour
un cas non jouable dans la suite. Il avait raison : un test désactivé ne protège
rien. Remplacé par un test unitaire qui exerce la garde pour de vrai, six cas.

**Une mutation e2e a montré que la moitié de la correction n'était pas
protégée.** Retirer l'image du layout racine, en LS-147, ne faisait rougir aucun
test ; ici c'est le déplacement de `error.tsx` hors du dossier qui a servi de
mutation, et il rougit bien.

## Ce que la revue d'interface a trouvé

`ls-frontend-revue` a relevé cinq points, trois retenus.

**Un commentaire affirmait quelque chose de faux.** Il disait que `tabIndex`
portait la cible du lien d'évitement « comme sur les autres pages ». L'unique lien
d'évitement du dépôt vit dans `en-tete-boutique.tsx`, monté par le layout de la
**boutique** : l'administration n'en a aucun, et l'ancre ne servait de cible à
rien. L'ancre est retirée, et l'absence de lien d'évitement dans l'administration
est un défaut antérieur qui couvre seize écrans, à ticketer.

**Le `<code>` du digest était le seul monospace du dépôt**, sans aucun style,
donc à la police et à la taille par défaut du navigateur.

**Et sa paire de contraste était invisible au contrôle.** Écrite en hexadécimal
par recopie du fichier voisin, elle échappait à `verifier-contraste.sh`, qui ne
reconnaît que `var(--ls-...)`. Passée en jetons : **173 paires deviennent 174**,
et la mutation nomme 4,35:1 pour un seuil de 4,5:1.

**768 px n'était mesuré par aucun test**, alors que c'est le point de bascule du
gabarit où la colonne de contenu tombe à environ 518 px, sa configuration la plus
étroite. Le projet avait déjà le motif, un test qui redimensionne plutôt qu'un
quatrième projet Playwright. Limité à un seul projet, sinon il mesurerait trois
fois la même largeur, piège rencontré en LS-136.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `type-check`, `lint`, `format:check` | verts |
| `vitest --project unitaire` | **491 verts**, 29 fichiers, dont 6 neufs |
| `playwright erreur-administration` | **14 verts** |
| `verifier-route-echec-mutation.sh` | **4 sur 4** |
| Mutations de la garde, unitaires | 3 sur 3 |
| Mutation de la frontière elle-même | rouge sur sa cible |
| Mutation du test 768 px | rouge sur sa cible |
| `verifier-contraste.sh` | **174 paires**, vert |
| Les cinq autres contrôles concernés | verts |
| Construction Docker de production | route d'échec en **404** |

## État des tickets

**LS-191 est TERMINÉE**, huit critères sur huit, PR #247 fusionnée en rebase.

**LS-127 est FERMÉE**, reprise par LS-191 et LS-188, ses cinq critères confrontés
un par un aux tickets repreneurs avant fermeture.

**LS-194 créée**, Medium, sous LS-3 : l'administration n'a aucun lien d'évitement
sur ses seize écrans, WCAG 2.4.1 niveau A.

**120 terminés sur 184**, relevé dans Jira après la fusion.

## Trois passages de CI, dont deux de ma faute

**Le `noindex` manquait** sur la route de test : j'avais lancé le contrôle SEO
avant de créer le fichier, donc il ne pouvait rien voir.

**Le bloc CSS tombait dans la zone de palette de secours**, qui va de
`.pageRacine` jusqu'au bout du fichier. Je n'avais lancé qu'une partie des
contrôles avant de pousser. Après cette seconde erreur, j'ai joué les vingt et un
contrôles textuels d'un coup, ce qui aurait dû être le geste initial.

**Le troisième échec ne venait pas de ce travail** : un test de rendu PDF dépasse
les 5 secondes sur l'exécuteur GitHub, quand il tourne en 1,87 s en local. La
relance est passée.

## Ce qui reste, et qui n'est pas de cette story

**L'administration n'a aucun lien d'évitement**, sur ses seize écrans. Défaut
antérieur relevé par la revue, à ticketer.

**Le bouton « Réessayer » n'a pas d'état pendant le re-rendu**, ni `disabled` ni
`aria-busy`. Relevé par la revue, et il relève de LS-188 qui porte les états de
chargement de l'administration.

**LS-168 continue de gêner**, le plafond de débit ayant bloqué la préparation de
session à quatre reprises pendant cette session. Chaque relance demande une
attente d'environ 90 secondes.

## Prochaine étape

**LS-188**, l'état de chargement des quatorze écrans d'administration, qui ferme
le sujet des états non nominaux ouvert par cette story. Deux de ses écrans
appellent `notFound()` et relèvent de C32, qui interdit le `loading.tsx` : ils
demandent un `<Suspense>` interne.

Ensuite **LS-166**, la largeur 768 px, dont cette story vient de combler un
morceau sur un seul écran.
