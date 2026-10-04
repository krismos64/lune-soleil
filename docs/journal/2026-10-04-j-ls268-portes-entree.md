# 4 octobre 2026 : LS-268, portes d'entrée et contact en motion design

Suite de `2026-10-04-i`. Le déploiement attend toujours la fin de la session.

## Ce qui a été fait

**Maquette d'abord**, hors du dépôt (`Downloads/Lune-Soleil-doc/maquette-portes-entree`),
critiquée par Codex, puis trois arbitrages de Christophe : maquette validée
telle quelle, **amendement d'ADR-045** accepté, et sous 768 px un **bandeau
avec l'image** au-dessus du formulaire.

- **Connexion** : décor de nuit. Image de ciel aquarelle générée par Codex,
  aucun bijou ni texte, réécrite par `sharp` sans métadonnées
  (`public/habillage/porte-ciel-nuit.jpg`, 101 ko). Lune tracée dans son
  anneau, étoiles, poussière d'or, « Bon retour à l'atelier ».
- **Inscription** : décor d'aube, soleil levant, rayons et orbite tracés.
- **Contact** : en-tête « **Écrire à l'atelier** », qui remplace « Nous
  écrire », un « nous » de marque comme celui de LS-264. Enveloppe tracée,
  rabat posé, sceau en lune ; formulaire dans une carte immobile ; trois
  encarts « Avant d'écrire » qui glissent sans disparaître.
- **Les formulaires ne bougent pas.** Leur comportement est inchangé.
- L'administration garde sa photographie immobile, décor par défaut du
  composant pour qu'un écran ajouté n'hérite d'aucune animation par oubli.
- ADR-045 porte l'amendement (quatre décors à dégradé de ciel au lieu de
  deux, ligne « portes d'entrée » dans le tableau d'intensité),
  `frontend-design.md` le reprend.
- Les derniers « nous » du parcours de commande sont partis :
  « Contacter l'atelier » et « Écrire à l'atelier » sur le détail d'une
  commande.

## Ce qui a dérapé

- **Deux mutations ne prouvaient rien au premier essai.** Un sélecteur
  `form input` non « pur » faisait échouer la construction du module CSS ; un
  `aside` réparti sur plusieurs lignes par Prettier n'était pas modifié par le
  remplacement. Refaites toutes les deux, attrapées.
- **Mon test annonçait « tout est arrêté » sans le mesurer sur le second
  élément borné du contact**, sous la ligne de flottaison à 320 px. Relevé par
  `ls-frontend-revue`. Le test amène chaque élément borné dans l'écran, puis
  vérifie la page entière.
- **Le titre « Votre message » de la carte entrait en collision** avec le
  libellé du champ du même nom ; la carte s'appelle « Votre demande ».
- **L'apparition des messages d'état de LS-263 joue sur l'annonce invisible
  de la bascule de mot de passe.** Ce n'est pas un contrôle qui bouge ; le
  test l'exclut et le dit.
- Revue d'interface : page d'erreur du contact sans marges, un « Nous
  contacter » oublié, commentaires devenus faux, « Bon retour » répété sous le
  bandeau. Tous corrigés. **Laissé en l'état** : l'`aside` des encarts dans
  `main`, signalé par une règle de bonnes pratiques d'axe-core et non par
  WCAG.

## Preuves

- `tests/e2e/portes-entree-ls268.spec.ts` aux quatre largeurs : le décor joue
  puis s'arrête avant 7 s, aucun contrôle du formulaire ne s'anime ni avant ni
  pendant la saisie, titre opaque dès l'arrivée, rien ne tourne en mouvement
  réduit, aucun débordement.
- `gabarit-titre-public-ls229` vérifie le bandeau au-dessus du titre à 767 px
  côté boutique, et le panneau toujours masqué côté administration.
- Cinq mutations attrapées : borne retirée, animation sur les champs, garde
  de mouvement réduit retirée, titre semi-transparent, et encarts sans borne
  en boucle. Une sixième, des encarts en boucle mais bornés, est restée verte
  à juste titre : la borne met la boucle en pause, c'est son rôle.
- Suite complète avant les corrections de revue : Vitest 1 751, Playwright
  2 395 réussis et 82 ignorés, code 0. Après : fichiers concernés 412 réussis,
  contrôles textuels et format au vert.

## Prochaine étape

LS-267, thèmes saisonniers et Noël : maquette d'abord, puis l'ADR que
Christophe lance par `/adr`. Puis le déploiement de fin de session.

## État des tickets

LS-268 close à la fusion. LS-267 et LS-269 à faire. LS-258 en cours jusqu'au
17 octobre.
