# 1er novembre 2026 : CGV et politique de confidentialité publiées, LS-28

Objectif de Christophe : ouvrir vite. Les deux textes étaient annoncés « en
cours de rédaction » sur `/informations-legales` alors que le site encaisse en
mode réel depuis le 24 octobre.

**Arbitrage de Christophe du même jour** : rédaction par Claude d'après les
sources officielles, publication, validation par Christophe lui-même sur le
texte publié. Critère 3 de LS-28 révisé, commentaire Jira.

## Sources lues sur Légifrance le 1er novembre 2026

L111-1, L211-2, D211-2 et le modèle A de son annexe, L216-1 à L216-7,
L217-3 à L217-14, L221-5 (version du 19 juin 2026), L221-28, annexe à R221-1,
Code civil 1641, 1644 et 1648. Fermeture de la plateforme européenne de
règlement en ligne des litiges au 20 juillet 2025, lue sur le site de la
Commission : aucun lien à publier.

## Fait

- `conditions-generales.tsx` : objet, bijoux (photo portée d'illustration
  dite, ADR-047 et ADR-048), prix, commande, paiement, livraison (expédition
  sous `DELAI_EXPEDITION_JOURS_MAX`, délai légal de trente jours de L216-1,
  retard, transfert des risques), rétractation, garanties légales, service
  client, médiation, données, droit applicable.
- `politique-confidentialite.tsx` : responsable, données par finalité avec
  base et durée (reprises du registre), destinataires, droits, CNIL.
- `src/lib/textes-imposes.ts` : l'encadré de D211-2 et le formulaire type de
  R221-1, mot pour mot, source unique pour la page et l'email à venir.
- **Tunnel** : bloc « Conditions générales de vente » et lien vers `#cgv`
  au-dessus du bouton de commande. La commande enregistrait une version
  « acceptée » que le tunnel ne nommait nulle part.
- `VERSION_CGV` passe de `2026-08` à `2026-11`, première version publiée.
- Registre des traitements : Stripe et OVHcloud en T2, Backblaze dans les
  mesures, section des destinataires nommés publiquement.
- `verifier-redaction-francaise.sh` documente pourquoi `textes-imposes.ts`
  reste hors du contrôle du « nous » : le formulaire officiel écrit « Je/nous ».

## Relevé en chemin, non traité

- **L221-13** : l'email de confirmation doit joindre le formulaire type de
  rétractation. Il porte le lien vers le formulaire en ligne, pas le modèle.
- **Article 293 B du CGI affiché « abrogé par l'ordonnance n° 2025-1247 du
  17 décembre 2025, art. 9 »** sur Légifrance. La mention des factures et du
  site le cite. Date d'effet et article de remplacement non lus, ordonnance
  inaccessible (403). À vérifier avant de toucher à la mention.
- Région du compte Backblaze et entité Stripe contractante : à confirmer par
  Christophe pour la colonne des transferts hors de l'Union.

## Prochaine étape

- Christophe relit et valide les deux textes en production.
- Nocturne du 2 novembre pour LS-304.
