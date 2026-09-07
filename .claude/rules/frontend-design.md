---
paths:
  - "src/app/**/*.{ts,tsx}"
  - "src/components/**/*.{ts,tsx}"
  - "src/**/*.css"
---

# Design et accessibilité

Direction : artisanal, féminin, élégant, chaleureux, naturel, légèrement premium.
La photographie et la matière portent l'identité, pas les ornements.

**Référence visuelle : `docs/architecture/PROTOTYPE.md`.** Il capture l'intention
et l'enchaînement des écrans d'un prototype gelé le 5 août 2026, dont les six
états non nominaux et la table parcours vers écran. Il ne prime sur rien : en cas
de divergence avec un ADR ou une règle d'ici, c'est le prototype qui a tort, et
ce document liste déjà les cinq écarts connus.

## Palette, fixée par ADR-022

Utiliser les jetons de `src/styles/tokens.css`, jamais une valeur hexadécimale en
dur.

| Jeton | Valeur | Usage |
|---|---|---|
| `--ls-background` | `#FBF7F0` | fond de page |
| `--ls-surface` | `#FFFFFF` | cartes, formulaires |
| `--ls-surface-sand` | `#F2EADF` | sections alternées, footer |
| `--ls-text` | `#3B2F2A` | texte courant |
| `--ls-text-muted` | `#7A6A5D` | légendes |
| `--ls-primary` | `#5F4519` | actions, bandeau, focus, prix |
| `--ls-primary-hover` | `#4A2A0B` | survol |
| `--ls-accent-gold` | `#C4A052` | décor seulement |
| `--ls-accent-gold-deep` | `#8A6A22` | liens, texte accentué |
| `--ls-accent-terracotta` | `#B4643E` | décor, texte large ou gras |
| `--ls-accent-terracotta-deep` | `#9C4F2B` | fond de badge en petit texte |

### Deux règles de contraste, mesurées

1. `--ls-accent-gold` (`#C4A052`) donne **2,31:1** sur crème. **Interdit pour
   tout texte**, y compris large. Filets, icônes décoratives, éclats uniquement.
   Tout texte doré utilise `--ls-accent-gold-deep` (4,72:1).
2. `--ls-accent-terracotta` (`#B4643E`) donne **4,07:1** sur crème, et **4,35:1**
   sur blanc. Sous le seuil AA de 4,5:1 dans les deux cas. Conforme AA en texte
   large ou gras seulement.
3. `--ls-accent-terracotta-deep` (`#9C4F2B`) donne **5,89:1** avec du texte
   blanc. C'est le jeton de tout **badge en petit texte**, « Dernière pièce » en
   tête.

   **La version précédente de cette règle prescrivait ici « fond terracotta avec
   texte blanc », et cette prescription était fausse** : elle constatait 4,35:1
   deux lignes plus haut sans en tirer la conséquence. Le défaut a été mesuré par
   `axe-core` en LS-104, sur un badge écrit en suivant la règle à la lettre. Une
   règle qui énonce un chiffre et prescrit son contraire se franchit de bonne
   foi.

**« Texte large » commence à 18,66 px en gras**, ou 24 px en graisse normale.
Un libellé d'accroche en 11 ou 12 px gras n'est **pas** du texte large : c'est
l'erreur la plus facile à commettre avec ce jeton, et le prototype la commet 35
fois. Pour ce cas, employer `--ls-accent-gold-deep` (4,72:1) ou assombrir jusqu'à
un rapport mesuré supérieur à 4,5:1.

Le jeton `primary-night` `#1B2A41` du cahier des charges est **écarté**. Aucun
bleu dans ce projet, le logo n'en contient pas.

### C36, la bordure d'un contrôle tient 3:1, et ce n'est pas la même règle

Les seuils ci-dessus valent pour du **texte**. WCAG 2.2 AA porte un second
critère, **1.4.11 « contraste des éléments non textuels »**, qui exige **3:1**
pour la limite visible d'un contrôle de saisie dès lors que **rien d'autre ne
l'identifie**. Aucune exception de taille ici, un contrôle n'ayant pas de corps
de texte.

| Jeton | Valeur | Usage | Sur blanc |
|---|---|---|---|
| `--ls-border` | `#D9CDBA` | séparateurs, cartes, filets, **décoratif** | 1,57:1 |
| `--ls-border-controle` | `#95836A` | **limite d'un contrôle**, champ ou bouton | 3,66:1 |

**`--ls-border` ne borde jamais un champ de saisie ni un bouton secondaire.**
Il donne 1,57:1 sur blanc, et le fond du champ étant `--ls-surface` comme celui
de la carte qui le porte, sa bordure est le seul indice de sa présence : un
champ vide sans bordure visible est invisible.

`--ls-border-controle` a été choisi pour tenir sur **tous** les fonds du projet,
sable compris où il donne 3,07:1. Des candidats plus clairs passaient sur blanc
en échouant sur sable, ce qui aurait recréé le piège de C31, un jeton légitime
dont une paire sur deux est fautive.

