# 1er novembre 2026 : motif d'un avis écarté, note effacée, contact annoncé, LS-306

Seconde relecture externe des mentions légales, transmise par Christophe,
confrontée à Légifrance : D111-9 à D111-12, versions en vigueur depuis le
9 juillet 2024, lues le jour même (les deux premières adresses tentées
rendaient 404).

## Verdicts

| Point soulevé | Verdict |
| --- | --- |
| la note gardée après un retrait reste une donnée personnelle | **exact** : reliée à la commande, sans finalité |
| « sans limite de durée » pour un avis publié | **partiel** : l'article 13 admet un critère, il existe, ADR-028 inchangé |
| les cinq ans doivent répondre à un besoin documenté | **déjà fait** dans ADR-049, finalité désormais écrite sur la page |
| dire si l'atelier peut contacter l'auteur | **exact**, D111-11 2° |
| les délais sont-ils appliqués ? | oui, LS-305 en production |

**Trouvé en vérifiant, plus grave** : D111-12 impose d'informer l'auteur des
motifs d'un refus. Aucun email ne partait, l'espace client n'affichait pas le
motif, un auteur sans compte n'était prévenu de rien, et la page affirmait le
contraire.

**Arbitrage de Christophe** : faire les trois, formulation du contact retenue,
« L'atelier peut vous écrire, à l'adresse email de votre commande, pour vérifier
un avis avant de le publier. »

## Fait

- **Email `avis-non-publie`** : refus ou retrait par l'atelier, motif recopié,
  adresse de la commande, déposé dans la transaction de la décision
  (`modererAvis` devient transactionnelle), `commandeId: null`. Point 13 des
  transactions critiques. L'écran de modération dit que le motif est envoyé.
- **Note effacée** au retrait et à la purge : `Avis.note` nullable, migration
  `20261101170000_avis_note_effacee` (`DROP NOT NULL`, mise à jour des avis déjà
  effacés, contrainte d'équivalence `chk_avis_note_selon_effacement`). Les
  lectures publiques écartent une note nulle, l'administration affiche « Avis
  effacé ». ADR-049 amendé.
- Page légale : information du motif, phrase de contact, ce qui reste après un
  retrait, finalité des cinq ans. `legal.md` porte D111-11 et D111-12.

## Vérifié

- `db:verifier` : 139 réussites, les deux sens de la nouvelle contrainte.
- Intégration : `retrait-avis`, seize cas, dont refus sans compte, retrait,
  publication avec motif saisi, refus sans motif, avis effacé non modérable.
- **Mutation** : envoi supprimé, note gardée, décision mal nommée, tous vus. La
  mutation « envoi aussi sur publication » est d'abord **restée verte** : le
  test publiait sans motif, alors que le formulaire envoie le champ avec la
  publication. Test durci, la mutation rougit.

## Prochaine étape

- Migration de production, puis déploiement.
- Nocturne du 2 novembre pour LS-304.
