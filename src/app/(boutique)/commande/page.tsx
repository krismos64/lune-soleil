/**
 * Tunnel de commande, LS-115. Etape 3b du parcours 1.
 *
 * COMPOSANT SERVEUR. Il lit le panier et la saisie, calcule les montants, et
 * delegue la seule interaction reelle au composant client des formulaires.
 *
 * QUATRE ETAPES DANS L'URL, `?etape=`. L'etat du tunnel est ainsi partageable
 * et le retour navigateur fonctionne, regle de `frontend-design.md` sur la
 * serialisation de l'etat dans l'URL. Un tunnel qui garderait son etape en
 * memoire renverrait le bouton Precedent hors du tunnel.
 *
 * AUCUN MONTANT NE VIENT DU NAVIGATEUR. Frais de port et total sont recalcules
 * a chaque rendu par `services/tunnel.ts`.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { NOM_COOKIE_PANIER, decoderPanier } from "@/lib/panier-cookie";
import { chercherPointsRetrait } from "@/integrations/mondial-relay";
import { fournisseurPointsRetrait } from "@/integrations/mondial-relay/fournisseur";
import { construireRecapitulatif } from "@/services/tunnel";
import { lireSaisie } from "./actions-tunnel";
import { EtapesTunnel } from "./etapes-tunnel";
import styles from "./commande.module.css";

export const metadata = {
  title: "Votre commande, Lune & Soleil",
  description: "Coordonnées, livraison et récapitulatif avant paiement.",
};

export const dynamic = "force-dynamic";

/** Les quatre etapes, dans l'ordre. */
const ETAPES = [
  "coordonnees",
  "adresse",
  "livraison",
  "recapitulatif",
] as const;

type Etape = (typeof ETAPES)[number];

function etapeDemandee(valeur: string | undefined): Etape {
  return ETAPES.includes(valeur as Etape) ? (valeur as Etape) : "coordonnees";
}

export default async function PageCommande({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametres = await searchParams;
  const brut = parametres.etape;
  const etape = etapeDemandee(Array.isArray(brut) ? brut[0] : brut);

  const magasin = await cookies();
  const lignesCookie = decoderPanier(magasin.get(NOM_COOKIE_PANIER)?.value);

  /*
   * UN PANIER VIDE NE PEUT PAS ENTRER DANS LE TUNNEL. Le visiteur est renvoye
   * au panier plutot que de remplir quatre etapes pour rien. `redirect` leve,
   * la suite n'est donc pas executee.
   */
  if (lignesCookie.length === 0) {
    redirect("/panier");
  }

  const saisie = await lireSaisie();

  const recapitulatif = await construireRecapitulatif({
    lignesCookie,
    saisie,
  });

  /*
   * LA RECHERCHE DE POINTS N'A LIEU QU'A L'ETAPE DU MODE, et seulement si une
   * adresse est saisie : appeler le transporteur avant d'avoir un code postal
   * n'aurait rien a lui demander.
   *
   * ELLE NE LEVE JAMAIS. Une panne rend `disponible: false`, le domicile reste
   * proposable, et la vente continue. C'est le critere 6 de la story.
   */
  const pointsRetrait =
    etape === "livraison" && saisie.adresse.codePostal !== ""
      ? await chercherPointsRetrait({
          codePostal: saisie.adresse.codePostal,
          mode: "POINT_RELAIS",
          fournisseur: fournisseurPointsRetrait,
        })
      : null;

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      {/*
       * LA ZONE DESSERVIE EST ANNONCEE A L'ENTREE DU TUNNEL, et non au
       * recapitulatif. L221-14 alinea 3 impose d'indiquer les restrictions de
       * livraison « au plus tard au debut du processus de commande ». Etabli
       * par LS-86, voir `.claude/rules/legal.md`.
       */}
      <p className={styles.zoneDesservie}>
        Livraison en France métropolitaine, Corse comprise.
      </p>

      <EtapesTunnel
        etape={etape}
        saisie={saisie}
        recapitulatif={recapitulatif}
        pointsRetrait={pointsRetrait}
      />

      <Link href="/panier" className={styles.retourPanier}>
        Revenir au panier
      </Link>
    </main>
  );
}