**Deux cas sortent de ce critère, et la norme le dit elle-même :**

1. un contrôle **désactivé**, WCAG 1.4.11 écartant les composants inactifs
2. un élément que **son fond ou son texte identifie déjà**, le trait n'étant
   alors qu'un filet : un lien souligné dont le texte est lisible, un bouton qui
   porte son propre fond

Le second cas s'écrit **dans le CSS**, par un commentaire portant
`@bordure-decorative` suivi de sa raison, juste au-dessus du bloc.
`scripts/verifier-bordure-controle.sh` exige cette raison et refuse un marqueur
posé seul : une exemption sans motif est un interrupteur, pas une décision.

**Ce défaut est entré de bonne foi sur vingt-cinq fichiers d'écran**, et la
cause est écrite
ici : jusqu'au 6 septembre 2026, cette règle ne portait **aucun seuil de
bordure**. Elle énonçait deux règles de contraste, toutes deux sur du texte, et
une session qui les respectait à la lettre bordait quand même ses champs avec le
jeton décoratif. Motif « règle incomplète franchie de bonne foi ».

### C31, ce qui se mesure est une paire, jamais une couleur

**Un rapport écrit à côté d'un jeton ne vaut que pour un fond**, et rien dans le
jeton ne dit lequel. Le même `--ls-text-muted` donne 4,86:1 sur crème et
**4,35:1 sur sable** : la couleur est légitime, la paire ne l'est pas.

Avant d'employer un jeton de texte sur un fond, **recalculer sur ce fond**.
Trois paires du projet sont sous le seuil et se ressemblent assez pour être
écrites par recopie d'un écran sain :

| Paire | Rapport | Verdict |
|---|---|---|
| `--ls-text-muted` sur `--ls-surface-sand` | 4,35:1 | refusée |
| `--ls-accent-gold-deep` sur `--ls-surface-sand` | 4,23:1 | refusée |
| `--ls-text-on-primary` sur tout fond clair | 1,00:1 | refusée |

**Le sable est le fond piégeux du projet.** Sur lui, employer `--ls-text` ou
`--ls-primary`, jamais un jeton secondaire.

**Recopier une couleur en ajoutant un fond casse l'hypothèse sous laquelle elle
était juste.** C'est la forme la plus discrète du défaut, et celle par laquelle
il est entré deux fois : l'écran d'origine n'a aucun `background`, donc son
texte est sur crème où le jeton tient sa promesse.

`scripts/verifier-contraste.sh` mesure toute paire colocalisée dans `src/`. Il
est **générique** et non ancré sur un nom de jeton, arbitrage du 19 août 2026 :
un contrôle nominatif resterait vert sur une couleur insuffisante portant un
autre nom. Il ne voit pas le fond **hérité**, que `axe-core` mesure de son côté
sur le rendu réel ; aucun des deux ne remplace l'autre.

## Rédaction des textes visibles

Tout texte affiché aux visiteuses et à l'administratrice suit les règles de
rédaction française du projet : orthographe correcte, **tous les accents
présents**, aucun tiret cadratin ni demi-cadratin.

Cela couvre les libellés de boutons, les messages d'erreur, les états vides, les
textes alternatifs, les titres de section, les libellés de formulaire et les
noms accessibles.

Un accent manquant dans l'interface d'une boutique artisanale française abîme la
crédibilité de la marque autant qu'une faute de frappe. Cette règle a donc un
impact produit, pas seulement rédactionnel.

### Ne pas accorder au féminin par défaut

Le cahier des charges emploie systématiquement « cliente », « visiteuse »,
« acheteuse ». **Ne pas reprendre cette convention dans les textes visibles.**

Une part notable des acheteurs sera masculine : un homme qui achète un bijou en
cadeau, particulièrement autour de Noël et de la fête des mères. Lire « vous
serez livrée » l'exclut de la boutique. L'enjeu est commercial.

Tourner les phrases **sans accord de genre**, plutôt qu'écrire « client(e) » ou
une forme à point médian, qui alourdissent et se prononcent mal au lecteur
d'écran.

| À éviter | Formulation neutre |
|---|---|
| Vous serez livrée sous 48 h | Livraison sous 48 heures |
| Chère cliente | Bonjour, ou le prénom |
| Vous êtes connectée | Connexion réussie |
| Aucune commande trouvée pour cette cliente | Aucune commande trouvée |

S'applique **partout, pas seulement aux textes visibles** : libellés,
confirmations, erreurs, états vides, emails transactionnels, documents, mais
aussi documentation technique, commentaires de code, tickets Jira et réponses de
conversation. Écrire « le client », jamais « la cliente », par défaut.

Christophe a dû le signaler deux fois, les 27 et 28 juillet 2026. La règle avait
été comprise comme portant sur l'interface seule.

Exception : « l'administratrice » et « l'exploitante » désignent une personne
réelle et identifiée, l'accord y est correct.

