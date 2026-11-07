# 7 novembre 2026 : une passkey ne s'enregistre plus sans preuve récente, LS-295

## Le défaut

Les routes de passkey de Better Auth 1.7 ne demandaient qu'une session de moins
de vingt-quatre heures, cliente comprise. Un intrus muni d'un cookie volé
enregistrait son propre authentificateur, se reconnectait avec, et la session
neuve passait `prouverIdentiteParPasskey` (soixante secondes) : la
réauthentification du remboursement tombait sans aucun secret. Trouvé par la
revue de LS-294 le 29 octobre, arbitré « après l'ouverture ».

## Fait

- **Garde sur la route HTTP**, `src/lib/hook-preuve-passkey.ts`, dans le hook
  `before` : `generate-register-options`, `verify-registration` et
  `delete-passkey` exigent le rôle `ADMINISTRATRICE` et une preuve de moins de
  quinze minutes sur **cette** session, relus en base par
  `deciderChangementIdentifiants` (`services/reauthentification.ts`). Refus
  403 avec code, `lib/codes-passkey.ts`. Sans session lisible, 401.
- **Écran `/administration/passkeys`** : sans preuve, « Confirmer mon
  identité » vers `/administration/reauthentification?retour=passkeys` à la
  place de l'ajout et des retraits ; si la preuve expire écran ouvert, bascule
  avec le focus sur l'explication.
- **Règle des soixante secondes gardée**, justifiée par écrit dans
  `preuve-identite.ts` : une session neuve ne s'ouvre plus que par un secret.
  Le commentaire faux est corrigé.
- **ADR-027 amendé** (décision 3 : enregistrer et retirer une passkey,
  renommer libre), `securite.md`, `REFERENCES.md`,
  `SEANCE-AMORCAGE-EXPLOITANTE.md` (l'amorçage passe désormais par la
  confirmation d'identité par mot de passe).

## Ce qui a dérapé, et ce que la mesure a trouvé

1. **Composer deux middlewares en s'appelant casse tout.** Le premier
   câblage appelait `hookRevocationSessions(ctx)` depuis le hook composé :
   l'enveloppe de `createAuthMiddleware` rend `{ headers }`, que Better Auth
   prend pour une réponse finale. Toutes les routes, connexion comprise,
   répondaient `200 {"headers":{}}`. Vu par la sonde avant tout commit,
   corrigé en extrayant `imposerChampsDeCorps`, fonction ordinaire.
2. **La revue critique a trouvé un défaut de LS-167** dont la règle des
   soixante secondes dépendait : `session-verification.ts` jugeait « déjà
   connecté » sur le **nom** du cookie. Un cookie forgé au bon nom laissait le
   lien de changement d'adresse ouvrir une session, donc une preuve.
   Désormais la décision compare la session **validée** par Better Auth à la
   session posée. Trois tests rouges avant, verts après.
3. **Garde ouverte en cas de panne** : `getSessionFromCtx` avale ses erreurs,
   la route relisait la session. La garde refuse désormais en 401.
4. **Revue d'interface** : la bascule « preuve expirée » n'était pas annoncée
   et perdait le focus. Corrigé, deux tests de composant.
5. **Course préexistante dans `passkeys-administration.spec.ts`** : les quatre
   largeurs partageaient l'identifiant de la passkey de contrôle. Une par
   largeur désormais, stable sur répétitions.
6. `session-verification.sequential.test.ts` ne vidait pas `rate_limit` : le
   sixième test de la minute recevait un 429. Corrigé.

## Preuves

- Intégration : 9 cas sur les routes réelles (`auth.handler`), 3 sur le
  cookie forgé ; composant : 6 cas ; e2e des passkeys verte aux quatre
  largeurs, captures sans preuve à 320, 768, 1280 px, axe-core sans violation.
- Mutations : cinq ajoutées à `verifier-tests-mutation.sh` (garde retirée,
  fraîcheur, rôle, retrait, cookie de session neuve), chacune rougie à la
  main avant inscription ; `verifier-mutations-a-sec.sh` vert.
- Suite Vitest complète : verte une fois, puis deux échecs dans
  `catalogue` et `rattachement-commandes`, fichiers non touchés, verts trois
  fois en isolé : instabilité de la base partagée, à surveiller en CI.

## Hors LS-295, relevé dans la journée

- Email Search Console, `deliveryTime` manquant : ADR-035 a décidé des délais
  d'acheminement (2 à 4 jours en retrait, 4 à 6 à domicile) à afficher au
  tunnel et sur la page Livraison, **jamais codés**. Commenté dans LS-291.

## Prochaine étape

- Déployer LS-295 par le workflow « Déployer en production » (aucune
  migration), puis vérifier `/administration/passkeys` en production.
- LS-291 : appliquer ADR-035 sur les délais, après vérification de L111-1 et
  L216-1 sur Légifrance.

## État des tickets

LS-295 en cours jusqu'à la fusion et au déploiement. Ouverts : LS-291, LS-35.
