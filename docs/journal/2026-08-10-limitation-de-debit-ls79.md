# 10 août 2026, soir, LS-79 faite, limitation de débit sur quatre routes

**LS-79 est terminée.** Trois routes protégées sur quatre, la quatrième
n'existant pas encore dans le dépôt, arbitrage de Christophe pris en tout début
de session.

## Ce qui a été fait

`prisma/schema.prisma` porte le modèle `RateLimit`, trois champs imposés par
Better Auth : `key`, `count`, `lastRequest` en `BigInt`. Migration écrite à la
main, `prisma migrate dev` étant interactif comme toutes les précédentes,
`20260810180000_limitation_de_debit`, purement additive. `schema.sql` propagé
dans le même mouvement, le contrôle de complétude l'ayant détecté immédiatement.

`src/lib/auth.ts` porte la configuration `rateLimit` : `enabled: true` pour
rester actif hors production, `storage: "database"`, et trois `customRules` sur
`/sign-in/email`, `/request-password-reset` et `/sign-up/email`.

**Le formulaire de contact n'a reçu aucune règle.** Il n'existe aucune route
`src/app/contact` ni `src/app/api/contact` dans le dépôt à ce jour. Poser une
règle sur un chemin qui n'existe pas n'aurait rien protégé et aurait donné
l'illusion d'une couverture. Christophe a confirmé cet arbitrage en début de
session : la règle s'écrira avec la route, dans une story qui la crée.

## Tests et preuve

Cinq tests d'intégration ajoutés à `authentification.sequential.test.ts`,
critères 1, 2, 4 et 5 : cinq essais admis puis un refus sur la connexion, trois
puis un refus sur la réinitialisation et sur l'inscription, message de refus qui
ne varie jamais selon l'existence du compte, persistance du compteur à travers
une nouvelle instance de Better Auth simulant un redémarrage.

**Deux cas de mutation ajoutés à `verifier-tests-mutation.sh`**, cas 20 et 21 :
`enabled` remis à `false`, `storage` remis à `memory`. Le script passe de dix-neuf
à **vingt-et-un cas, tous détectés**. `README.md` est mis à jour avec ce compte.

Suite complète : **164 tests** contre 159 avant cette story. `verifier-schema.sh`
passe à **93 réussites, 0 échec**, 31 tables.

## Une découverte qui a coûté six tests faux

**`auth.api.*` n'est pas soumis à la limitation de débit.** Vérifié via
Context7 : « Rate limits in Better Auth only apply to client-initiated
requests. Server-side requests made using auth.api are not affected by rate
limiting. » Les six premiers tests écrits pour ce ticket appelaient
`auth.api.signInEmail` et consorts, restaient verts jusqu'à l'assertion sur le
429 qui n'arrivait jamais. Corrigé en frappant `auth.handler` directement avec
de vraies `Request`, le chemin réellement emprunté par
`src/app/api/auth/[...all]/route.ts`. Voir mémoire à écrire,
[[lune-soleil-rate-limit-auth-api-non-applique]].

**Une IP distincte par sous-test**, via `x-forwarded-for` : la clé de Better
Auth combine route et adresse IP, jamais l'email. Sans cette isolation, les
sous-tests du même bloc auraient partagé un seul compteur par route.

**La première mutation par `sed` a débordé sur un champ homonyme.** Un
`sed 's/enabled: true/enabled: false/'` sans ancrage de ligne a muté à la fois
`rateLimit.enabled` et `emailAndPassword.enabled`, faisant rougir un test
d'autorisation sans rapport. Corrigé en ciblant le numéro de ligne exact. Le
script de mutation définitif utilise `perl -0pi` avec un motif suffisamment
spécifique pour ne toucher qu'un seul champ, comme les dix-neuf cas précédents.

## Écart assumé, non résolu

**Le comptage est par adresse IP, jamais par compte visé**, tel que documenté
par ADR-027 dès sa rédaction du 4 août. Better Auth ne sait compter que par IP
avec ce mécanisme intégré. LS-83 couvre le complément, hors Go-Live.

## État des tickets

**LS-79 est terminée**, transitionnée En cours puis prête à passer Terminé
après fusion. **LS-2** compte désormais treize stories filles sur dix-sept
terminées. Restent LS-72, LS-75, LS-80, LS-81. LS-75 se traite en dernier,
elle vérifie les autres.

Le journal du rapport DMARC agrégé du 10 août, écrit avant cette session, est
inclus dans le même commit de documentation.

## Vérification de fin de session, et un écart trouvé

Passe de contrôle demandée par Christophe avant de quitter la session, sur le
README, `CLAUDE.md`, la mémoire, le journal et la configuration Claude Code.

**Ce qui est conforme**, mesuré et non supposé : `verifier-config-claude.sh` et
`verifier-regles.sh` verts, `CLAUDE.md` à 200 lignes pile, `npm audit` à zéro,
mémoire à 99 fiches pour 99 entrées d'index sans orphelin ni lien mort, tous les
ADR présents dans la table de `docs/REFERENCES.md`, versions documentées
conformes aux versions installées, cinq scripts de hook exécutables. Le hook de
blocage des secrets a été exercé dans les deux sens plutôt que constaté présent :
il refuse `.env` en code 2 et laisse passer `README.md` en code 0.

**L'écart, ticketé en LS-88** : aucune règle de `.claude/rules/` ne se déclenche
sur `src/lib/`, où vivent `auth.ts`, `validation.ts`, `journal.ts` et
`prisma.ts`. Une session qui édite la configuration d'authentification ne charge
donc aucune règle de domaine. Même chose pour `src/integrations/email/`, quand
`stripe/` et `mondial-relay/` sont couverts. C'est le motif d'ancrage déjà
rencontré, et `verifier-regles.sh` ne peut pas le voir : il vérifie que les
règles citent des identifiants réels, jamais que les chemins critiques sont
couverts. Rien n'a été modifié, l'arbitrage entre étendre un `paths` et créer une
règle dédiée appartient à Christophe.

**Un faux positif écarté** : `verifier-jira.sh` signale que LS-68 cite LS-50 sans
lien. Lecture faite, LS-68 exclut ce travail de son périmètre, « il devient un
test de non-régression quand LS-50 est traitée, pas avant ». Ce n'est pas une
dépendance, et le script prévient lui-même que sa détection est heuristique.
