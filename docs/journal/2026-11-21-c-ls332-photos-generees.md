# 21 novembre 2026 : LS-332, photos générées des nouveaux articles

## Demande

Christophe : générer avec Codex les photos portées des nouvelles boucles
d'oreilles et, pour les deux porte-clés, « une image sur un sac à main
féminin et joli », puis les publier. Ticket **LS-332**, Story sous LS-7.

## Cadre

- Boucles : ADR-047, photo portée complémentaire en deuxième position.
- Porte-clés : **aucun ADR ne les couvrait**, ADR-047 et ADR-048 fermant les
  autres catégories. **ADR-052** écrit l'arbitrage : pièce accrochée à un sac
  à main généré, deuxième position, aucune personne ni main, sac sans marque
  ni logo. `frontend-design.md` et `docs/REFERENCES.md` à jour.

## Fait

- Lister : 7 boucles de Noël à une seule photo (Cadeaux Malicieux, Douceurs
  de Noël, Lutins Malicieux, Pain d'Épices Malicieux, Papa Noël Sourire,
  Sapins Givrés, Sapins Malicieux) et 2 porte-clés (Douce Fantaisie, Flocon
  Gourmand).
- Génération Codex, profil en lecture seule ; prompt dédié aux porte-clés,
  sans image de style.
- `finaliser.mts` : `{"retenus":9,"refus":0}`, réencodage sans C2PA et
  passage dans `traiterPhotographie`.
- Planches relues : bijou fidèle, aucun visage, aucun logo, taille
  vraisemblable. Descriptions finissant par « Photo d'illustration. ».
- **Validation explicite de Christophe** : « ok, téléverse la photo et écris
  sa description sur les 9 articles ».
- Insertion par l'administration dans son navigateur : 9 téléversements,
  9 descriptions enregistrées, aucun doublon. La référence du champ fichier
  valait `ref_186` ou `ref_185` selon la fiche ; un envoi refusé sans effet
  puis relancé sur la référence lue.

## Preuves

Contrôle public des 9 fiches : deux médias distincts chacune, description
présente, `og:image` égal au premier média. Sur les porte-clés, le premier
média est la photographie réelle d'origine.

## Prochaine étape

Rien sur ce lot. Fichiers conservés dans
`~/Desktop/lune-soleil-photos-portees-2026-11-21/`.

## État des tickets

- LS-332 : terminée après fusion de la PR de documentation.
- LS-330 : en attente du nocturne relancé, run 44924071009.