**L'arbitrage de LS-32 est rendu, le 3 septembre 2026 : TOUT NEUTRALISER**,
contenus éditoriaux compris. Trois positions étaient proposées à l'exploitante,
dont une intermédiaire gardant le féminin dans la page histoire et les
descriptions de créations. Elle a retenu la neutralisation complète.

Il n'y a donc plus de zone où le féminin serait un choix de marque assumé : la
page « Notre histoire », les descriptions de pièces et la foire aux questions
suivent la même règle que les confirmations et les emails.

## Interdits visuels

Pas de glassmorphisme, pas de carte transparente flottante, pas de dégradé
violet ou bleu, pas d'esthétique SaaS, pas de rose dominant, pas de
suranimation. Aucun **dégradé métallique** sur un bouton, un bandeau ou un
footer : c'est un marqueur de site généré automatiquement. Les aplats unis
uniquement.

Les primitives shadcn/ui et Radix servent pour l'accessibilité, jamais comme
identité visuelle par défaut.

Pas de faux avis, faux compteur, promotion inventée ni urgence artificielle.
Pas de tableau dans la boutique publique.

## Mobile first

Référence 320 à 430 px d'abord, puis 390, 768, 1280. Aucun débordement
horizontal à 320 px, y compris avec un nom de produit long et un prix à trois
chiffres. Zones tactiles proches de 44 par 44 px. Zoom à 200 % sans perte de
contenu ni blocage de l'achat.

Le back-office adopte cartes et listes quand un tableau devient illisible sur
mobile. Cible : créer un produit complet en moins de trois minutes sur
smartphone, photographies comprises.

### C33, tout écran d'administration est atteignable sans saisir d'URL

Une **barre permanente** porte les rubriques, posée par
`src/app/administration/layout.tsx`, arbitrage du 2 septembre 2026. Elle ne
s'affiche que pour une session au rôle `ADMINISTRATRICE` : la cacher n'est pas
une protection, les pages restant gardées une par une, mais l'afficher
divulguerait la structure de l'administration.

**Un écran ajouté entre dans la barre, ou son absence s'écrit.**
`scripts/verifier-navigation-administration.sh` confronte les rubriques aux
routes du dépôt **dans les deux sens** : une rubrique sans route est un lien
mort, une route ni navigable ni exclue est un écran inatteignable. Les écrans
de détail, à segment dynamique, sont exclus par leur forme.

**Le défaut est resté invisible huit stories durant**, chacune ajoutant un
écran sans le relier. Les tests de bout en bout appellent `page.goto()` avec
l'URL en dur : ils ne passent jamais par une navigation réelle, donc l'absence
totale de menu ne faisait rougir aucune assertion.
`tests/e2e/navigation-administration.spec.ts` navigue **au clic** pour cette
raison.

L'écran courant est annoncé par `aria-current="page"`, et **le style s'ancre sur
cet attribut** plutôt que sur une classe : deux sources distinctes finiraient
par désigner des rubriques différentes, sans que rien ne rende l'écart visible.

### C34, tout écran porte la cible du lien d'évitement

Un **lien d'évitement** est le premier élément focalisable de chaque partie du
site, WCAG 2.4.1 niveau A. Il vit dans le layout, `en-tete-boutique.tsx` côté
boutique et `administration/layout.tsx` côté administration, jamais recopié
page par page.

**Sa cible vit dans le `<main>` de chaque page**, avec `id="contenu"` et
`tabIndex={-1}`, et non dans un conteneur posé par le layout. Mesuré deux fois
sur ce dépôt : `focus()` sur un `div` sans `tabindex` ne prend pas, le focus
retombe sur `body`, et la tabulation suivante repart du haut. **La page défile,
le lien paraît marcher, et il ne remplit pas son rôle.**

**Le lien et sa cible se posent ensemble, ou aucun des deux.** Seize écrans
d'administration ont porté un lien absent jusqu'à LS-194, et un écran a porté
l'ancre sans lien en LS-191. Les deux moitiés se périment séparément, d'où un
contrôle qui les vérifie dans les deux sens,
`scripts/verifier-lien-evitement.sh`.

**Un écran rendu hors de la barre n'en porte pas**, connexion et
réauthentification côté administration : un lien d'évitement sans cible occupe
la première tabulation et ne mène nulle part, ce qui est pire que son absence.

**Le lien porte 44 px de zone tactile et revient avec une marge**, LS-196. Ces
deux seuils manquaient ici jusqu'au 6 septembre 2026, et leur absence a produit
les deux défauts que cette story ferme : une session qui suivait C34 à la lettre
posait un lien de 24 px revenant à `left: 0`, sans qu'aucune ligne ne l'en
empêche. Motif « règle incomplète franchie de bonne foi », le même que la règle
de contraste plus haut a déjà payé.

