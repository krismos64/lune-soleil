# Registre des activités de traitement

Registre du responsable de traitement, article 30 paragraphe 1 du RGPD. Il
recense les traitements de données personnelles mis en oeuvre par la boutique
Lune & Soleil, leurs finalités, les catégories de données, les durées de
conservation et leur base légale.

**Valeurs vérifiées aux sources officielles le 12 août 2026.** Le cahier des
charges interdit de décider d'une obligation juridique : chaque durée citée ici
vient d'un texte ou d'une recommandation publiée, jamais d'une appréciation. Ne
pas les modifier sans nouvelle vérification aux sources.

## Ce que ce document n'est pas

Trois confusions à écarter, parce qu'elles conduiraient à publier un document
interne ou à croire une obligation remplie alors qu'elle ne l'est pas.

**Ce n'est pas la politique de confidentialité.** Celle-ci est un texte public
adressé aux clients, rédigé dans leur langage, et porte les mentions des
articles 13 et 14 du RGPD, dont les droits d'accès, de rectification et
d'effacement. Le registre est un document interne, tenu pour l'autorité de
contrôle. Les deux ne se substituent pas.

**Ce ne sont pas les mentions légales**, qui relèvent de l'article 6 de la loi
pour la confiance dans l'économie numérique et portent l'identité de
l'exploitante, l'hébergeur et les coordonnées de contact.

**Ce n'est pas une analyse d'impact** au sens de l'article 35. Aucun traitement
recensé ici ne porte de donnée sensible au sens de l'article 9, ni de profilage,
ni de surveillance systématique à grande échelle.

## Pourquoi ce registre est obligatoire ici

L'article 30 paragraphe 5 dispense les organismes de moins de 250 salariés de
tenir un registre, **sauf** dans trois cas, dont il suffit qu'un seul soit
rempli. Deux le sont :

- **le traitement n'est pas occasionnel** : la gestion des comptes clients et des
  commandes est l'activité même de la boutique, exercée en continu
- **le traitement est susceptible de comporter un risque pour les droits et
  libertés des personnes** : le journal des connexions concentre adresses IP et
  habitudes de connexion, ce qu'ADR-027 énonce déjà comme un risque assumé

La dispense ne s'applique donc pas, et ce n'est pas un choix de prudence : la
condition d'exclusion est objectivement remplie.

## Responsable du traitement

| Champ | Valeur |
|---|---|
| Responsable | l'exploitante de la boutique Lune & Soleil |
| Coordonnées | portées par les mentions légales, hors dépôt, données personnelles |
| Délégué à la protection des données | aucun, la désignation n'étant pas obligatoire au titre de l'article 37 |
| Responsable conjoint | aucun |
| Représentant | sans objet, établissement en France |

Les coordonnées nominatives vivent **hors du dépôt**, qui est public. Le registre
tel qu'il est communiqué à l'autorité de contrôle les porte en tête.

## Les traitements

Neuf traitements, chacun rattaché aux tables qui le portent. La colonne
« tables » est ce que le contrôle automatique confronte au schéma.

### T1, gestion des comptes clients et du compte d'administration

| Champ | Valeur |
|---|---|
| Finalité | permettre la création d'un compte, l'authentification et l'accès à l'espace client |
| Personnes concernées | clients titulaires d'un compte, exploitante |
| Catégories de données | adresse email, nom, rôle, empreinte du mot de passe, clé publique de passkey, nom d'appareil, jetons de session, adresse IP et navigateur de session |
| Tables | `Utilisateur`, `Session`, `Compte`, `Passkey`, `Verification` |
| Base légale | exécution du contrat, article 6.1.b, pour un compte client ; intérêt légitime, article 6.1.f, pour le compte d'administration |
| Conservation | jusqu'à la suppression du compte. Compte inactif : suppression au bout de deux ans, référentiel CNIL n° 2021-131. Jetons de vérification : jusqu'à leur expiration |
| Destinataires | l'exploitante seule. Aucun sous-traitant, l'authentification étant hébergée avec l'application |
| Transfert hors UE | aucun |

**Le mot de passe n'est jamais stocké en clair**, seule son empreinte l'est,
invariant 9. Une passkey ne porte qu'une clé publique, qui n'ouvre rien seule.

