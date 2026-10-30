# 30 octobre 2026 : l'adresse email vérifiée s'annonce, LS-298

Demande de la recette du 29 octobre : le lien de vérification fonctionnait,
mais rien ne disait que l'adresse était vérifiée.

## Cause

Lue dans la source de Better Auth 1.7.14 (`sign-up.mjs`,
`email-verification.mjs`). L'inscription appelait `signUp.email` sans
`callbackURL` : le premier lien reçu ramenait à `/`, l'accueil, sans un mot.
Seul le lien renvoyé depuis `/compte/verification` atteignait l'accusé posé par
LS-54. Succès et échec arrivent sur la même adresse, l'échec avec
`error=<code>`, que l'écran ignorait : un compte déjà vérifié qui recliquait un
lien expiré lisait « confirmée ».

## Fait

- `src/lib/retour-verification-email.ts` : `RETOUR_APRES_VERIFICATION`, partagé
  par l'inscription et le renvoi, et `issueVerification`, où l'erreur prime.
- Accusé « Adresse email vérifiée. » en région live nommée, sur `/compte` et,
  lien ouvert sans session, sur la connexion. La redirection ne transporte que
  des codes fixes, jamais la valeur reçue.
- `history.replaceState` retire `verifie`, `email` et `error` : rien ne revient
  au rechargement.
- Même défaut corrigé sur `?email=1&error=` : un changement d'adresse en échec
  annonçait « nouvelle adresse confirmée ».

**`ls-frontend-revue`**, trois défauts corrigés : l'accusé touchait le
formulaire de connexion, l'échec du changement d'adresse était muet, une phrase
renvoyait vers l'écran déjà affiché. Elle affirmait aussi que la CI ne lançait
pas `format:check` : c'était faux, le contrôle a rougi sur le test unitaire et
le formatage a été corrigé avant fusion.

## Preuves

```
npm run test        119 fichiers, 1888 tests verts
playwright          compte-* et email-verifie-ls298 : 459 passed,
                    9 skipped conditionnels existants
```

Neuf mutations détectées : inscription sans retour, erreur ignorée, succès
malgré la base, paramètres jamais retirés, issue perdue à la redirection, région
sans nom, changement d'adresse sans garde, marge retirée, échec de changement
muet. Trois essais n'étaient pas des verdicts : deux mutations ne compilaient
pas (comparaison sans recouvrement de types, refusée par le build) et une
troisième, `issue !== issue`, ne changeait aucun chemin testé.

Déployé `57b8ab3`, sans migration. En production, `/compte?verifie=1` sans
session rend 307 vers la connexion, qui affiche l'accusé.

## Hors périmètre

**LS-301** : un appareil connecté au compte A qui ouvre le lien du compte B lit
« Adresse email vérifiée », Better Auth ne comparant pas la session à l'adresse
sur une vérification simple. Aucune conséquence de sécurité, priorité basse.

## Prochaine étape

LS-302 : restructurer le `README.md`, façade courte et détail dans `docs/`,
plan validé par Christophe le 30 octobre 2026.

## État des tickets

- **LS-298** close
- **LS-301** ouverte
