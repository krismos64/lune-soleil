# Maquette de la page Livraison et aide, LS-280

Maquette **à valider** par Christophe, demandée le 7 octobre 2026 : refonte de
`/aide` en motion design, assortie à l'accueil. Page HTML autonome : l'ouvrir
dans un navigateur suffit, sans serveur. La barre du bas rejoue les animations
et prévisualise le mouvement réduit.

**Référence de rendu, pas source de vérité.** Là où elle diffère d'un ADR,
l'ADR l'emporte. Un choix demande un amendement, à écrire si la maquette est
validée :

- **ADR-045, point 7**, classe l'aide parmi les pages Action, limitées aux
  micro-interactions. La maquette y anime un décor : anneau et astres du héros,
  icônes tracées, colis qui parcourt les quatre étapes, quatorze lunes du
  cadran des retours, étoiles du ciel de nuit. Même démarche que LS-268 pour le
  contact.

Les autres règles d'ADR-045 sont tenues dès la maquette, et mesurées dans le
navigateur le 7 octobre 2026 avec `document.getAnimations()` :

- titre, textes, tarifs et liens visibles au premier rendu ; seul le décor part
  d'un état caché, sous la classe `.anime` posée par le script ;
- `transform`, `opacity` et `stroke-dashoffset` seulement, transitions de
  survol comprises ;
- fin de la plus longue séquence à 4,5 s après l'entrée dans l'écran, aucune
  animation infinie ;
- en mouvement réduit, zéro animation et tout le décor dessiné.

**Contenus.** Aucun texte neuf qui ne soit déjà établi : les tarifs (4,10 €,
4,10 €, 7,49 €, franchise à 39,00 € en Point Relais et Locker seulement) sont
ceux affichés en production le 7 octobre 2026 et se liront en configuration au
portage. Aucun délai d'expédition, aucune réponse de FAQ, aucun type
d'emballage : ces contenus attendent LS-26.

**Critique de Codex, 7 octobre 2026.** Retenu : fiches de mode comparables,
franchise séparée des modes, deux parcours de retour (changer d'avis, défaut),
FAQ sans fausses questions, décor mobile réduit en bandeau, séquences bornées à
5 s, mouvement réduit complet. Écarté : animer l'en-tête seul (la demande porte
sur le motion design de la page), et limiter le remboursement au mode standard
(arbitrage déjà pris, L221-24 alinéa 4 écarté, texte actuel du site).

`colis-aube.jpg` et `nuit-colline.jpg` ont été générés par Codex le
7 octobre 2026, aquarelles sans bijou ni texte, réencodées sans métadonnées.
L'en-tête et le pied reprennent ceux du site sans leur menu mobile.
