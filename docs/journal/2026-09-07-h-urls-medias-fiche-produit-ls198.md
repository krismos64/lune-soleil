# 7 septembre 2026, h : LS-198, deux affirmations du ticket démenties par la mesure

Le ticket posait lui-même la question de savoir si le test valait la peine. Il
la valait, mais pas pour la raison qu'il avançait.

## Ce que la mesure a démenti

**« La galerie est le seul écran à servir du 1920 px » est faux.** `urls.ts`
porte `LARGEURS_SRCSET`, qui filtre à 1280 : le 1920 est produit par le
traitement mais **aucun écran ne le référence**. La galerie emploie
`srcSetMedia` exactement comme le catalogue, donc les mêmes largeurs.

C'était l'argument principal du ticket en faveur d'un second test. S'il avait
été le seul, la conclusion aurait été de fermer la story sur un constat écrit.

**« Des vignettes en 320 que le catalogue n'exerce pas » est vrai**, et c'est le
seul trou réel. `320.jpeg` est servi par **trois** écrans, la fiche produit, le
panier et la liste d'administration, qu'aucun test ne confrontait à un code de
statut.

## Le périmètre retenu

La fiche produit sert **neuf URL**, mesurées et non supposées :

```
640.jpeg  l'image principale
320.avif 640.avif 1280.avif    le srcSet AVIF
320.webp 640.webp 1280.webp    le srcSet WebP
320.jpeg  ×2                   une vignette par photographie
```

Un test **générique** plutôt qu'une copie, comme la description le suggérait :
`urls-medias-servies.spec.ts` parcourt une table d'écrans, et en ajouter un tient
en une ligne. Six fichiers de `app/` construisent des URL de média ; recopier le
test du catalogue en aurait fermé un seul de plus.

**Le catalogue reste hors de cette table**, et ce n'est pas un oubli. Son test de
LS-187 fige un compte **exact** de sept URL, plus strict que le minimum posé ici.
Le reprendre ferait tourner deux fois la même vérification en perdant la plus
stricte des deux.

## La mutation, et pourquoi les deux premiers essais ont appris quelque chose

```
largeur 320 retirée de LARGEURS_SERVIES  ->  les deux tests rougissent
fichier retiré de public/medias/         ->  VERT, mutation annulée
fichier retiré de .next/standalone/      ->  la fiche ROUGIT en nommant l'URL
```

**Le deuxième cas est le piège.** Retirer le fichier de `public/medias/` ne
prouve rien : le `webServer` de Playwright rejoue `engendrer-medias-test.mjs`
puis `npm run build` avant chaque exécution, ce qui recrée le fichier **et** le
recopie. C'est le motif « serveur e2e réutilisé » déjà en fiche, rencontré sous
une forme nouvelle.

La cible réelle est `.next/standalone/public/`, ce que `next build` sert. En la
mutant serveur déjà lancé, le test rougit en nommant l'URL exacte :

```
Error: /medias/e2e-ls105-second/320.jpeg doit etre servi
Expected: 200
Received: 500
```

Et le catalogue reste **vert** pendant ce temps, ce qui prouve que le trou fermé
est bien celui que LS-187 laissait ouvert.

## Ce que la chaîne ne prouvera pas

**Les scénarios de bout en bout ne tournent pas sur les pull requests** depuis
LS-177, ils sont passés au contrôle nocturne. La CI verte de la PR ne dit donc
rien de ce test : c'est le nocturne qui l'exercera. Les preuves ci-dessus ont été
faites en local, sur la base de développement.

## Trois échecs préexistants, signalés

`catalogue-public.spec.ts` porte trois tests rouges **avant** ce travail, vérifié
en retirant mon fichier et en rejouant :

- deux débordements horizontaux, sur la carte avec photo et sur l'état vide
- une violation `target-size`, des cibles tactiles sous 24 px sur le catalogue

Hors périmètre de LS-198, non corrigés, non ticketés.

## État des tickets

**LS-198 LIVRÉE ET CLOSE**, PR #287 fusionnée en rebase, commit `2c209dc`.

Comptes relevés dans Jira après la fermeture, jamais recopiés : **138 tickets
terminés sur 192**. L'epic LS-3 passe à dix stories ouvertes.

## Prochaine étape

**LS-200**, le raccordement de l'API Sendcloud, qui attend les clés de
Christophe.
