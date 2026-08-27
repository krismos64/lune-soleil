/**
 * Liberation des reservations expirees, LS-120. Tache planifiee, 5 minutes.
 *
 * CE QU'ELLE REPARE. LS-72 a livre le squelette de tache sans metier :
 * `quantiteReservee` ne redescendait JAMAIS. Une reservation expiree continuait
 * de compter dans le stock reserve et bloquait la vente de la piece
 * indefiniment, en ligne comme sur un marche. LS-106 l'avait mesure sans
 * pouvoir le lever.
 *
 * ELLE EST IDEMPOTENTE PAR CONSTRUCTION, et pas par un drapeau : la ligne de
 * reservation est SUPPRIMEE dans la meme instruction que le decrement. Une
 * seconde execution ne trouve donc plus rien a rendre. Un drapeau `libereeA`
 * aurait laisse la ligne visible et exige de filtrer dessus partout ailleurs.
 *
 * ELLE NE TOUCHE JAMAIS UNE RESERVATION CONSOMMEE PAR UNE VENTE : la
 * confirmation de LS-119 supprime les reservations qu'elle consomme, dans la
 * transaction meme qui sort le stock. Il ne reste donc rien a liberer, et c'est
 * ce qui empeche de rendre deux fois une piece vendue.
 */
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/lib/journal";

/**
 * Rend au catalogue toutes les reservations echues, et dit combien.
 *
 * TOUT TIENT DANS UNE SEULE INSTRUCTION SQL, et ce n'est pas une optimisation.
 * Decrementer puis supprimer en deux temps ouvrirait une fenetre ou une panne
 * laisserait le stock rendu ET la reservation vivante, donc rendu une seconde
 * fois au cycle suivant : du stock apparaitrait sans qu'aucun achat ne
 * l'explique, jusqu'a heurter `chk_variante_pas_de_survente`.
 *
 * `now()` EST L'HORLOGE DE POSTGRESQL, jamais celle de Node, regle de
 * `database.md`. C'est le meme `now()` qui a servi a poser `expire_a`, et une
 * derive d'horloge cote application libererait des reservations encore vivantes.
 *
 * LE VERROU DE LIGNE VIENT DE L'`UPDATE` LUI-MEME. Deux executions concurrentes
 * de la tache sont deja empechees par le verrou applicatif de LS-72 ; celle-ci
 * reste malgre tout sure face a une reservation qu'une confirmation consomme au
 * meme instant, la suppression et le decrement portant sur les memes lignes
 * verrouillees.
 */
export async function libererReservationsExpirees(
  client: typeof prisma = prisma,
): Promise<number> {
  const lignes = await client.$queryRaw<{ liberee: string }[]>`
    WITH echues AS (
      DELETE FROM reservation
      WHERE expire_a <= now()
      RETURNING id, variante_id, quantite
    ),
    par_variante AS (
      SELECT variante_id, SUM(quantite)::int AS quantite
      FROM echues
      GROUP BY variante_id
    ),
    rendu AS (
      -- AUCUN PLANCHER GREATEST ICI, a la difference de la sortie de stock de
      -- LS-119, et c'est delibere. Descendre sous zero signifierait qu'on rend
      -- plus de reservations que la variante n'en porte, donc une incoherence
      -- deja installee : chk_variante_reservee_positif fait alors ECHOUER la
      -- tache, ce qui se voit au journal et en exploitation. Un plancher
      -- silencieux la masquerait, et le stock deviendrait faux sans alerte.
      UPDATE variante
      SET quantite_reservee = variante.quantite_reservee - par_variante.quantite
      FROM par_variante
      WHERE variante.id = par_variante.variante_id
      RETURNING variante.id
    )
    SELECT id AS liberee FROM echues
  `;

  const liberees = lignes.length;

  if (liberees > 0) {
    /*
     * LE COMPTE EST JOURNALISE, jamais les identifiants : une liberation
     * massive et soudaine est le signe d'un incident, une panne de paiement par
     * exemple, et c'est le nombre qui le montre.
     */
    journaliser("info", "Reservations expirees liberees", { liberees });
  }

  return liberees;
}
