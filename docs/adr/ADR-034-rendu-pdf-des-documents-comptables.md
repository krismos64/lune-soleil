# ADR-034 : rendu des documents comptables par `@react-pdf/renderer`

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 1er septembre 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-129 |

## Ce que cet ADR ferme

LS-129 pose comme premier critère d'acceptation qu'un ADR tranche la
bibliothèque de rendu avant la première ligne de code. L'arbitrage du 27 août
2026 avait explicitement reporté cette décision au moment d'écrire la story.

## Contexte

`Facture.cheminPdf` et `Avoir.cheminPdf` sont nuls depuis la migration initiale.
La facture `F-2026-0001`, émise le 31 août lors du premier paiement de bout en
bout, porte un instantané légal complet et exact, et **aucun document
téléchargeable**. C'est le dernier maillon entre l'encaissement et la remise du
document au client.

L'enjeu dépasse le confort. La trace en base atteste que le serveur SMTP a
accepté le message, jamais qu'il est arrivé : le refus tardif et le classement en
indésirable sont invisibles en SMTP. La facture doit donc être téléchargeable
depuis l'espace client, sans dépendre de l'email, et ce chemin de secours
n'existe pas tant que `cheminPdf` est nul.

## Options examinées, avec leurs mesures

Les poids ci-dessous ont été mesurés le 1er septembre 2026, installation nue dans
un dossier vide sous Node 22.

| | rendu HTML par Chromium | `@react-pdf/renderer` 4.9.0 | `pdf-lib` 1.17.1 + fontkit |
|---|---|---|---|
| Poids ajouté | ~300 Mo plus les bibliothèques système | **65 Mo** | **29 Mo** |
| Navigateur dans l'image | oui | non | non |
| Mise en page | HTML et CSS, jetons du projet | composants React, flexbox | coordonnées absolues |
| Hors WinAnsi sans police | sans objet | **substitué en silence** | **lève une exception** |

### Le rendu HTML est écarté par le poids

L'image de production part de `node:slim` et ne copie que la sortie standalone.
Elle ne porte ni `curl` ni `openssl`, constat déjà consigné en mémoire. Y faire
entrer Chromium et ses bibliothèques système pour produire un document par
commande est disproportionné, et alourdit chaque déploiement et chaque retour
arrière.

### `pdf-lib` est écarté par le coût du gabarit

Il est l'option la plus légère, et son API est stable. Une facture porte des
désignations de longueur variable, des totaux alignés à droite et un
enchaînement de mentions légales : en coordonnées absolues, chaque ligne, chaque
colonne et chaque saut de page se calcule à la main. Une désignation longue
déborde sans que rien ne le signale, et la mesure des chaînes revient à
l'appelant.

### `@react-pdf/renderer` est retenu

Le gabarit s'écrit en composants avec flexbox, ce qui rend déclaratifs
l'alignement des totaux, la répartition des colonnes et le passage à la page
suivante. `renderToBuffer` produit le document côté serveur sans aucune fenêtre.

Vérifié en conditions réelles le 1er septembre 2026, sur React 19.2.4, la version
du projet : rendu d'un document accentué en **36 ms**, en-tête `%PDF-1.3`, sans
avertissement. Ses `peerDependencies` déclarent `^19.0.0`.

Les 36 Mo d'écart avec `pdf-lib` sont acceptés en échange du moteur de mise en
page, dont le coût manuel se paierait à chaque évolution du gabarit.

## La décision qui accompagne le choix : une police Unicode est obligatoire

**Aucune des deux bibliothèques ne rend correctement l'Unicode sans police
embarquée, et elles échouent de deux manières opposées.**

Mesuré sur la chaîne `Straẞe Łódź Tōkyō` :

```
pdf-lib, police standard        : REFUSE -> WinAnsi cannot encode "ẞ" (0x1e9e)
@react-pdf/renderer, par défaut : Straže Aódz TMkyM     <- substitué en silence
@react-pdf/renderer, police TTF : Straže Łódź Tōkyō     <- juste, sauf ẞ absent d'Arial
```

Le français courant passe dans tous les cas, accents, œ lié, guillemets et signe
euro compris. Le danger vient du **nom du client et de l'adresse de
facturation**, qui sont des saisies libres : un nom polonais, allemand ou
japonais est parfaitement plausible sur une boutique en ligne française.