### T2, gestion des commandes et de la relation client

| Champ | Valeur |
|---|---|
| Finalité | enregistrer une commande, la préparer, informer le client de son avancement |
| Personnes concernées | clients, avec ou sans compte |
| Catégories de données | nom, adresse email, téléphone, adresses de livraison et de facturation figées, contenu et montant de la commande, historique des statuts |
| Tables | `Commande`, `LigneCommande`, `HistoriqueStatut` |
| Base légale | exécution du contrat, article 6.1.b |
| Conservation | trois ans à compter de la fin de la relation commerciale, référentiel CNIL n° 2021-131, puis archivage jusqu'à l'expiration des délais de prescription et des obligations comptables, voir T5 |
| Destinataires | l'exploitante, le transporteur pour l'adresse de livraison, le prestataire de paiement pour le montant |
| Transfert hors UE | aucun |

**L'achat sans compte est possible** : `Commande.utilisateurId` est nullable. Une
commande survit à la suppression du compte, en `SET NULL`, l'obligation
comptable primant sur l'effacement, voir T5.

### T3, carnet d'adresses

| Champ | Valeur |
|---|---|
| Finalité | éviter au client de ressaisir son adresse à chaque commande |
| Personnes concernées | clients titulaires d'un compte |
| Catégories de données | libellé, nom complet, adresse postale, téléphone |
| Tables | `AdresseCarnet` |
| Base légale | exécution du contrat, article 6.1.b |
| Conservation | jusqu'à la suppression de l'adresse par le client, et au plus tard à la suppression du compte, en `CASCADE` |
| Destinataires | l'exploitante seule |
| Transfert hors UE | aucun |

Une adresse du carnet est **copiée** sur la commande au moment de l'achat,
invariant 3. Supprimer l'adresse du carnet ne modifie donc aucune commande
passée, et c'est voulu. La suppression du compte emporte le carnet, en cascade.

### T4, expédition et suivi des colis

| Champ | Valeur |
|---|---|
| Finalité | remettre le colis au client et lui permettre de suivre son acheminement |
| Personnes concernées | clients destinataires d'une commande |
| Catégories de données | nom et adresse du destinataire transmis au transporteur, numéro de suivi, point de retrait choisi, statuts d'acheminement |
| Tables | `Expedition` |
| Base légale | exécution du contrat, article 6.1.b |
| Conservation | avec la commande qu'elle sert, voir T2 |
| Destinataires | **Mondial Relay**, sous-traitant au sens de l'article 28, pour le nom, l'adresse et le point de retrait |
| Transfert hors UE | aucun, ADR-025 retenant Mondial Relay Start en France métropolitaine |

### T5, facturation et obligations comptables

| Champ | Valeur |
|---|---|
| Finalité | émettre les factures et avoirs, et satisfaire aux obligations comptables et fiscales |
| Personnes concernées | clients ayant passé commande |
| Catégories de données | instantané légal figé, portant nom, adresses, contenu et montants |
| Tables | `Facture`, `Avoir`, `Paiement`, `EvenementFournisseur`, `IntentionRemboursement` |
| Base légale | obligation légale, article 6.1.c, article L123-22 du code de commerce |
| Conservation | **dix ans**, article L123-22 du code de commerce |
| Destinataires | l'exploitante, l'expert-comptable le cas échéant, l'administration fiscale sur demande |
| Transfert hors UE | aucun |

**Cette durée prime sur une demande d'effacement.** Une facture n'est jamais
modifiée ni supprimée, invariant 4 : une correction produit un avoir. Le droit à
l'effacement de l'article 17 ne s'applique pas aux données dont la conservation
est imposée par la loi, ce que prévoit son paragraphe 3 point b.

Les données du prestataire de paiement transitent par `EvenementFournisseur`, qui
stocke la charge utile de l'événement signé. Elle peut porter le nom du payeur et
les quatre derniers chiffres de la carte. **Aucun numéro de carte complet n'est
jamais stocké**, le paiement étant délégué au prestataire.

