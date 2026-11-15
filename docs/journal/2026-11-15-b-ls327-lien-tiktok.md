# 15 novembre 2026 : LS-327, lien vers le compte TikTok

## Demande

Christophe : « www.tiktok.com/@lunesoleil.fr ajoute ce lien TikTok de lune
soleil en plus du Facebook ». L'arbitrage lève la règle de LS-30, « Facebook
seul canal social officiel ». LS-30 étant close, le travail entre par un
ticket neuf, LS-327, sous l'epic LS-22.

## Fait

- `PAGE_TIKTOK` dans `src/lib/seo.ts`, seule source de l'adresse
  `https://www.tiktok.com/@lunesoleil.fr`.
- `sameAs` du JSON-LD `Organization` : Facebook puis TikTok.
- Pied de page : les deux liens réunis dans une liste, empilés, « Suivre
  l'atelier sur TikTok » sous Facebook, logo SVG décoratif en `currentColor`,
  même onglet, aucun script tiers.
- Commentaires « seul canal officiel » corrigés (`seo.ts`, pied de page,
  mentions légales) et `docs/ETAT.md`.

Aucune donnée ne part vers TikTok : c'est un lien, pas une intégration. Le
registre des traitements n'est pas touché.

## Preuves

- Test unitaire `sameAs` et test de bout en bout du lien (adresse, 44 px, sous
  Facebook sans chevauchement).
- **Mutations** : TikTok retiré du `sameAs`, le test unitaire rougit ; adresse
  du lien changée, le test de bout en bout rougit (`toHaveAttribute`).
- `page-accueil.spec.ts` aux quatre largeurs : 37 passés, axe-core et
  débordement compris. `seo.test.ts` : 50 passés.
- Rendu relu à 320 et 1280 px, survol compris.
- Types, lint, Prettier au vert.

## Reste

- Déployé le même jour, voir plus bas, avec le correctif du nocturne du
  même jour (journal `2026-11-15-a`).

## État des tickets

- LS-327 : terminé à la fusion.

## Mise en production, même jour

Sur accord de Christophe (« oui »). `0b2ca85` déployé par le workflow
« Déployer en production », run 43729435254, depuis `931b94f` : LS-327 et le
correctif du nocturne de LS-326 (journal `2026-11-15-a`) partent ensemble.
Aucune migration.

- `/`, `/catalogue`, `/panier`, `/api/sante` et `/administration/connexion` en
  200.
- Constaté sur `https://lune-soleil.fr/` : liens « Suivre l'atelier sur
  Facebook » et « Suivre l'atelier sur TikTok » dans le pied de page,
  `sameAs` du JSON-LD à deux adresses, Facebook puis TikTok.
- Non vérifié en production : le bandeau de l'administration à 768 px avec la
  session de l'exploitante ; la preuve reste la mesure DejaVu du journal
  `2026-11-15-a`.
- Issue #647 : à fermer sur le premier nocturne vert.

## Relecture finale des contenus, même jour

Contrôles rejoués en sortie 0 : `verifier-config-claude.sh --strict`,
`verifier-propagation-docs.sh`, `verifier-regles.sh`,
`verifier-registre-traitements.sh`, `verifier-taches-planifiees.sh`,
`verifier-redaction-francaise.sh`, `verifier-atteignabilite-boutique.sh`,
`verifier-tests-non-ignores.sh`. `CLAUDE.md` à 200 lignes, index mémoire à
142. Aucune mention « seul canal » ni du rappel « Ctrl K » à 768 px restée
fausse ; `CLAUDE.md`, `README.md`, les skills et les hooks n'avaient rien à
changer.

Deux écarts comblés :

- `docs/ETAT.md` comptait 1 story ouverte sous LS-7 et 2 sous LS-22. Relevé
  dans Jira : LS-291 et LS-320 sous LS-7, aucune sous LS-22, LS-35 sous LS-5.
  Écart antérieur à ce jour.
- `ls-frontend-revue` et `frontend-design.md` donnaient Verdana injecté comme
  moyen de mesure : il n'a rien reproduit sur le bandeau. Ils renvoient
  désormais au conteneur DejaVu, et l'agent signale le mot coupé sans
  débordement.