| Propriété | Valeur | Pourquoi |
|---|---|---|
| zone tactile | `min-height: var(--ls-touch-target)`, 44 px | c'est le **premier** élément atteint au clavier, il mérite moins que tout autre d'être difficile à viser |
| retour au focus | `left` et `top` à `var(--ls-space-2)`, 8 px | `globals.css` trace `outline: 3px` avec `outline-offset: 2px`, soit **5 px au-delà de la boîte** : à ras du bord, les côtés gauche et supérieur du contour sortent du cadre et le focus ne se voit que sur deux côtés sur quatre, WCAG 2.4.7 |

Le jeton de 8 px est **plus large que les 5 px nécessaires**, délibérément : une
valeur calculée au plus juste se casserait si le contour ou son décalage
changeait dans `globals.css`.

**Les deux côtés du site portent le même motif**, et leurs écarts restants
portent chacun leur raison écrite dans le CSS. `scripts/verifier-lien-evitement.sh`
couvre les trois familles d'écran : administration, boutique, et les écrans hors
groupe de routes qui composent `EnTeteBoutique` eux-mêmes, `not-found.tsx` en
tête. **Il ne s'ancrait que sur l'administration jusqu'à LS-196**, et il
annonçait pourtant « chaque écran porte sa cible focalisable » : trois écrans
publics rendaient un `<main>` nu pendant ce temps. Un contrôle dont la portée est
plus étroite que la règle qu'il énonce ment par omission.

La zone tactile et la marge se mesurent **sur le rendu**, par la suite de bout en
bout, un contrôle textuel ne pouvant voir ni une `min-height` annulée par un
parent ni une position calculée.

## Accessibilité, WCAG 2.2 AA sur les parcours critiques

Focus visible d'environ 3 px, jamais supprimé sans remplacement. Navigation
clavier complète et ordonnée. Texte alternatif décrivant le bijou ou le geste,
alt vide réservé au décor dupliqué. Erreur associée à son champ, jamais
transmise par la couleur seule. Nom accessible sur tout bouton icône. Respect
systématique de `prefers-reduced-motion`.

### C39, un `aria-describedby` ne vise jamais un élément portant `aria-label`

Le calcul de la **description** accessible consulte `aria-label` avant le
contenu textuel, exactement comme celui du nom. Un élément décrit par un autre
qui porte un `aria-label` s'annonce donc avec ce label, et **jamais avec son
texte réel** : le rattachement que `aria-describedby` cherche à obtenir est
annulé.

Mesuré sur `document-facture.tsx`, LS-161. Le bouton s'annonçait « Générer le
document, Génération du document » au lieu de lire « La génération a échoué. La
facture reste valide et son numéro est inchangé », c'est-à-dire la seule phrase
qui apprenait quelque chose.

**Nommer une région live ne sert à rien**, et c'est la croyance qui a produit le
défaut. `aria-label` ne change pas l'annonce d'une mise à jour de
`role="status"` : seul le **contenu** est vocalisé. La justification écrite dans
le fichier invoquait pourtant le besoin de distinguer deux régions `status` du
même écran. Une règle qui énonce une chose et en prescrit une autre se franchit
de bonne foi, et c'est ainsi que le second écran a recopié le premier.

**Distinguer deux régions passe par leur contenu**, jamais par leur nom : « La
génération a échoué » se suffit quand la région voisine parle de remboursement.

`scripts/verifier-description-accessible.sh` le vérifie dans les deux sens, et
il ne voit pas les identifiants construits à l'exécution, qu'un test de rendu
resterait seul à couvrir.

### C38, tout champ de mot de passe client porte sa bascule de lisibilité

ADR-023 impose **seize caractères minimum**, contre l'usage courant de huit.
Saisir seize caractères à l'aveugle, sur un clavier mobile qui masque chaque
frappe après un instant, fait raccourcir le mot de passe jusqu'à la limite basse
ou renoncer à l'inscription. Le commentaire d'ADR-021 décrit déjà cet effet pour
l'administration : une contrainte trop lourde « pousse à des mots de passe plus
faibles et prévisibles ».

**Le composant est `src/components/champ-mot-de-passe.tsx`**, jamais un
`type="password"` écrit directement dans un écran. Six champs sur cinq fichiers
l'emploient depuis LS-179.

**L'administration en est dispensée**, ADR-021 faisant de son mot de passe un
chemin de repli derrière la passkey, et LS-175 le portant. La dispense s'écrit
dans les `EXCLUSIONS` de `scripts/verifier-bascule-mot-de-passe.sh`, avec sa
raison : une exemption sans motif est un interrupteur, pas une décision.

Cinq propriétés que le composant garantit, chacune pour une raison mesurée :