**`IntentionRemboursement`, ajoutée par LS-128, est rattachée ici plutôt qu'aux
tables sans donnée personnelle.** Ses six colonnes ne portent aucun nom, aucune
adresse ni aucun identifiant de personne : un identifiant technique, une
référence de facture, une clé d'idempotence, un montant et deux horodatages.

Le classement se joue pourtant sur autre chose que le contenu des colonnes. La
ligne dit **qu'un remboursement a été demandé sur la facture d'une personne
identifiable**, avec son montant et sa date : c'est une information se rapportant
à cette personne au sens de l'article 4 point 1, que la jointure sur `factureId`
suffit à rattacher. La ranger en « sans donnée personnelle » aurait répété le
défaut de `MouvementStock`, classé à tort sur sa finalité plutôt que sur ce que
la ligne révèle.

Elle suit donc la conservation de dix ans de T5, ce qui est cohérent : une
intention aboutie documente une sortie d'argent que la comptabilité doit pouvoir
justifier. Une intention **non** aboutie ne prouve rien et se supprime, seul cas
de suppression de ce traitement, l'invariant 4 ne portant que sur les documents
émis.

### T6, droit de rétractation et litiges

| Champ | Valeur |
|---|---|
| Finalité | traiter une demande de rétractation, tracer les décisions et les remboursements |
| Personnes concernées | clients exerçant leur droit de rétractation |
| Catégories de données | motif exprimé par le client, décision et son motif, preuve d'expédition du retour, montant remboursé |
| Tables | `DemandeRetractation`, `JetonAcces` |
| Base légale | obligation légale, article 6.1.c, articles L221-18 et suivants du code de la consommation |
| Conservation | **cinq ans** à compter de la fin de la relation, délai de prescription de droit commun, article 2224 du code civil |
| Destinataires | l'exploitante, le médiateur de la consommation en cas de litige |
| Transfert hors UE | aucun |

`JetonAcces` ne porte **jamais la valeur du jeton en clair**, seulement son
empreinte, règle L5 et invariant 9.

### T7, avis de consommateurs

| Champ | Valeur |
|---|---|
| Finalité | recueillir et publier les avis sur les articles achetés, avec preuve d'achat |
| Personnes concernées | clients ayant reçu une commande |
| Catégories de données | note, commentaire, date d'expérience, lien vers la ligne de commande, réponse de l'exploitante |
| Tables | `Avis`, `ReponseAvis`, `InvitationAvis` |
| Base légale | intérêt légitime, article 6.1.f, informer les acheteurs ; obligation d'information de l'article L111-7-2 du code de la consommation quant aux modalités de contrôle |
| Conservation | **sans limite de durée** tant que l'avis reste publié, ADR-028. Aucun texte n'impose de durée ; l'article D111-10 impose en revanche de l'**annoncer** dans une rubrique accessible |
| Destinataires | public, pour l'avis publié et sa réponse. L'identité complète de l'auteur n'est jamais affichée |
| Transfert hors UE | aucun |

Un avis est ancré sur la **ligne de commande**, ce qui rend la preuve d'achat
structurelle, règle R2. L'invitation à déposer un avis porte un jeton d'accès à
usage unique.

**L'absence de limite est une décision motivée, ADR-028, et non une durée
oubliée.** La donnée reste nécessaire à sa finalité tant que l'avis est publié,
critère de l'article 5.1.e : sur un catalogue de pièces uniques, un avis est
souvent le seul témoignage existant sur un article. Le contrepoids est le droit
d'effacement, exerçable à tout moment sans attendre d'échéance, et le retrait sur
décision de modération motivée, règle R5.

**Cette absence de limite doit être publiée**, article D111-10 2° b), au même
titre qu'une durée chiffrée le serait. Une rubrique muette sur la conservation
serait le manquement que cet article vise. La formulation à reprendre est dans
ADR-028.

La suppression du compte ne supprime pas les avis : `Avis.utilisateurId` est en
`SetNull`, l'avis survit **dissocié** de son auteur, comme la commande l'est,
voir T1 et la procédure des droits des personnes.

### T8, journal des connexions

