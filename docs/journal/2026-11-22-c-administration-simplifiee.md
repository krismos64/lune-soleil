# 22 novembre 2026 : refonte de l'administration, menus simplifiés et recherches

## Demande

Christophe : améliorer l'interface d'administration, la simplifier, la rendre
plus jolie et plus intuitive, avec de la couleur, **sans ticket ni nouveau
test**, tous les lots à la suite, un seul déploiement à la fin. Les tests
existants touchés par les changements sont adaptés. Pas de ticket Jira, à sa
demande : ce journal et le commit portent la trace.

## Maquette et analyse

Maquette `docs/prototypes/administration-simplifiee/`, validée en trois
itérations. Trois agents ont relu les dix-sept écrans en lecture seule
(ventes, catalogue et relation client, réglages et navigation). Constats
retenus : seize entrées en cinq groupes, trois chemins vers le même écran,
huit formulaires sur la fiche produit, une création de produit qui n'ouvrait
pas la fiche, le stock saisi à deux endroits, du jargon visible (« Acquitter »,
« règle R5 », articles de loi, « Physique / Réservé »), des paramètres en cinq
formulaires dont le poids du colis rangé dans les alertes.

**Défaut trouvé par l'analyse** : l'écran Promotion annonçait encore « une
pièce dont le prix a changé dans les trente derniers jours reste au prix
catalogue », faux depuis LS-333. Corrigé.

## Arbitrages de Christophe

- les trois états des messages restent (Nouveau, Lu, Traité) ;
- « Ce qui ne se règle pas ici » se replie sous « En savoir plus » ;
- l'aperçu des ambiances s'ouvre dans l'administration, ce qui demande
  `frame-ancestors 'self'` : **ADR-038 amendé** ;
- des recherches dans les listes ;
- aucune fonctionnalité ni information de production ne disparaît.

## Fait

- **Navigation** : sept rubriques (Accueil, Commandes, Retours et factures,
  Catalogue, Clients et avis, Statistiques, Réglages), chaque écran en onglet,
  `OngletsRubrique`. Toutes les adresses restent valides. Une couleur par
  rubrique, puce teintée autour de l'icône, mesurée à 4,5:1 avec le blanc.
- **Tableau de bord** : quatre chiffres en tête, liste « À faire » qui inclut
  les avis à relire et les problèmes signalés, deux actions directes, bloc
  « En ce moment sur la boutique » (ambiance et promotion), état du stock en
  mots simples. L'arc du jour est retiré (**ADR-045 amendé**), son unique
  fonction utile passe dans `src/lib/heure-de-paris.ts`.
- **Réglages** : trois sections, Livraison, Ambiance et promotion,
  Notifications, choisies par le sommaire d'état (`?section=`). Le formulaire
  de livraison et d'alertes reste une seule action serveur, chaque section
  renvoyant l'autre en champs cachés. Poids du colis replié en « Réglage
  avancé ». Aperçu des ambiances en fenêtre (`<dialog>` et `<iframe>`), avec
  Accueil ou Catalogue, Ordinateur ou Mobile, « Appliquer cette ambiance ».
  « Noël 1 (sobre) » et « Noël 2 (franc) » deviennent « Noël discret » et
  « Noël festif ». Retour de confirmation d'identité vers la bonne section
  (`notifications`, `promotion`). Passkeys renommées « Appareils de
  connexion ».
- **Commandes** : la prochaine étape en tête de fiche, avec les boutons de
  statut ; historique replié ; « Document comptable » devient « Facture » ;
  **l'annulation se confirme**, et sa confirmation dit vrai : elle ne
  rembourse pas et ne remet rien en stock, vérifié dans
  `changerStatutCommande`. Filtres renommés (« À préparer », « Prêtes à
  expédier », « En route »…). Expéditions : « Mode d'envoi utilisé ».
- **Retours** : statuts en mots simples (« Nouvelle demande », « Colis
  attendu »…), numéros d'articles retirés des aides, la formule juridique de la
  retenue gardée mot pour mot.
- **Catalogue** : « Créer le brouillon » ouvre la fiche ; référence de
  déclinaison proposée, modifiable ; retour de la fiche vers la liste des
  produits (il ouvrait les catégories) ; suppression de catégorie confirmée ;
  stock en « En stock / En cours de paiement / Disponible à la vente ».
- **Messages** : un message de 280 caractères au plus se lit sans clic ;
  « Rafraîchir la page » retiré du message de classement.
- **Avis** : « règle R5 » et numéros d'articles retirés.
- **Recherches**, `RechercheListe` et `lireTermeRecherche` (Zod) : commandes,
  retours, factures, produits, stock, messages, avis. Formulaire `GET`, terme
  en paramètre de requête Prisma ou SQL paramétré (jokers `LIKE` échappés),
  filtres conservés. **L'écart à ADR-027 accepté pour les comptes clients
  s'étend** aux recherches par nom ou email, noté dans
  `services/administration-clients.ts`.

## Non livré, à reprendre sur demande

- la fiche produit en un seul formulaire à bouton fixe : huit actions serveur
  à fusionner, chacune avec sa validation ; un chantier à part ;
- la barre d'onglets en bas de l'écran mobile ;
- la recherche globale du bandeau (la palette ne cherche que des écrans).

## Tests adaptés, aucun ajouté

Navigation (tableau des rubriques et onglets), couleurs de LS-326, palette et
tableau de bord de LS-325, état du stock de LS-228, paramètres (sections,
débordement et axe sur les trois), thèmes (fenêtre d'aperçu au lieu des
liens), en-têtes de sécurité (`'self'`, aucune autre origine), filtres de
commandes, expéditions, messages, factures (la recherche exclue du « aucun
bouton »), stock, catégories (suppression confirmée), composant de création de
produit (routeur simulé), heure de Paris (test déplacé avec la fonction).

## Preuves

- Types, lint, format ; `npm run test` : 130 fichiers, 2 111 tests.
- Bout en bout complet : 3 007 passés, 11 échecs ; les neuf liés à la refonte
  sont corrigés, les deux autres étaient des dépassements de délai d'axe-core
  à 1280 px sous charge. Les cinq fichiers rejoués : 213 passés.
- Les sept recherches vérifiées à 1280 et 320 px par un script temporaire :
  résultat, aucun résultat, effacement.
- Contrôles statiques de la CI au vert, dont navigation (après correction de la
  liste `RUBRIQUES_A_VENIR` remise sur plusieurs lignes), contraste, bordures,
  description accessible, préchargement, rédaction française.
- `verifier-mutations-a-sec.sh` : 294 expressions, aucune périmée.

## Prochaine étape

Commits, preuves par mutation de la PR, fusion, déploiement, contrôle en
production des sept rubriques, de l'aperçu et d'une recherche.