| Propriété | Pourquoi |
|---|---|
| le **même** input change de `type` | deux inputs échangés par un ternaire perdraient valeur, focus et remplissage automatique du gestionnaire de mots de passe |
| la position du curseur est reposée | changer le `type` d'un input monté remet le curseur à la fin sur WebKit, et la frappe suivante atterrit ailleurs qu'attendu |
| l'état par défaut est masqué, sans mémorisation | un mot de passe affiché par surprise sur l'écran suivant est pire que pas de bouton du tout |
| `aria-describedby` **s'ajoute** à l'aide de l'appelant | l'écraser ferait perdre « seize caractères minimum » au moment où il sert, motif de LS-161 |
| le nom accessible **dit l'état** | « Afficher » puis « Masquer » : un bouton nommé d'une seule façon laisse un lecteur d'écran sans savoir si le mot de passe est visible |

**Les deux formes sont acceptées, contrôlée et non contrôlée.** Ce n'est pas une
généralisation prématurée : les écrans du parcours d'authentification tiennent
leur valeur dans un `useState`, l'écran du **profil** lit son `FormData` à la
soumission et vide ses champs par `formulaire.reset()`. Forcer le profil en
contrôlé casserait ce `reset()`, qui ne remet pas à zéro un `useState` : les
champs paraîtraient vides en gardant leur valeur, et le mot de passe survivrait
à un changement réussi, sur un poste possiblement partagé.

**Le bouton est un vrai bouton**, `type="button"` explicite : sans lui, afficher
son mot de passe soumettrait le formulaire, un bouton sans type valant `submit`
en HTML. Il tient 44 px **dans les deux dimensions**, mesuré à 67 par 44 px à
320 px : une icône de 24 px laisserait une cible sous le seuil.

**Le contour de focus du bouton part vers l'intérieur**, seul écart assumé à
`globals.css`, qui trace 3 px avec 2 px de décalage. Le bouton étant collé au
bord droit de l'enveloppe, un décalage positif sortirait du cadre à 320 px.

`scripts/verifier-bascule-mot-de-passe.sh` garde les deux versants, l'absence de
`type="password"` nu et le fait que le composant rende encore le service.
**Il a porté le défaut qu'il cherchait** : il trouvait « Afficher le mot de
passe » dans un commentaire du composant et restait vert sur un code ayant perdu
le libellé. Troisième forme du motif « contrôle satisfait par un commentaire »,
et la plus difficile à parer, un libellé d'interface se citant entre guillemets
français sans marque syntaxique à exiger. Il filtre désormais les commentaires
avant de chercher.

## États obligatoires

Le prototype ne les montre pas, ils doivent exister : vide, chargement, erreur
serveur, pending, disabled, indisponible, aucun résultat de filtre, rupture.
Jamais de faux succès optimiste : une erreur serveur produit un message visible
associé à l'action.

### C35, une annonce de chargement se termine par des points de suspension

**Le caractère est `…`, le point de suspension unique**, et jamais trois points
successifs.

**La règle vaut pour tout texte d'attente, pas seulement pour un état de
chargement** : le libellé d'un bouton pendant son action, « Envoi en cours… »,
« Enregistrement… », relève du même principe. Six d'entre eux employaient trois
points en LS-195, dont deux sur le parcours de rétractation ; ils ont été
alignés avec elle. Un badge d'ÉTAT ne porte pas cette ponctuation, « Traitement
en cours » nommant une situation et non une action en train de se faire.

Une attente **en cours** se dit avec des points de suspension. Le point final
ferme la phrase, donc l'action : « Chargement des pièces. » annonce un
chargement terminé alors qu'il commence. Un lecteur d'écran marque d'ailleurs la
pause différemment sur les deux formes.

Le catalogue public a porté le point final de LS-104 à LS-195, **seul des quinze
annonces de chargement du dépôt**, et c'était l'écran public. Il était pourtant
la référence que le composant partagé cite dans son propre en-tête : la forme
d'origine a été recopiée quatorze fois en la corrigeant au passage, sans que
l'original le soit. **C'est l'original qui a divergé de ses copies**, ce
qu'aucune relecture de diff ne montre.

Le ticket annonçait seize annonces, le dépôt en porte **quinze** : la seizième
occurrence était une ligne de commentaire du composant partagé. Un nombre écrit
dans une règle et démenti par le contrôle qui l'applique se paie à la relecture
suivante, motif « table de nombres trop courte ».

`scripts/verifier-ponctuation-chargement.sh` garde les deux points, la
terminaison et le caractère employé.

### C32, aucun `loading.tsx` au-dessus d'un appel à `notFound()`

**Le seul cas où l'état de chargement exigé ci-dessus est interdit.** Un
`loading.tsx` enveloppe la page entière dans une frontière Suspense : le
streaming commence **avant** que `notFound()` soit atteint, et Next.js ne peut
plus changer le statut d'une réponse déjà commencée. Il laisse **200** et se
contente d'ajouter un `noindex`.

Mesuré en LS-111 : 404 sans le fichier, 200 avec.