| Champ | Valeur |
|---|---|
| Finalité | détecter et instruire les accès non autorisés aux comptes, mesure de sécurité d'ADR-021 et ADR-027 |
| Personnes concernées | toute personne tentant de se connecter, y compris sur une adresse sans compte |
| Catégories de données | **adresse IP**, agent utilisateur, adresse email saisie, moyen et issue de la connexion, horodatage |
| Tables | `JournalConnexion` |
| Base légale | intérêt légitime, article 6.1.f, sécurité du système d'information |
| Conservation | **six mois**, délibération CNIL n° 2021-122 du 14 octobre 2021, point 8, bas de la fourchette recommandée. La purge l'applique, règle E14 |
| Destinataires | l'exploitante seule, par l'écran d'administration |
| Transfert hors UE | aucun |

**L'adresse IP est une donnée personnelle.** Elle permet, seule ou recoupée avec
les informations détenues par le fournisseur d'accès, d'identifier indirectement
une personne physique, au sens de l'article 4 point 1 du RGPD. Elle est donc
soumise à ce registre au même titre qu'un nom, et sa présence est ce qui impose
une durée de conservation à ce journal.

**Le mot de passe essayé n'est jamais enregistré**, même faux, même tronqué,
ADR-027 décision 2. Un journal d'échecs qui les contiendrait serait une liste de
mots de passe presque justes en face d'adresses connues.

L'adresse email saisie est stockée en clair, et ce n'est pas une entorse à
l'invariant 9 : une adresse email n'est pas un secret, la table `utilisateur` la
porte déjà. Sans elle, une ligne d'échec sur compte inconnu ne dirait rien.

### T9, journaux techniques et sécurité de l'application

| Champ | Valeur |
|---|---|
| Finalité | tracer les actions d'administration, l'envoi des emails, les alertes critiques, et limiter les tentatives en rafale |
| Personnes concernées | clients destinataires d'emails, exploitante agissant dans l'administration |
| Catégories de données | identifiant de l'acteur, adresse IP, adresse email du destinataire, modèle d'email et statut d'envoi, clé de limitation de débit contenant une adresse IP |
| Tables | `JournalAudit`, `JournalEmail`, `AlerteCritique`, `RateLimit`, `MouvementStock`, `EnvoiEnAttente` |
| Base légale | intérêt légitime, article 6.1.f, sécurité et preuve du bon fonctionnement |
| Conservation | **six mois** pour `JournalAudit`, par alignement sur la délibération CNIL n° 2021-122. **Vingt-quatre heures** pour `RateLimit`, arbitrage de LS-94 exposé ci-dessous. `JournalEmail` suit la commande qu'il sert, voir T2. `EnvoiEnAttente` est une **file de travail** et non une trace, voir ci-dessous. Les trois purges sont branchées sur une tâche planifiée quotidienne depuis le 12 août 2026, LS-94 |
| Destinataires | l'exploitante seule |
| Transfert hors UE | aucun |

**`RateLimit` porte une adresse IP dans sa clé**, ADR-027 décision 1 signalant
que le mécanisme intégré de Better Auth compte par IP et non par compte. La clé
n'est pas un identifiant opaque : elle encode la route et l'adresse.

**Pourquoi vingt-quatre heures et non six mois pour `RateLimit`**, arbitrage
rendu par LS-94 le 12 août 2026. L'alignement sur la délibération n° 2021-122 ne
tenait pas à l'examen : cette délibération vise la **journalisation**, une trace
conservée pour être relue après un incident. `RateLimit` n'est pas une trace,
c'est un **compteur de travail** dont Better Auth se sert pour décider d'accepter
la requête suivante, et dont les fenêtres valent soixante secondes. Passé la
fenêtre, la ligne n'a plus aucune utilité et la bibliothèque la réinitialise
d'elle-même.

Conserver six mois une donnée personnelle dont l'usage dure une minute
contredisait la minimisation, article 5.1.c. Vingt-quatre heures gardent une
marge d'exploitation, constater le lendemain qu'une adresse a été plafonnée
pendant la nuit, tout en divisant par cent quatre-vingts la durée pendant
laquelle une adresse IP reste attachée à cette table. L'information de fond, elle,
survit dans `JournalConnexion`, conservé six mois.

