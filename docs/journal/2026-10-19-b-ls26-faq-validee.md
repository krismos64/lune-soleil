# 19 octobre 2026 : FAQ validée par l'exploitante, LS-26 close

Validation transmise par Christophe en séance, sur la relecture de
`/aide#faq` demandée le 8 octobre. Aucun changement demandé, aucun code touché.

## Fait

Mesuré en production avant de clore, `https://lune-soleil.fr/aide`, HTTP 200 :

| Mesure | Valeur |
| --- | --- |
| questions du balisage `FAQPage` | 16 |
| délai de dépôt servi | « au plus tard 2 jours après la confirmation de votre paiement » |
| « sera précisé » | 0 |
| tiret cadratin ou demi-cadratin | 0 |

LS-26 commentée, critère par critère, puis passée à Terminé.

## Dérive corrigée

Le `README.md` affirmait « aucun ticket ouvert ne dépend plus seulement du
code », constat du 8 octobre. **LS-290**, créée le 9, le contredit : crédit de
développement sur `/informations-legales`, accord de l'exploitante obtenu, seul
l'attribut du lien reste à trancher. Phrase réécrite, comptes relevés dans Jira
le même jour : 271 terminés sur 281 hors epics, 10 non terminés, 4 En cours et
6 À faire.

## État des tickets

LS-26 close. LS-19 attend toujours l'exploitante : choix du médiateur sur le
comparatif du 3 septembre (CM2C recommandé), adhésion, puis coordonnées pour
LS-28.

## Prochaine étape

Constater le nocturne relancé (run 39311983905) et fermer #579. Côté code,
LS-290 est prête dès que Christophe tranche l'attribut du lien.