**La règle porte sur le SOUS-ARBRE, pas sur le segment**, et sa version
précédente disait « sur une route qui appelle `notFound()` », ce qui se lisait
comme une contrainte de voisinage. Un `loading.tsx` couvre tout ce qui est sous
lui, exactement comme un `error.tsx` couvre les seize écrans d'administration
depuis LS-191 : le fichier interdit peut être **plusieurs dossiers plus haut**
que l'appel qu'il casse.

Mesuré en LS-188, le 5 septembre 2026, sur une route de diagnostic appelant
`notFound()` en première instruction : **404 hors de `/administration`, 200
dedans**, le seul écart étant la présence d'un `loading.tsx` à la racine du
sous-arbre. Trois fichiers avaient été posés de bonne foi, sur
`administration/`, `commandes/` et `produits/`, et chacun cassait le statut
d'écrans situés un ou deux dossiers plus bas.

**Ce que la règle impose donc à un écran de liste** dont un descendant porte un
segment dynamique : son état de chargement passe par un `<Suspense>` interne, au
même titre que celui de l'écran de détail lui-même.

**Le défaut est invisible à l'écran**, la page rendue étant identique dans les
deux cas. Un moteur indexerait une fiche produit inexistante, et le `noindex` ne
protège que des moteurs qui le respectent. Le SEO tranche : un statut faux est
un défaut de correction, un écran figé n'est qu'un défaut de confort.

Ce qui rétablit le chargement sans le conflit : placer le contenu lourd sous un
`<Suspense>` **dans** la page, en gardant le contrôle d'existence au-dessus.

`scripts/verifier-loading-et-404.sh` l'attrape à l'écriture, en **remontant les
segments parents** depuis LS-188 ; `tests/e2e/pages-erreur.spec.ts` vérifie le
**code de statut** des routes publiques, et
`tests/e2e/statut-detail-administration.spec.ts` celui des deux écrans de détail
de l'administration, qui n'en avaient aucun avant LS-188. Ces tests lisent le
statut et non l'aspect de la page, ce qui les rend sensibles à une cause que
personne n'a prévue.

**Le contrôle textuel ne remplace pas le test, et l'inverse non plus.** Le
premier voit les deux formes connues du défaut sur toutes les routes, sans
navigateur ; le second voit le statut réel, y compris si Next.js change de
comportement. Le trou de LS-188 était visible par les deux, et aucun des deux
n'était en place.

### Les trois pages d'erreur publiques, LS-146

| Fichier | Ce qu'il couvre |
|---|---|
| `app/not-found.tsx` | les appels de `notFound()` **et** toute URL sans route |
| `app/(boutique)/error.tsx` | l'erreur serveur des écrans publics |
| `app/global-error.tsx` | l'échec du layout racine lui-même |

**Aucun détail technique n'atteint une page publique**, invariant 9 : ni trace,
ni nom de classe, ni `error.digest`. Le message dit que le problème vient du
site, jamais ce qui a échoué.

`global-error.tsx` **remplace** le layout racine au lieu de s'y imbriquer. Il
porte donc ses propres `html` et `body`, `lang="fr"` compris, et **ses couleurs
sont écrites en dur** : c'est la seule exception du projet à la règle « aucune
valeur hexadécimale », les jetons venant du fichier dont la défaillance amène
cette page. Il n'importe aucun composant ni service, pour la même raison.
`scripts/verifier-palette-secours.sh` garde ces deux invariants.

## Frontière avec le métier

Les composants rendent des données et émettent des intentions. Le calcul métier
reste dans les services. Un prix, un total ou une disponibilité affichés viennent
du serveur, jamais d'un calcul dans le navigateur.

L'état des filtres et du tri est sérialisé dans l'URL, pour que le retour
navigateur et le partage de lien fonctionnent.

### C37, une Server Action revalide le layout dès que le layout lit la donnée

`revalidatePath(chemin)` invalide la **page** seule. L'option `"layout"` en
second argument invalide en plus le layout et ce qui vit dessous, vérifié via
Context7 le 7 septembre 2026.

**Le layout de l'administration lit des comptages**, `lireComptages` : pastille
des messages, variantes en stock faible, commandes à préparer, expéditions en
transit. Une Server Action qui modifie l'une de ces données **doit** passer
`"layout"`, sans quoi l'écran se rafraîchit pendant que la barre garde son
ancien nombre.

**Le défaut a été livré six fois** avant d'être vu, LS-201 : une fois sur le
classement d'un message, cinq sur les actions de stock. Ce que l'exploitante
voyait sur le premier : elle classe son dernier message non lu, la liste se
vide, et la barre continue d'annoncer « 1 ». Elle rouvre l'écran pour n'y rien
trouver.

**Il est intermittent, ce qui le rend cher à diagnostiquer.** Le layout est
souvent recalculé pour d'autres raisons, donc le défaut ne se voit que lorsque
le cache tient. Un test de bout en bout qui comparait la pastille à la liste
passait la plupart du temps.

La question à se poser avant d'écrire l'appel : **cette donnée est-elle lue par
le layout ?** Si oui, `"layout"`. Ce n'est jamais `revalidatePath("/", "layout")`,
qui purgerait le cache client entier pour un geste local.