**`EnvoiEnAttente` est une file de travail, pas une trace**, ADR-033 et LS-82.
Elle porte l'adresse du destinataire et les variables du message, donc des
données personnelles, mais son usage s'arrête à l'envoi : passée la minute qui
suit le dépôt, la ligne n'a plus d'utilité opérationnelle.

Le raisonnement est celui appliqué à `RateLimit` ci-dessus, et il donne ici une
réponse différente. Une ligne terminée, `ENVOYE` ou `ECHOUE`, ne sert plus à
rien : l'information de fond survit dans `JournalEmail`, qui est la trace
opposable. Une ligne **bloquée** en `ENVOI_EN_COURS` doit en revanche survivre
jusqu'à ce que quelqu'un la traite, c'est tout l'objet de l'alerte.

**La purge de cette table n'est pas encore branchée**, et c'est une dette
assumée plutôt qu'un oubli : elle demande de distinguer les lignes terminées des
lignes bloquées, ce que la tâche quotidienne de LS-94 ne sait pas faire
aujourd'hui. Portée par **LS-154**.

**Le contenu du message n'est jamais stocké**, seulement le modèle et ses
variables, précaution 3 d'ADR-008.

### T10, messages de contact

| Champ | Valeur |
|---|---|
| Finalité | recevoir et traiter une demande envoyée par le formulaire de contact public |
| Personnes concernées | toute personne écrivant à la boutique, cliente ou non |
| Catégories de données | nom, adresse email, sujet et corps du message, tels que la personne les a saisis |
| Tables | `Message` |
| Base légale | intérêt légitime, article 6.1.f, répondre à une sollicitation que la personne a elle-même initiée |
| Conservation | **trois ans** à compter du message, référentiel CNIL n° 2021-131, même ancrage que T2 pour les données de prospect. La purge est branchée sur la tâche quotidienne de LS-94 |
| Destinataires | l'exploitante seule |
| Transfert hors UE | aucun |

**Le corps du message est un champ libre**, et c'est ce qui le distingue des
autres traitements de ce registre. Une personne peut y écrire n'importe quoi,
y compris une donnée sensible au sens de l'article 9 qu'aucun formulaire ne lui
a demandée : un motif médical pour justifier un retard, par exemple.

Rien ne peut l'empêcher techniquement, et prétendre le filtrer donnerait une
fausse assurance. La parade est la **durée** et le **destinataire unique** :
trois ans, l'exploitante seule, aucun transfert.

**Aucun lien vers un compte ni vers une commande**, décision de LS-97. Le
formulaire est public, personne n'est connecté, et rapprocher le message d'un
compte par l'adresse email inventerait un lien que la personne n'a pas établi.
Deux personnes peuvent partager une boîte, et une adresse saisie n'est pas une
identité prouvée, invariant 2.

**L'envoi de la notification passe par l'outbox**, ADR-033, donc le destinataire
et les variables entrent aussi dans `EnvoiEnAttente`, couvert par T9. Le message
lui-même est écrit **avant** ce dépôt, dans la même transaction : c'est la règle
principale de LS-97, et elle garantit qu'une panne d'email ne perd jamais la
demande.

## Tables sans donnée personnelle

Les tables suivantes ne portent aucune donnée personnelle et ne relèvent donc
d'aucun traitement. La liste est **exhaustive et vérifiée par le contrôle
automatique**, qui échoue si une table du schéma n'apparaît ni ici ni dans un
traitement.

`Categorie`, `Produit`, `SectionProduit`, `Variante`, `Media`, `Reservation`,
`VerrouTache`, `CompteurNumero`.

**`CompteurNumero`**, ajoutée par LS-117, porte trois colonnes : un type de
document, une année et un rang. Aucune ne se rattache à une personne, et le
numéro qu'elle engendre ne devient une donnée à caractère personnel qu'une fois
**porté par la commande**, où il est couvert par T2.

**`MouvementStock` a d'abord été rangé ici, à tort**, au motif que le mouvement
décrit une pièce de stock et non une personne. Le contrôle automatique a refusé
ce classement : la table porte un `acteurId` qui désigne l'exploitante, donc une
personne physique identifiée. Elle est rattachée à T9, avec les autres traces
d'action d'administration. C'est le premier défaut que ce contrôle a attrapé, et
il visait une justification écrite de bonne foi.

