/**
 * Insertion d'un bloc JSON-LD dans une page, LS-137.
 *
 * COMPOSANT SERVEUR, aucun `"use client"`. Il n'ecrit qu'une balise `script`
 * de type `application/ld+json`, que les moteurs lisent dans le HTML rendu :
 * l'inserer cote client la rendrait invisible aux robots qui n'executent pas le
 * JavaScript.
 *
 * POURQUOI UN COMPOSANT PLUTOT QUE TROIS BALISES ECRITES A LA MAIN. Le geste
 * `dangerouslySetInnerHTML` demande une precaution d'echappement, ci-dessous.
 * La repeter sur chaque page ferait de chaque nouvelle fiche une occasion de
 * l'oublier ; ici elle est ecrite une fois et le reste des pages ne voit qu'un
 * objet a passer.
 */

/**
 * ECHAPPE LA SEQUENCE QUI FERMERAIT LA BALISE.
 *
 * LE DEFAUT. Le contenu d'un `<script>` n'est pas du HTML : le navigateur y
 * cherche la chaine `</script` litterale pour savoir ou il s'arrete. Un nom de
 * produit contenant cette suite, saisi par l'administratrice, terminerait la
 * balise au milieu du JSON et laisserait le reste s'interpreter comme du
 * balisage de page. C'est une injection par une saisie d'administration.
 *
 * `JSON.stringify` NE PROTEGE PAS DE CELA, et c'est ce qui rend le defaut
 * discret : il echappe les guillemets et les antislashs, jamais les chevrons.
 * La sortie reste un JSON parfaitement valide, et la faute ne se voit qu'a
 * l'execution dans un navigateur.
 *
 * TOUT CHEVRON OUVRANT EST ECHAPPE EN SEQUENCE UNICODE, et non la seule chaine
 * `</script`. Viser la sequence exacte laisserait passer les variantes que les
 * parseurs tolerent ; echapper le caractere ferme la famille entiere. Le
 * parseur JSON relit cette sequence comme le caractere d'origine, donc le
 * balisage recu par les moteurs est INCHANGE : seule sa representation dans le
 * HTML differe.
 */
export function serialiserSansEchappement(
  balisage: Record<string, unknown>,
): string {
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
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serialiserSansEchappement(balisage) }}
    />
  );
}