**Le layout lit NEUF comptages, et LS-201 n'en avait couvert que deux
domaines.** Onze appels sont restés en violation jusqu'au 7 septembre 2026, sur
les commandes, les expéditions, les rétractations et les variantes. La règle
était juste, sa portée réelle n'avait jamais été mesurée : c'est le motif connu
de ce dépôt, une règle écrite et non vérifiée ne tient pas.

`scripts/verifier-revalidation-layout.sh` la vérifie désormais dans les deux
sens, prouvé par mutation sur les quatre domaines oubliés.

| Domaine | Comptages de la barre qui en dépendent |
|---|---|
| `commandes` | `commandesAPreparer`, `commandesPretesAExpedier`, `commandesEnCours` |
| `expeditions` | `expeditionsEnTransit` |
| `retractations` | `retractationsEnCours` |
| `messages` | `messagesNonLus` |
| `stocks` et `produits/actions-variantes` | `variantesStockFaible`, `variantesIndisponibles` |
| tout remboursement | l'encaissé du jour, qui soustrait le montant remboursé |

**Toute action de ces domaines n'a pas besoin de `"layout"` pour autant**, et le
raisonnement se fait sur la donnée, jamais sur le dossier. Trois transitions de
rétractation passent d'un statut *en cours* à un autre statut *en cours* :
`retractationsEnCours` exclut les seuls `REMBOURSEE` et `REFUSEE`, donc le
nombre ne bouge pas. Régénérer le PDF d'une facture ne touche aucun comptage non
plus. Ajouter `"layout"` par symétrie ferait recalculer neuf agrégats pour rien.

## Dimensionnement du catalogue

Le catalogue ouvrira avec 10 à 20 références et peut atteindre 30 à 40 sans
changement d'architecture. **Aucune limite technique ne plafonne le nombre de
produits**, ni en base, ni dans une requête, ni dans un composant. Le schéma n'en
porte aucune aujourd'hui, ne pas en introduire.

Cet ordre de grandeur commande la conception dans les deux sens : il interdit de
sous-dimensionner comme de sur-concevoir.

Retenu :

- catégories principales visibles, sans niveau intermédiaire
- filtres limités aux critères réellement utiles, prouvés par le catalogue réel
- tri par nouveautés, `Produit.publieA`, et éventuellement par prix
- photographies optimisées : AVIF, WebP et repli JPEG, servis en 320, 640 et
  1280 px, plus 1920 px en AVIF et WebP pour les écrans à haute densité. Les
  largeurs et les formats sont fixés par ADR-007, ne pas en ajouter ici sans
  l'amender : l'original étant supprimé après traitement, une largeur ajoutée
  après coup oblige à redemander les photographies
- fonctionnement à partir de 320 px

Écarté, et à ne pas réintroduire sans arbitrage :

- moteur de recherche externe, Algolia, Meilisearch ou équivalent
- mégamenu
- système générique d'attributs **typés**, EAV. Les sections de fiche produit
  d'ADR-026 n'en sont pas : du texte titré et ordonné ne porte ni type, ni unité,
  ni règle de validation par attribut
- toute architecture dimensionnée pour plusieurs milliers de références
- aperçu rapide et ajout rapide complexes depuis la liste

Une recherche interne simple, filtrage sur le nom et la description, reste
**Could, jalon V1.x**. Quarante références se parcourent à l'œil, la recherche
n'est pas le chemin d'accès principal.

## Fiche produit, ordre des blocs

L'ordre est conçu pour un écran de 320 px, où tout est empilé : ce qui décide de
l'achat est au-dessus, ce qui rassure et détaille vient ensuite. Les blocs 8 à 13
peuvent être repliés, jamais absents.

| # | Bloc | Source |
|---|---|---|
| 1 | Nom du bijou | `Produit.nom` |
| 2 | Présentation courte | `Produit.descriptionCourte` |
| 3 | Prix | `Variante.prixCentimes` |
| 4 | Disponibilité | dérivée, voir ci-dessous |
| 5 | Choix de la variante, si plusieurs | `Variante.libelle` |
| 6 | Ajout au panier | |
| 7 | Informations de livraison | composant de réassurance |
| 8 | Dimensions | `Variante.dimensions` |
| 9 | Sections éditoriales, dans leur ordre | `SectionProduit` visibles et non vides |
| 10 | Retours et rétractation | textes légaux, jamais recopiés |
| 11 | Avis vérifiés, s'il en existe | `Avis` publiés |

### Le bloc 9 est piloté par l'administratrice, ADR-026

Les quatre colonnes `Produit.description`, `matieres`, `entretien` et
`fabrication` **n'existent plus**. Leur contenu est devenu des lignes de
`SectionProduit`, ordonnées, renommables et supprimables.