## Données personnelles hors base, les cookies signés

**Le contrôle automatique ne voit pas cette section, et c'est structurel** : il
confronte le registre au schéma Prisma, or un cookie n'est pas une table. Elle se
relit donc à la main, à chaque story qui ajoute un cookie portant autre chose
qu'un identifiant technique.

| Cookie | Ce qu'il porte | Durée | Story |
|---|---|---|---|
| `ls_panier` | identifiants de variante et quantités, **aucune donnée personnelle** | 30 jours | LS-114 |
| `ls_tunnel` | **nom, adresse postale, téléphone**, mode de livraison, point de retrait | 2 heures | LS-115 |
| `ls_commande` | identifiant technique de la commande en cours de paiement, **aucune donnée personnelle** | 1 heure | LS-118 |

`ls_tunnel` relève de **T2, gestion des commandes**, dont il est l'antichambre :
la saisie y vit tant que la commande n'est pas écrite, ADR-024 réservant
l'écriture à la transaction unique.

**Sa durée est courte pour cette raison précise.** Le panier vit trente jours
parce qu'il ne porte que des identifiants de variante ; deux heures suffisent à
remplir quatre étapes, et la minimisation interdit de conserver un nom et une
adresse au-delà de l'usage qui les justifie.

**Les deux limites de LS-115 sont levées par LS-117.** La charge signée porte
désormais un `emisA` que `decoderSaisieTunnel` compare à `DUREE_TUNNEL_SECONDES`,
le `maxAge` seul n'engageant que le navigateur : un cookie capté et rejoué au-delà
de deux heures est refusé côté serveur, quelle que soit la validité de sa
signature. Une charge sans horodatage, forme antérieure à cette story, est refusée
plutôt que tolérée, sans quoi il suffirait d'en retirer le champ.

Et `effacerSaisie` est appelée une fois la commande écrite : le nom, l'adresse et
le téléphone ne survivent pas à l'usage qui les justifie, la commande portant
désormais sa propre copie figée de l'adresse.

`ls_commande` prend leur place une fois la commande écrite, LS-118. Il ne porte
qu'un identifiant technique, aucune donnée personnelle : c'est la commande en
base qui porte le reste, et le cookie ne fait que prouver que ce navigateur est
celui qui l'a passée, invariant 2. Il figure ici pour que la table reste
complète, pas parce qu'il relève d'un traitement supplémentaire.

**Son heure couvre la fenêtre de paiement, pas la consultation durable.** La
session de paiement dure trente minutes, ADR-032, et le réessai après un refus
doit rester possible au-delà ; la réconciliation de LS-120 régularise à l'heure.
Consulter une commande plus tard passera par un jeton signé en base, LS-57, avec
sa propre durée.

Les trois cookies sont `httpOnly`, `sameSite: "lax"`, `secure` hors
développement, et signés par HMAC dérivé de `BETTER_AUTH_SECRET` avec une
étiquette distincte par usage.

## Mesures de sécurité

Description générale au sens de l'article 30 paragraphe 1 point g.

| Mesure | Où elle vit |
|---|---|
| Authentification par passkey, mot de passe de secours à seize caractères | ADR-021, ADR-023 |
| Limitation de débit sur connexion, réinitialisation et inscription | ADR-027 décision 1, `RateLimit` |
| Session d'administration limitée à un jour, réauthentification sur les actions sensibles | ADR-027 décision 3 |
| Journal des connexions avec purge à six mois | ADR-027 décision 2, règle E14 |
| Purge quotidienne des journaux techniques, sous verrou | LS-94, `src/services/purge-journaux.ts` |
| Chiffrement des échanges en HTTPS | déploiement, Nginx sur le VPS |
| Secrets jamais journalisés ni commités | invariant 9, hooks `PreToolUse` |
| Masquage des données personnelles dans les journaux applicatifs | `docs/architecture/JOURNALISATION.md` |
| Sauvegardes de la base | procédure de déploiement, agent `ls-conteneurisation` |

## Ce qui reste dû

