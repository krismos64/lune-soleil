# 22 novembre 2026 : LS-334, les délais d'acheminement d'ADR-035 affichés

## Demande

Christophe, sur LS-291 : « pas de profil Vinted », puis « oui, vas-y pour les
délais de livraison, jours ouvrés ». Story **LS-334** créée sous LS-5, découpée
du commentaire de LS-291 du 7 novembre (alerte `deliveryTime` de la Search
Console). LS-291 commentée : profil Vinted écarté, piste 6 recommandée à
écarter, pistes 4 et 5 à trancher vers le 13 décembre.

## Constat

ADR-035 exige d'annoncer 2 à 4 jours en point de retrait et 4 à 6 à domicile,
« au tunnel et sur la page Livraison ». Aucun texte de `src/` ne les affichait.
Deux commentaires du code refusaient même de le faire, « faute de source
vérifiée » (`aide/page.tsx`, `questions-frequentes.ts`, 8 octobre 2026).

## Source des chiffres, vérifiée avant de coder

- ADR-035 ne cite aucune source pour ses délais : ses sources ne portent que
  les tarifs.
- mondialrelay.fr et l'aide de Sendcloud refusent la lecture automatique (403),
  la page Mondial Relay de Sendcloud ne donne aucun délai.
- **Production, lecture seule** (`BEGIN READ ONLY`, mode et dates seulement) :
  trois colis livrés, un Point Relais et deux Lockers, **trois jours ouvrés
  chacun**. Aucun colis livré à domicile.

Question posée à Christophe : vérifier le domicile dans Sendcloud, garder 4 à
6, ou n'afficher que le point de retrait. **Réponse : garder 4 à 6, risque
accepté.** Tracé dans l'amendement d'ADR-035 et dans le commentaire de la
constante.

## Fait

- `src/lib/livraison.ts` : `DELAI_ACHEMINEMENT_JOURS_OUVRES` par mode et
  `libelleDelaiAcheminement`, source unique ; commentaire de
  `DELAI_EXPEDITION_JOURS_MAX` corrigé.
- Tunnel, étape du mode : chaque option porte son délai sous son nom.
  `aria-labelledby` garde le nom « À domicile », `aria-describedby` lit le
  délai.
- `/aide` et réponse `faq-delai-expedition` : les deux délais après celui
  d'expédition.
- JSON-LD : `deliveryTime` par `OfferShippingDetails`, préparation de 0 à
  `DELAI_EXPEDITION_JOURS_MAX`, acheminement du mode, `unitCode` `DAY`,
  `businessDays` du lundi au vendredi. Le lundi au vendredi ne peut
  qu'allonger l'estimation, l'atelier expédiant aussi le week-end.
- Tests mis à jour : deux tests encodaient l'ancienne règle « aucun délai
  d'acheminement » (FAQ unitaire, `/aide` en bout en bout) ; ils exigent
  désormais les deux délais et refusent toujours tout autre chiffre.
  Instantané d'accessibilité du tunnel mis à jour.
- Documentation : amendement d'ADR-035, `REFERENCES.md`, `PARCOURS.md`
  étape 3b, `frontend-design.md` (table de réassurance), compte de
  `INTEGRATION-CONTINUE.md` porté à 227.

## Preuves

- Unitaires : `livraison.test.ts` et `seo.test.ts`, 81 tests ;
  `questions-frequentes.test.ts`, 10 tests.
- Bout en bout : cinq fichiers (tunnel, informations légales, mentions de
  rétractation, sous-total, aide), **213 passés aux quatre largeurs**.
- Rendu relu à 320 px : option domicile et note de `/aide`, sans débordement.
- Trois mutations au script central, chacune rouge sur son test, appliquées à
  la main avec la même expression : délai retiré du JSON-LD, domicile au délai
  du relais, description détachée du bouton radio (« Received: "" »).
  `verifier-mutations-a-sec.sh` : 235 expressions, aucune périmée.
- Types, lint, format ; `npm run test` : 130 fichiers, 2 113 tests ;
  `verifier-regles.sh`, `verifier-redaction-francaise.sh`,
  `verifier-contraste.sh` au vert.
- `ls-frontend-revue` : aucun défaut. Elle relève que l'option Point Relais
  n'est rendue dans aucun test, Sendcloud étant absent en bout en bout.

## Dérive

Une phrase non mesurée (« coupait le délai au milieu du chiffre ») est entrée
dans un commentaire CSS, retirée avant le commit.

## Mise en production, même jour

PR #705 fusionnée en rebase, `da9665a`, image publiée, déployée par le workflow
« Déployer en production », run 45035609779. Aucune migration.

Contrôle en production :

- JSON-LD de `boucles-d-oreilles-bonhommes-de-neige-pailletes` : `transitTime`
  2 à 4 pour le relais (4,10 €), 4 à 6 pour le domicile (7,49 €),
  `handlingTime` 0 à 2, `businessDays` du lundi au vendredi.
- `/aide` : la phrase des deux délais est servie, page et FAQ.
- Tunnel à 320 px, navigateur sans affichage, arrêté au choix du mode (les
  étapes 1 à 3 n'écrivent que des cookies) : Point Relais et Locker « 2 à 4
  jours ouvrés », domicile « 4 à 6 », débordement 0. C'est le premier rendu de
  l'option Point Relais, qu'aucun test ne voit.

## Nocturne 112 en échec, trouvé à la vérification de fin de session

Issue #704, ouverte à 11:16 UTC sur le nocturne du matin (commit `11e5034`,
avant LS-334). Étape « Preuves par mutation lourdes » :
`ECHEC src/repositories/promotion.ts est mute mais absent de MUTABLES`. Le cas
ajouté par LS-333 le 21 novembre mute `$DEPOT_PROMOTION` sans l'avoir inscrit
dans la liste : la garde du script l'arrête là, et **tous les cas suivants se
taisent**, dont celui de LS-320 et les trois de LS-334.

Le contrôle à sec, qui tourne à chaque PR, ne le voyait pas : il vérifiait
qu'une expression modifie son fichier, jamais que ce fichier soit restauré.

- `DEPOT_PROMOTION` ajoutée à `MUTABLES`.
- `verifier-mutations-a-sec.sh` exige désormais que tout fichier muté figure
  dans `MUTABLES`. Rejoué sur le dépôt d'avant la correction, il désigne cette
  seule variable (`verifier-tests-mutation.sh:3184`), et passe au vert après.
- Sa preuve par mutation gagne le cas « fichier mute absent de MUTABLES » :
  7 mutations, 7 détectées.
- `PREUVES-PAR-MUTATION.md` et `VERIFICATION.md` mis à jour.

L'issue #704 reste ouverte jusqu'à un nocturne vert, relancé à la main après
la fusion.

## Prochaine étape

Nocturne relancé après la fusion du correctif : fermer #704 s'il est vert, le
premier à exercer les cas de LS-320 et LS-334. Search Console : « Valider la
correction » sur l'alerte `deliveryTime`. LS-291,
pistes 4 et 5, vers le 13 décembre. Remesurer le délai à domicile sur les
premières livraisons.

## État des tickets

- LS-334 : terminée, déployée, contrôlée en production.
- LS-291 : ouverte, pistes 4 et 5 vers le 13 décembre.
- Ouverts dans Jira : LS-291, LS-35.
