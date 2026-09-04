# 4 septembre 2026, session C : la pull request raccourcie, LS-177

Livrée, PR #223, commit `22aaea2`. Trois contrôles longs quittent la pull request
pour un contrôle nocturne. **Cette story réduit délibérément la couverture avant
fusion**, ce qui la distingue de LS-176 livrée le matin même.

## Le point de départ

Christophe : « la PR de code est beaucoup trop longue à chaque fois dans la
journée, je suis seul développeur et cela me fait perdre beaucoup de temps ».
Sa proposition, déclencher les tests une fois par jour, est retenue pour ce qui
peut l'être et refusée pour ce qui bloquerait les fusions.

## Ce qui est livré

Trois contrôles passent dans `nocturne.yml`, rejoué chaque nuit à 2 h UTC et
déclenchable à la main :

| Contrôle | Coût retiré |
| --- | --- |
| Scénarios de bout en bout, trois largeurs | 5 min 32 |
| `npm audit` | 4 min 37 |
| Construction de l'image Docker | 3 min 25 |

**Il ouvre une issue en cas d'échec**, étiquette `controle-nocturne`, une seule à
la fois. Sans cela, déplacer ces contrôles reviendrait à les supprimer : personne
ne consulte l'onglet Actions d'un workflow planifié.

**Il ne bloque aucune fusion**, et ce n'est pas un oubli. Son rouge dit « un
défaut est entré hier », pas « ne pas fusionner ». Même raison que
`derive-documentation.yml` : un rouge ambigu s'apprend à ignorer.

## La mesure, et l'écart avec ce qui avait été annoncé

| Run | Durée |
| --- | --- |
| Avant, PR #221 | 24 min 09 |
| Après, PR #223 | **14 min 02** |

**J'avais annoncé onze minutes.** L'écart ne vient pas de la story : `npm ci` a
pris **335 s** sur ce run contre 19 s sur le précédent, variance du registre npm
déjà mesurée le matin. Sans elle, la pull request aurait duré environ 8 min 30.

Les trois contrôles déplacés ont bien disparu du relevé des étapes.

## Ce qui reste vérifié avant fusion

**Le jalon de `CLAUDE.md` vit dans les tests d'intégration**, pas dans la suite
Playwright : `parcours-complet.sequential.test.ts` traverse panier, commande,
réservation, paiement, événement signé, confirmation et administration. Vérifié
avant d'arbitrer, et non supposé.

Les tests d'intégration ne bougent pas, réservation et concurrence comprises.
L'exigence « ne se contourne jamais » est tenue.

**Ce qui part au nocturne est l'interface** : seize tests du tunnel d'achat,
quatre de la confirmation, plus le catalogue, l'administration et l'espace
client. Un débordement à 320 px peut donc entrer sur `main` et n'être vu que le
lendemain, défauts déjà rencontrés en LS-171 et LS-162.

Acceptable tant que la boutique n'est pas ouverte. **Porté dans LS-153** comme
point à reconsidérer avant le Go-Live, avec les trois options possibles écrites.

## Un trou de sécurité fermé en chemin

En retirant la construction de l'image des pull requests, un défaut est apparu :
**`publier-image.yml` publiait sur GHCR, registre public, PUIS vérifiait les
couches**. Une image portant un `.env` était donc publiée avant qu'aucun contrôle
ne l'examine, invariant 9, et une image publiée ne se dérappelle pas.

**Le pas des pull requests servait de barrière sans que ce soit son rôle
déclaré.** Le retirer sans rien faire d'autre aurait ouvert la fenêtre, et le
défaut n'était visible qu'au moment de ce retrait.

Arbitrage de Christophe : corriger l'ordre plutôt que reporter. Le workflow
construit avec `load: true`, vérifie, puis publie. L'image vérifiée porte la même
empreinte que celle publiée, ce qui lève l'objection qui justifiait l'ordre
inverse. Vérifié via Context7.

## Le garde-fou de LS-176 a servi le lendemain de son écriture

Après le déplacement de `npm audit`, `verifier-verdict-audit.sh` a échoué : « le
motif de reconnaissance de panne est absent du workflow ». Sans lui, ce script
serait resté **vert** en éprouvant une décision que plus aucun workflow
n'appliquait.

Le contrôle pointe désormais `nocturne.yml`, tout en restant exécuté dans
`controles.yml` : purement textuel, il doit rougir avant fusion si quelqu'un
affaiblit la distinction panne / vulnérabilité.

## Un levier abandonné, mon analyse était fausse

J'avais proposé de paralléliser « les 33 fichiers d'intégration qui ne mesurent
aucune concurrence », gain annoncé de trois à quatre minutes.

**La sérialisation ne vient pas de la concurrence, elle vient de la base.**
`preparation-globale.ts` crée **une seule base éphémère** partagée par les 49
fichiers : deux fichiers parallèles s'y pollueraient. Le comptage des fichiers
concurrents ne décrivait pas ce qui empêche la parallélisation.

Détail relevé au passage : le suffixe `.sequential.` que portent les 49 fichiers
n'est employé nulle part dans la configuration. C'est une convention décorative,
pas un mécanisme.

Décision de Christophe : « on ne prend pas le risque ». LS-168 est déjà ouverte
sur une suite instable, en ouvrir une seconde source pour trois minutes est un
mauvais échange. Le levier est écarté, pas reporté : s'il ressort, il partira
d'une analyse neuve.

## Vérifications

| Contrôle | Résultat |
| --- | --- |
| `verifier-verdict-audit.sh` | 7 cas, vert après correction du chemin |
| `verifier-decision-suite.sh` | 24 cas, vert |
| `verifier-protection-branche.sh` | 3 réglages, vert |
| `verifier-config-claude.sh` | code 0 |
| `prettier --check` | vert |
| YAML des trois workflows | validés, 20, 37 et 7 étapes |

Le contrôle nocturne a été **déclenché à la main** après la fusion : un workflow
jamais exécuté n'est pas un workflow prouvé.

## État des tickets

**LS-177 est livrée**, sept critères sur huit remplis. Le critère 2 est sans
objet, la parallélisation étant abandonnée. Le critère 1, « sous douze minutes »,
est tenu en régime nominal mais pas garanti un jour où le registre npm rame.

## Prochaine étape

Mesurer le nouveau régime sur quelques livraisons. Côté code sans dépendance
externe : **LS-137**, le référencement technique, et **LS-147**, l'identité du
site au partage.