**Plus rien depuis le 13 août 2026, LS-93.** Les trois points ouverts par LS-90
sont levés. Cette section est conservée, et non supprimée : elle porte l'histoire
de ce qui a été dû, et le prochain point à traiter viendra s'y inscrire.

**La durée de conservation des avis, T7, est tranchée par ADR-028.** Elle ne
l'était pas comme LS-93 le supposait. Le ticket décrivait les trois ans comme un
chiffre sans source à motiver ; c'était en réalité une **contradiction** avec la
décision I du modèle conceptuel, rendue le 28 juillet 2026, qui posait déjà une
conservation indéfinie et motivée. Le registre l'avait contredite le 12 août sans
que personne ne le remarque.

Le chiffre venait d'un rapprochement fautif avec le référentiel CNIL n° 2021-131,
dont les trois ans visent les **prospects non clients** et l'après-relation
commerciale, jamais un avis publié. C'est le même motif que le repli fautif sur
`RateLimit` corrigé par LS-94 : un référentiel invoqué pour une finalité qui n'est
pas la sienne.

**Les deux autres points étaient déjà levés.**

Les purges de `JournalConnexion`, `JournalAudit` et `RateLimit` sont branchées sur
une tâche planifiée quotidienne depuis le 12 août 2026, LS-94, sous le verrou de
LS-72 : aucune durée annoncée par ce registre n'est plus appliquée par personne.
Le contrôle `scripts/verifier-registre-traitements.sh` le vérifie, et un test
négatif prouve qu'une ligne encore dans sa fenêtre de conservation n'est pas
supprimée.

**Les droits des personnes sont exerçables depuis le 13 août 2026, LS-95.** Un
client supprime son compte lui-même depuis `/compte`, avec confirmation explicite
et preuve d'identité récente, la suppression étant une action sensible de la
famille `IDENTIFIANTS`. La procédure de réponse aux demandes d'accès, de
rectification et d'effacement vit dans `docs/PROCEDURE-DROITS-DES-PERSONNES.md`,
délai d'un mois compris.

Ce que la suppression produit est une **dissociation**, pas un effacement total :
le droit à l'effacement ne prime pas sur l'obligation comptable, article 17
paragraphe 3 point b, et l'article L123-22 impose dix ans sur les factures. Les
commandes survivent, `utilisateurId` à nul et `dissocieA` horodaté, ce qui les
exclut définitivement du rattachement, règle V15. Le journal des connexions
survit lui aussi, en `SET NULL` : un intrus ne doit pas effacer ses traces en
supprimant le compte qu'il vient de compromettre.

## Sources

Chaque durée de ce registre vient de l'un de ces textes. Vérifiées le 12 août
2026.

| Source | Ce qu'elle fonde |
|---|---|
| [RGPD, article 30](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4#Article30) | contenu du registre, et la dispense du paragraphe 5 qui ne s'applique pas ici |
| [RGPD, article 4 point 1](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre1#Article4) | définition de la donnée personnelle, dont relève l'adresse IP |
| [Code de commerce, article L123-22](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006219327/) | dix ans pour les documents comptables et pièces justificatives |
| [Code civil, article 2224](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000019017112) | cinq ans, prescription de droit commun des actions personnelles |
| [Délibération CNIL n° 2021-131 du 23 septembre 2021](https://www.legifrance.gouv.fr/cnil/id/CNILTEXT000045543374/) | trois ans après la fin de la relation commerciale, deux ans pour un compte inactif |
| [Délibération CNIL n° 2021-122 du 14 octobre 2021](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000044272396) | six mois pour les journaux, point 8, reprise par ADR-027 |
| [Registre des activités de traitement, CNIL](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement) | rubriques attendues et périmètre de la dispense |

## Le contrôle qui maintient ce document

```bash
./scripts/verifier-registre-traitements.sh
```

Il confronte **dans les deux sens** la liste des tables du schéma Prisma et celle
de ce registre : une table absente des deux listes fait échouer, une table citée
ici qui n'existe plus au schéma aussi.

Sans lui, ce document se périmerait dès la story suivante. Le motif est déjà
rencontré trois fois sur ce projet : une liste écrite à la main reste une opinion
tant qu'un contrôle de cardinalité ne la confronte pas au code réel.
