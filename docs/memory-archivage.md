# Archiver la mémoire quand l'index approche son plafond

`verifier-config-claude.sh` renvoie ici quand `MEMORY.md` approche son plafond.
Cette page dit quoi faire, et surtout ce qu'il ne faut pas faire.

**Le seuil se lit dans le script, jamais ici.** Cette page a porté « 180 lignes »
pendant quelques heures, valeur d'une première version abandonnée le jour même :
un seuil recopié dans un document diverge de celui qui agit.

```bash
grep -n "lignes_index. -gt" scripts/verifier-config-claude.sh
```

## Pourquoi un plafond

Claude Code lit `MEMORY.md` au démarrage dans la limite de **200 lignes et
25 Ko**. Ces deux valeurs viennent du produit, elles ne se configurent pas :
aucun réglage de `settings.json`, aucune variable d'environnement.

**Le dépassement est silencieux.** Tout ce qui suit la limite est ignoré sans
message. Une mémoire que l'on croit chargée ne l'est plus qu'en partie, et ce
sont les dernières entrées de l'index qui disparaissent.

Mesuré le 12 septembre 2026 : l'index avait atteint **454 lignes et 67 Ko**,
près du triple du plafond. Les entrées passé la 200e étaient invisibles depuis
des semaines sans que rien ne le signale.

## Ce que l'archivage n'est pas

**Rien n'est supprimé.** Une fiche archivée part dans `memory/archive/`, où elle
reste lisible par `grep -rl`. `CLAUDE.md` porte la consigne d'y chercher avant
de conclure qu'un piège est inconnu, et une fiche qui ressert remonte dans
l'index.

Ce point compte au moment de trancher : hésiter à archiver parce qu'on croit
détruire conduit à tout garder. Lors du tri du 12 septembre, une première passe
menée sans cette précision n'a sorti que 18 % des fiches, avec une dispersion de
1 % à 35 % selon les lots ; la même consigne enrichie de « rien n'est supprimé »
et d'une cible chiffrée a produit un tri régulier.

## Ce qui sort de l'index

- l'incident daté et ponctuel déjà corrigé : une variable, un chemin, une
  config, une version d'outil, un compte ouvert, un workflow réparé
- le motif désormais attrapé par un contrôle du dépôt ou par le typage. Le
  contrôle devient la trace, la fiche n'a plus à être rappelée
- le cas particulier d'un motif général couvert par une autre fiche. Garder la
  générale, archiver la particulière
- l'état à une date, « au 8 septembre X n'existe pas encore », qui décrit une
  situation et non une règle
- ce qui est spécifique à un ticket livré dont la leçon ne se rejouera pas

## Ce qui reste

- la règle de conduite permanente : rédaction, sécurité, secrets, traçabilité,
  autonomie. Elle est rarement citée par d'autres fiches, ce qui ne dit rien de
  son utilité
- la décision ou l'arbitrage en vigueur, commercial, juridique, d'architecture
- la contrainte d'outil toujours vraie et non évidente
- le piège ouvert qu'aucun contrôle ne ferme et qui peut se reproduire sur
  n'importe quelle story
- le motif méthodologique général, dans sa formulation la plus large
- toute fiche de type `user` ou `reference`
- les fiches les plus citées, qui structurent le graphe de renvois

## La procédure

**1. Mesurer plutôt que supposer.**

```bash
MEM=~/.claude/projects/-Users-chris-Documents-sites-lune-soleil/memory
wc -l "$MEM/MEMORY.md"          # plafond 200
wc -c "$MEM/MEMORY.md"          # plafond 25000
ls "$MEM"/*.md | grep -vc MEMORY.md
```

**2. Protéger d'office** les fiches de type `user` et `reference`, et les
vingt-cinq les plus citées :

```bash
cd "$MEM" && grep -oh '\[\[[a-z0-9-]*\]\]' *.md | tr -d '[]' \
  | sort | uniq -c | sort -rn | head -25
```

**3. Trier par lots** d'environ 65 fiches, en lisant les frontmatters groupés.
Donner une **cible chiffrée** par lot : sans elle, le tri reste trop prudent et
n'atteint pas le plafond.

**4. Sauvegarder avant de déplacer.**

```bash
tar -czf ~/sauvegardes-lune-soleil/memory-avant-archivage-$(date +%Y%m%d-%H%M%S).tar.gz -C "$MEM" .
```

**5. Déplacer, puis reconstruire l'index** en ne gardant que les lignes dont le
fichier cible est encore à la racine.

**6. Vérifier dans les deux sens**, aucune fiche de la racine hors de l'index,
aucune ligne d'index sans fiche, puis `./scripts/verifier-config-claude.sh`.

## Le piège de l'index trop court

Un index réduit aux **seuls noms de fichiers** pèse encore environ 15,5 Ko pour
200 fiches. La marge pour les accroches est donc d'à peine 9 Ko, soit une
quarantaine de caractères par ligne.

**Une accroche tronquée en plein mot ne vaut rien** : « à lire en », « travailler
sans » n'aident à décider d'ouvrir aucune fiche. Couper à une frontière de sens,
virgule ou fin de proposition, et quand la première proposition dépasse quarante
caractères, **ne garder que le titre**. Un titre explicite informe mieux qu'une
phrase amputée.

## Ce que le contrôle ne fait pas

`verifier-config-claude.sh` **mesure et alerte, il n'archive pas**. Décider qu'un
motif est clos, qu'une fiche en double une autre ou qu'un piège ne se rejouera
plus demande de lire : aucune règle mécanique ne le fait sans se tromper.

Le tri reste donc un geste de session, déclenché par l'alerte à 180 lignes.

## Les liens vers l'archive restent valides

Le contrôle accepte une cible dans `archive/` : un renvoi `[[...]]` vers une
fiche archivée n'est pas un lien mort, la fiche existe toujours. Réécrire ces
liens serait la mauvaise réponse, ils sont justes.

Éprouvé par mutation le 12 septembre 2026 : en retirant cette tolérance, le
contrôle lève **146 anomalies** sur des liens parfaitement valides.
