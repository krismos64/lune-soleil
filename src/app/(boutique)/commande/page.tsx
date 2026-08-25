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
import type { SaisieTunnel } from "@/lib/tunnel-cookie";
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

/**
 * Derniere etape reellement atteignable, selon ce qui est saisi.
 *
 * SANS CETTE GARDE, `?etape=recapitulatif` s'affiche sur une saisie vide : un
 * recapitulatif d'apparence complete, avec un total juste et le bouton legal,
 * mais sans nom, sans email et sans adresse. Mesure le 25 aout 2026, releve par
 * `ls-frontend-revue`. L'URL etant partageable, le cas s'atteint par un simple
 * lien, ce qui est le revers de la serialisation de l'etat dans l'URL.
 *
 * ELLE NE VALIDE PAS LA SAISIE, elle constate sa presence. La validation reste
 * celle de Zod, a l'ecriture : verifier ici la forme d'une adresse dupliquerait
 * une regle qui vit deja dans `validation.ts`.
 */
function etapeAtteignable(saisie: SaisieTunnel): Etape {
  if (saisie.nomClient === "" || saisie.email === "") {
    return "coordonnees";
  }

  if (
    saisie.adresse.ligne1 === "" ||
    saisie.adresse.codePostal === "" ||
    saisie.adresse.ville === ""
  ) {
    return "adresse";
  }

  /*
   * L'ETAPE 3 EST EXIGEE, et elle ne l'etait pas. Sans cette condition, le
   * recapitulatif s'affichait avec le mode `DOMICILE` de la saisie vide, ses
   * frais de port et le bouton legal, alors que personne ne l'avait choisi :
   * 4,99 EUR au lieu de 4,10 EUR sur un panier sous la franchise, et une
   * commande `DOMICILE` non voulue en LS-117. Le `CHECK` ne peut pas l'attraper,
   * un domicile sans point de retrait etant valide. Releve par
   * `ls-critical-reviewer` le 25 aout 2026.
   */
  if (saisie.mode === null) {
    return "livraison";
  }

  return "recapitulatif";
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

  /*
   * L'ETAPE DEMANDEE EST RAMENEE A CE QUI EST ATTEIGNABLE. Un rang superieur
   * renvoie a la premiere etape incomplete plutot que d'afficher des champs
   * vides. Le rang inferieur reste libre : revenir en arriere pour corriger une
   * saisie est legitime.
   */
  const plafond = etapeAtteignable(saisie);
  const etapeRendue =
    ETAPES.indexOf(etape) > ETAPES.indexOf(plafond) ? plafond : etape;

  /*
   * LE RECAPITULATIF N'EST CONSTRUIT QUE SUR UN MODE CHOISI. Le type de
   * `construireRecapitulatif` l'exige, ce qui rend le contournement impossible
   * par oubli plutot que par discipline.
   */
  const recapitulatif =
    saisie.mode === null
      ? null
      : await construireRecapitulatif({
          lignesCookie,
          saisie: { ...saisie, mode: saisie.mode },
        });

  /*
   * UN PANIER DONT PLUS RIEN N'EST COMMANDABLE RENVOIE AU PANIER. Sans cette
   * garde, toutes les pieces epuisees pendant le tunnel donnaient un
   * recapitulatif a zero article et un total egal aux SEULS frais de port :
   * 4,99 EUR pour rien. Le panier, lui, sait expliquer ligne par ligne ce qui a
   * change, ce que ce recapitulatif ne fait pas.
   */
  if (recapitulatif !== null && recapitulatif.totalArticlesCentimes === 0) {
    redirect("/panier");
  }

  /*
   * LA RECHERCHE DE POINTS N'A LIEU QU'A L'ETAPE DU MODE, et seulement si une
   * adresse est saisie : appeler le transporteur avant d'avoir un code postal
   * n'aurait rien a lui demander.
   *
   * ELLE NE LEVE JAMAIS. Une panne rend `disponible: false`, le domicile reste
   * proposable, et la vente continue. C'est le critere 6 de la story.
   */
  const pointsRetrait =
    etapeRendue === "livraison" && saisie.adresse.codePostal !== ""
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
        etape={etapeRendue}
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