Quatre sections sont proposées à la création d'un produit : Description
détaillée, **Matières et composants**, Fabrication, Conseils d'entretien.
L'administratrice les renomme, les réordonne, les masque ou les supprime, et en
crée d'autres. Le rendu suit donc `SectionProduit.ordre`, jamais un ordre écrit
en dur dans un composant.

Trois règles de rendu :

- une section **non visible** ne s'affiche pas, C22
- une section **sans contenu** ne s'affiche pas, titre compris, C23
- `SectionProduit.contenu` est du **texte simple**. `dangerouslySetInnerHTML` et
  tout rendu HTML équivalent y sont **interdits**. Les sauts de ligne deviennent
  des paragraphes, rien d'autre

**Les dimensions ne sont pas une section.** Elles restent
`Variante.dimensions`, leur source de vérité, parce qu'elles varient d'une
déclinaison à l'autre, un collier en 40 et 45 cm. Aucune section « Dimensions »
n'est proposée par défaut, ce qui éviterait une double saisie contradictoire. Une
section personnalisée peut porter un guide des tailles, jamais la dimension
structurée de la variante.

Les blocs de réassurance, retours et avis restent **hors** de cet éditeur : leurs
tarifs et textes viennent de la configuration et des textes légaux, jamais d'une
saisie libre.

### États de disponibilité

Trois états seulement, dérivés côté serveur :

| État | Condition |
|---|---|
| En stock | disponible à la vente web, quantité supérieure à 1 |
| Dernière pièce | disponible, quantité exactement 1 |
| Épuisé | quantité nulle, vente web désactivée ou variante archivée |

**La quantité exacte n'est pas affichée publiquement**, sauf « dernière pièce »
qui est une information d'urgence utile et vraie. Publier « 7 en stock » expose
le niveau d'activité de la boutique sans rien apporter au client.

La disponibilité vient du serveur, jamais d'un calcul dans le navigateur. Elle
tient compte des réservations actives : une pièce réservée par un autre client
n'est pas disponible, voir `database.md`.

### Produits similaires

Could, jalon V1.x. Règle simple : autres produits actifs de la même catégorie,
hors produit courant. Aucun moteur de recommandation, aucun calcul de similarité.

## Réassurance commerciale

Should, jalon Go-Live. Un composant unique, réutilisé sur les fiches produit, le
panier et le tunnel. Les mêmes faits apparaissent aussi dans la foire aux
questions, la page Livraison, les emails et les textes juridiques.

**Aucun tarif ni seuil n'est écrit en dur dans un composant.** Tout vient d'une
configuration centralisée, la même que celle qui sert au calcul serveur des frais
de port. C'est la seule façon de garantir qu'un changement de seuil ne laisse pas
« offerte dès 39 € » sur la fiche produit et 45 € au panier.

Un tarif affiché et un tarif facturé qui divergent constituent une information
précontractuelle fausse, sanctionnée bien au-delà de l'écart de prix.

Six éléments, sans en ajouter :

| Élément | Formulation | Réserve |
|---|---|---|
| Fabrication | bijoux faits main en Béarn | **confirmé le 3 septembre 2026**, assemblage et finition à Artix (64) |
| Paiement | paiement sécurisé par Stripe | |
| Livraison | Mondial Relay, Point Relais, Locker ou domicile | ADR-025, le domicile en 4 à 6 jours contre 2 à 4 en retrait, ADR-035 |
| Gratuité | livraison offerte dès 39 € **en Point Relais et Locker** | ADR-035, valeur issue de la configuration. **Jamais « tous modes »** : le domicile n'est pas offert, et l'annoncer sans réserve est une information précontractuelle fausse |
| Rétractation | 14 jours pour changer d'avis | frais de retour à la charge du client, mention obligatoire |
| Contact | réponse par email | |

La mention des frais de retour accompagne celle de la rétractation partout où
elle apparaît. L'annoncer sans elle expose au délai de douze mois de l'article
L221-20, voir `legal.md`.

« Faits main en Béarn » n'est pas un argument décoratif. Une allégation d'origine
géographique fausse relève de la pratique commerciale trompeuse, articles L121-2
et suivants.

**La confirmation est obtenue, le 3 septembre 2026** : l'assemblage et la
finition ont lieu à **Artix**, en Pyrénées-Atlantiques, et toutes les étapes se
font au même endroit. La formule « faits main en Béarn » est donc exacte, Artix
appartenant au Béarn.

**Ce qui reste interdit** : la formule du prototype, « Modelé, assemblé et fini à
la main à Artix ». Le verbe « modelé » a été inventé par un générateur et décrit
un geste qui n'a pas été confirmé, l'exploitante ayant validé l'assemblage et la
finition, jamais le modelage. Écrire « assemblés et finis à la main à Artix ».

## Paillettes

Could, jalon V1 cible. CSS déterministe, pas de bibliothèque, `aria-hidden`,
`pointer-events: none`, supprimé en mouvement réduit, jamais par-dessus un bijou
ou un contrôle. Ne bloque jamais l'ouverture.
