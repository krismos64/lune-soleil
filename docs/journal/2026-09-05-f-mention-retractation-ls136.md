# 5 septembre 2026, session F : la mention de rétractation, LS-136

Deuxième story de la journée, choisie parce qu'elle portait le seul risque
juridique ouvert du projet et qu'il était mesurable.

## Le trou, mesuré avant d'écrire

**Zéro occurrence du mot « rétractation » dans tout le tunnel de commande.** Les
conditions générales en portaient six, ce qui ne suffit pas : l'article L221-23
impose l'information *avant la validation de la commande*, « pas seulement dans
les conditions générales que personne ne lit ».

L'article L221-20 porte le délai de rétractation à **douze mois** quand
l'information est absente ou incorrecte, sur toutes les commandes concernées.
Une boutique qui ouvre avec ce trou l'ouvre sur tout son premier exercice.

## Une correction de mon propre diagnostic, dès le début

J'avais annoncé **deux** trous, dont l'absence de la mention des frais dans le
formulaire de rétractation. C'était faux : elle existait depuis LS-134, écrite en
clair dans le **composant** quand je la cherchais dans la **page**, et sous la
formulation « frais de retour du bijou restent à votre charge » quand je
cherchais « frais de retour » dans un autre fichier.

Un emplacement déclaré manquant à tort aurait produit une seconde mention à côté
de la première. Je l'ai rapatriée dans la source unique plutôt que de la
dupliquer.

## Ce que les deux revues ont trouvé

### Un défaut de conformité, `ls-critical-reviewer`

**Il existe deux composants de formulaire de rétractation, pas un.**
`formulaire-retractation.tsx` sert l'espace client, `formulaire-jeton.tsx` sert
les acheteurs **sans compte** par lien signé. Le second portait sa propre copie
du texte, identique par coïncidence et libre de diverger.

C'est le chemin le **plus exposé** : `legal.md` dit que l'email de confirmation
est le seul par lequel un acheteur sans compte reçoit son droit. J'avais donc
laissé hors source unique exactement le chemin qui en avait le plus besoin, et
mon commentaire affirmait le contraire par écrit.

### Trois défauts d'interface, `ls-frontend-revue`

**Le test de rendu ne couvrait qu'une largeur sur trois.** Il appelait
`setViewportSize({ width: 320 })`, ce qui **écrase le viewport du projet** : il
tournait sur `mobile-320`, `mobile-390` et `bureau-1280` en mesurant 320 px les
trois fois. Coût triple, couverture d'une seule largeur. L'appel retiré, 20 tests
verts au lieu de 10, sur trois largeurs réelles.

**Le lien mesurait 17 px de haut**, en ligne dans la phrase, quand
`frontend-design.md` demande des cibles proches de 44 px. C'est le dernier
élément cliquable **avant** le bouton de paiement : à 320 px, une cible étroite
juste au-dessus se manque, et le doigt tombe sur l'engagement. Il sort du
paragraphe et mesure désormais 46 px aux trois largeurs.

**Sa couleur ne pouvait pas être celle des liens voisins.** La revue m'a averti
avant que je ne fasse la faute : `--ls-accent-gold-deep` sur `--ls-surface-sand`
donne 4,23:1, paire que `frontend-design.md` refuse nommément. Le sable est le
fond piégeux du projet. C'est `--ls-primary` qui convient.

**Les trois classes CSS échappaient au contrôle de contraste**, qui exige
couleur et fond dans le **même bloc de sélecteur**. 171 paires avant, 173 après,
prouvé par mutation : passer à `--ls-text-muted` fait rougir en nommant 4,35:1
pour un seuil de 4,5:1.

## Trois fois « nom nu hors ancrage » dans un seul contrôle

Le motif s'est répété trois fois, et chaque fois seule la mutation l'a montré :

1. **l'import suffisait.** Retirer les deux usages de `MENTION_TUNNEL` du rendu
   laissait le contrôle vert, la ligne `import` satisfaisant la recherche
2. **la propriété n'était pas distinguée.** Retirer le droit seul laissait vert,
   `MENTION_TUNNEL.fraisRetour` satisfaisant le motif à lui seul. L'écran
   annonçait alors qui paie le retour sans jamais dire qu'un droit existe
3. **le nom ne dit pas d'où il vient.** Chercher `DUREE_RETRACTATION_JOURS`
   restait vert sur un `const DUREE_RETRACTATION_JOURS = 14;` déclaré
   localement, c'est-à-dire sur exactement le défaut visé

Une recherche textuelle ne connaît que des chaînes, jamais leur provenance.
C'est la leçon à retenir de cette story, et elle vaut pour tous les contrôles du
dépôt.

## Le délai écrit en dur ailleurs, assumé

Treize textes visibles écrivent le délai en toutes lettres ou en chiffres, hors
source unique : accueil, fiche produit, aide, conditions générales, écrans
d'expiration, détail de commande, formulaires et deux modèles d'email.

**Les réécrire dégraderait la lecture.** « quatorze jours » se lit mieux qu'une
interpolation au milieu d'une phrase rédigée, et une mention légale doit d'abord
être lue : une obligation formellement remplie mais illisible rate sa fonction.

Le garde-fou est un sens du contrôle qui **échoue si la constante change**, en
nommant les fichiers à reprendre. Il ne réécrit rien, il refuse le silence.
Prouvé par mutation : porter le délai à 30 jours le fait rougir.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `type-check`, `lint`, `format:check` | verts |
| `vitest --project unitaire` | **484 verts**, 28 fichiers |
| `playwright mentions-retractation` | **20 verts**, trois largeurs |
| `verifier-mentions-retractation-mutation.sh` | **9 mutations sur 9** |
| `verifier-contraste.sh` | **173 paires**, vert |
| Les quatorze contrôles de la chaîne | verts |
| axe-core sur le récapitulatif | **zéro violation** |

Le rendu a été capturé et vérifié à 320 px, la zone tactile mesurée à 46 px.

## État des tickets

**LS-136 est TERMINÉE**, sept critères sur sept, PR #242 fusionnée en rebase.

**117 terminés sur 182**, relevé dans Jira après la clôture.

## Ce qui reste, et qui n'est pas de cette story

**768 px n'est mesuré par aucun projet Playwright**, alors que l'invariant 10 le
cite. C'est antérieur, **LS-166** le porte déjà, et le tunnel y est sensible :
son fil d'étapes bascule en ligne à `min-width: 768px`.

**Le formulaire type joint à l'email**, article L221-13, plutôt qu'un lien vers
la fonctionnalité en ligne. La revue a eu raison de ne pas trancher : cela se
vérifie aux sources, et c'est une obligation distincte des trois emplacements de
L221-23.

## Prochaine étape

**LS-148**, le consentement aux cookies, est bloquée par LS-141, elle-même
derrière le VPS. Les candidates sans dépendance externe : **LS-131**, le suivi
Mondial Relay, qui débloque le plus de choses, ou le lot d'accessibilité
LS-85, LS-108, LS-161 et LS-166.
