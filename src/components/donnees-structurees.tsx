/**
 * Insertion d'un bloc JSON-LD dans une page, LS-137.
 *
 * COMPOSANT SERVEUR, aucun `"use client"`. Il n'ecrit qu'une balise `script`
 * de type `application/ld+json`, que les moteurs lisent dans le HTML rendu :
 * l'inserer cote client la rendrait invisible aux robots qui n'executent pas le
 * JavaScript.
 *
 * ------------------------------------------------------------------
 * AUCUN `dangerouslySetInnerHTML`, REGLE C23.
 *
 * La premiere version l'employait, comme la plupart des exemples de JSON-LD.
 * `verifier-rendu-texte-simple.sh` l'a refuse en integration continue : la
 * regle interdit le rendu HTML brut dans tout `src/`, et le controle a raison
 * de ne pas tolerer d'exception, une seule ouvrant la porte aux suivantes.
 *
 * LE CONTENU PASSE DONC PAR UN ENFANT TEXTE de `<script>`, que React accepte.
 * ------------------------------------------------------------------
 */

/**
 * Serialise un balisage en neutralisant toute ouverture de balise.
 *
 * ------------------------------------------------------------------
 * REACT N'ECHAPPE RIEN DANS UN `<script>`, ET C'EST MESURE.
 *
 * Un enfant texte ordinaire est echappe par React, ce qui rendrait cette
 * fonction inutile. Un `<script>` fait exception : son contenu est du texte
 * BRUT au sens de la specification HTML, ou `&lt;` ne serait pas decode. React
 * suit la specification et laisse donc passer les chevrons tels quels.
 *
 * Mesure sur le rendu, avant d'ecrire cette fonction :
 *
 *   sans echappement  ->  {"<cle>":"<valeur>"}
 *   avec              ->  {"name":"a \\u003c/script> b"}
 *
 * Supposer l'inverse aurait laisse le trou ouvert en croyant l'avoir ferme.
 * ------------------------------------------------------------------
 *
 * LE DEFAUT QUE CELA FERME. Le contenu vient d'une saisie d'administration, un
 * nom de produit. Une saisie portant `</script>` terminerait la balise au
 * milieu du JSON, et le reste s'interpreterait comme du balisage de page.
 * `JSON.stringify` ne protege pas de cela : il echappe les guillemets et les
 * antislashs, jamais les chevrons, et sa sortie reste un JSON valide.
 *
 * TOUT CHEVRON OUVRANT EST NEUTRALISE, et non la seule chaine `</script`.
 * Viser la sequence exacte laisserait passer les variantes que les parseurs
 * tolerent, `<!--` en particulier, qui ouvre le mode « script data double
 * escaped » et est le vecteur classique d'un filtre trop etroit. Echapper le
 * caractere ferme la famille entiere.
 *
 * LE BALISAGE RECU PAR LES MOTEURS EST INCHANGE : `\\u003c` est une sequence
 * que tout parseur JSON relit comme le caractere d'origine. Seule sa
 * representation dans le HTML differe.
 */
function serialiser(balisage: Record<string, unknown>): string {
  return JSON.stringify(balisage).replace(/</g, "\\u003c");
}

/**
 * Pose un bloc de donnees structurees.
 *
 * L'objet est construit par `lib/seo.ts`, jamais ici : ce composant met en
 * page, il ne decide d'aucun contenu.
 */
export function DonneesStructurees({
  balisage,
}: {
  balisage: Record<string, unknown>;
}) {
  return <script type="application/ld+json">{serialiser(balisage)}</script>;
}