Le comportement de `@react-pdf/renderer` est le plus dangereux des deux. `pdf-lib`
échoue bruyamment, ce qui laisse `cheminPdf` nul et lève une `AlerteCritique`,
donc un défaut visible. `@react-pdf/renderer` produit un document d'apparence
correcte portant un nom déformé : un document légal corrompu que rien ne
signale.

**Trois règles en découlent, à porter dans le code et non dans ce document seul :**

1. Une police Unicode est **enregistrée explicitement**, jamais la Helvetica par
   défaut. Le fichier est versionné dans le dépôt, pas téléchargé au rendu : un
   `Font.register` sur une URL ferait dépendre l'émission d'une facture de la
   disponibilité d'un tiers.
2. La police retenue doit **couvrir le latin étendu**. Arial ne porte pas `ẞ`, et
   la substitution reste silencieuse : la couverture se vérifie, elle ne se
   suppose pas.
3. Un test verrouille le rendu d'une chaîne hors WinAnsi en **extrayant le texte
   du PDF produit** et en le comparant à la source. Une assertion sur l'absence
   d'exception ne prouverait rien, la substitution n'en levant aucune.

## Conséquences

Sur l'image Docker : aucun navigateur, aucun paquet système ajouté, le
`Dockerfile` reste inchangé. `ls-conteneurisation` n'a pas à intervenir.

Sur le dépôt : une dépendance de production, `@react-pdf/renderer`, et un fichier
de police versionné.

Sur le stockage : inchangé, ADR-007 s'applique, le fichier va sur le volume local
et jamais chez un service tiers.

Sur le rendu : le gabarit lit **l'instantané légal du document**, jamais le
catalogue ni le profil courant, invariant 3. Un échec laisse `cheminPdf` nul,
lève une `AlerteCritique` et n'annule pas la transaction qui a créé le document.
Une régénération produit le fichier **sans réattribuer de numéro**, invariant 4 et
ADR-031.

## La police retenue : DejaVu Sans

**DejaVu Sans**, sous-ensemble `latin` de `@fontsource/dejavu-sans` 5.3.0, en
WOFF, normal et gras. Environ 700 Ko pour les deux fichiers, versionnés dans le
dépôt.

Licence Bitstream Vera, les modifications DejaVu étant dans le domaine public :
compatible avec un dépôt public.

Couverture vérifiée le 1er septembre 2026 en extrayant le texte du PDF produit,
et non en se fiant à la réputation de la police :

```
Créoles dorées Épuisée à l'unité 18,50 €     <- fidèle
Straẞe Łódź Tōkyō                            <- fidèle, ẞ compris
```

Arial échouait sur `ẞ` en le remplaçant par `ž`, ce qui a justifié de mesurer
plutôt que de supposer. Le nom du sous-ensemble, `latin`, ne dit rien de sa
couverture réelle : il porte bien le latin étendu.

`@react-pdf/renderer` accepte le **WOFF**, ce qui évite de convertir en TTF.
Il n'accepte pas le WOFF2, seul format que `@fontsource` sert par défaut dans
ses feuilles de style.

## Le moment du rendu : après le commit, hors transaction

**Décision de Christophe du 1er septembre 2026.**

`emettreFacture` s'exécute dans la transaction du webhook, celle qui écrit le
paiement et le mouvement de stock. Le rendu est une écriture disque : l'y placer
ferait tenir la transaction pendant une entrée-sortie, et un échec disque tardif
la ferait **avorter**, perdant le paiement et le mouvement de stock pour un
fichier manquant.

Le rendu est donc tenté **après le commit**, hors transaction. Un échec laisse
`cheminPdf` nul, lève une `AlerteCritique` et n'annule rien, ce qui est
exactement le critère 4 de LS-129.

Aucune table de file d'attente n'est ajoutée. `cheminPdf` nul **est** la file :
une facture sans fichier est une tâche de rendu en attente, et le modèle porte
déjà cet état par décision de LS-49. L'outbox d'ADR-033 n'est pas réutilisable,
`EnvoiEmail` portant destinataire et modèle, propres à l'email.

Écarté, le rendu à la demande au premier téléchargement : l'échec se
découvrirait devant le client, et l'email de confirmation ne pourrait pas porter
la pièce jointe. Écartée aussi la tâche périodique, qui ajouterait un
ordonnanceur et un délai avant que la facture existe, pour une opération mesurée
à 36 ms.

## Ce que cet ADR ne décide pas

L'accès au fichier relève de LS-131 et LS-132 : contrôle de propriété pour un
client connecté, lien signé expirant pour un achat sans compte. Aucune URL
devinable dans les deux cas.
