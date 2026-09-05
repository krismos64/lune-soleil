/**
 * Ecran « Factures et avoirs » de l'administration. LS-184.
 *
 * LE DEFAUT QU'IL FERME. Les factures sont emises depuis LS-126, numerotees par
 * ADR-031, rendues en PDF par LS-129 et servies au client par LS-57 et LS-132.
 * L'exploitante, elle, n'avait AUCUNE vue d'ensemble : le seul chemin passait
 * par le detail d'une commande, ce qui suppose de connaitre la commande.
 * Retrouver une facture depuis son numero etait impossible.
 *
 * CET ECRAN EST EN LECTURE SEULE, ET C'EST UNE PROPRIETE STRUCTURELLE.
 * L'invariant 4 est absolu : une facture n'est jamais modifiee ni supprimee,
 * une correction produit un avoir. Ce fichier ne porte donc AUCUNE Server
 * Action, et il ne doit jamais en porter : la seule ecriture qui touche une
 * piece comptable est l'emission d'un avoir, qui vit sur l'ecran de commande
 * avec sa garde de reauthentification, famille `REMBOURSEMENT`.
 *
 * COMPOSANT SERVEUR, `exigerAdministratrice` appele AVANT tout rendu. Pas de
 * middleware : celui de Next.js s'execute sur la peripherie et ne peut pas
 * relire la session en base, il ne verrait que la presence d'un cookie.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { formaterMontant } from "@/lib/montant";
import {
  PERIODES,
  bornesDePeriode,
  reconnaitrePeriode,
} from "@/lib/periode-comptable";
import {
  PLAFOND_PIECES,
  lireVueComptable,
} from "@/services/administration-comptabilite";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";

import styles from "./factures.module.css";

export const metadata = {
  title: "Factures et avoirs",
  robots: { index: false, follow: false },
};

/**
 * La page relit les pieces a chaque affichage.
 *
 * Une liste comptable mise en cache est trompeuse : une facture emise il y a
 * une minute doit y figurer, et c'est sur cet ecran que l'exploitante verifie
 * qu'une piece existe bien.
 */
export const dynamic = "force-dynamic";

/**
 * La date d'emission, sans l'heure.
 *
 * DISTINCTE DE `formaterDate` DE `affichage-commande.ts`, qui porte l'heure :
 * une liste comptable se lit par jour, et l'heure ajouterait six caracteres par
 * ligne sur un ecran de 320 px sans rien apprendre. Le fuseau reste EXPLICITE,
 * jamais deduit du serveur, invariant 8.
 */
const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Europe/Paris",
});

export default async function PageFactures({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  try {
    await exigerAdministratrice(await headers());
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }

    throw erreur;
  }

  const parametres = await searchParams;

  /*
   * LA VALEUR DE L'URL N'ATTEINT JAMAIS LA REQUETE, invariant 7. Elle sert
   * uniquement a retrouver une entree de la table des periodes, et une valeur
   * inconnue retombe sur « Tout » plutot que de produire une page vide : un
   * lien partage avec un parametre perime doit montrer quelque chose.
   */
  const periodeActive = reconnaitrePeriode(parametres.periode);
  const vue = await lireVueComptable(bornesDePeriode(periodeActive));

  const aucunePiece = vue.pieces.length === 0;

  return (
    <main className={styles.page}>
      <p className={styles.surtitre}>Comptabilité</p>
      <h1 className={styles.titre}>Factures et avoirs</h1>

      <p className={styles.introduction}>
        Les documents émis sont immuables et numérotés sans rupture. Une facture
        ne se corrige jamais : elle s&apos;accompagne d&apos;un avoir.
      </p>

      {/*
       * LES TROIS COMPTAGES, forme du prototype.
       *
       * ILS PORTENT SUR LE LOT AFFICHE, et le disent quand le plafond est
       * atteint. Compter la base entiere pendant qu'on affiche cent lignes
       * donnerait deux chiffres qui ne se repondent pas : le total ne
       * correspondrait a aucune liste visible, et personne ne pourrait le
       * verifier a la main. Motif « numerateur et denominateur apparies ».
       */}
      <ul className={styles.comptages}>
        <li className={styles.comptage}>
          <span className={styles.comptageLibelle}>Factures</span>
          <span className={styles.comptageValeur}>{vue.nombreFactures}</span>
        </li>
        <li className={styles.comptage}>
          <span className={styles.comptageLibelle}>Avoirs</span>
          <span className={styles.comptageValeur}>{vue.nombreAvoirs}</span>
        </li>
        <li className={styles.comptage}>
          {/*
           * « TOTAL DE LA PERIODE » ET NON « MONTANT ENCAISSE », ecart assume
           * au prototype.
           *
           * Cette tuile porte une somme SIGNEE, dont les avoirs sont deduits :
           * « montant encaissé » decrirait mal un chiffre qui baisse quand un
           * remboursement est emis, et laisserait croire a une recette reelle.
           * Le libelle dit ce que le nombre est, la somme des pieces affichees.
           */}
          <span className={styles.comptageLibelle}>Total de la période</span>
          {/*
           * LE TOTAL EST CALCULE COTE SERVEUR, en centimes entiers, invariant 1.
           * Le navigateur ne somme jamais des montants : un flottant y
           * introduirait une derive que personne ne verrait avant la
           * declaration.
           */}
          <span className={styles.comptageValeur}>
            {formaterMontant(vue.totalCentimes)}
          </span>
        </li>
      </ul>

      {/*
       * LA MENTION DE FRANCHISE, forme du prototype et rappel utile.
       *
       * ELLE NE DECIDE D'AUCUNE OBLIGATION JURIDIQUE, et cette story n'en
       * decide pas : elle redit ce que les documents emis portent deja dans
       * leur instantane legal. L'article est cite parce qu'il figure sur les
       * pieces, pas parce que cet ecran l'etablit.
       */}
      <p className={styles.franchise}>
        TVA non applicable, article 293 B du code général des impôts. Aucune
        ligne de TVA n&apos;est calculée sur ces documents.
      </p>

      <nav aria-label="Filtrer par période" className={styles.filtres}>
        <ul className={styles.listeFiltres}>
          {PERIODES.map((periode) => (
            <li key={periode.valeur}>
              <a
                className={styles.filtre}
                /*
                 * LE FILTRE PAR DEFAUT POINTE VERS L'URL NUE, les autres portent
                 * le parametre : l'etat est ainsi serialise dans l'URL, donc le
                 * retour navigateur fonctionne et un lien se partage.
                 */
                href={
                  periode.valeur === "tout"
                    ? "/administration/factures"
                    : `/administration/factures?periode=${periode.valeur}`
                }
                /*
                 * `aria-current="page"` PORTE L'INFORMATION, l'aplat et la
                 * graisse ne font que l'appuyer : `frontend-design.md` interdit
                 * qu'une information passe par la seule couleur.
                 */
                aria-current={
                  periode.valeur === periodeActive ? "page" : undefined
                }
              >
                {periode.libelle}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {aucunePiece ? (
        /*
         * L'ETAT VIDE EST UN ETAT, pas un incident, et son texte DIFFERE selon
         * la cause. « Aucune facture » sur une periode filtree ferait croire
         * qu'il n'y en a nulle part, alors que le filtre suffit a l'expliquer.
         */
        <p className={styles.vide}>
          {periodeActive === "tout"
            ? "Aucune facture n'a encore été émise. La première le sera au premier paiement confirmé."
            : "Aucun document sur cette période. Choisissez une autre période pour élargir la recherche."}
        </p>
      ) : (
        <>
          <ul className={styles.liste}>
            {vue.pieces.map((piece) => (
              <li key={piece.id} className={styles.piece}>
                <div className={styles.enTetePiece}>
                  <span className={styles.numero}>{piece.numero}</span>

                  {/*
                   * LE TYPE EST DIT PAR UN LIBELLE, jamais par la seule couleur
                   * ni par le seul prefixe du numero. « A-2026-0001 » se
                   * distingue de « F-2026-0001 » a la lecture attentive, ce qui
                   * n'est pas une distinction accessible.
                   */}
                  <span
                    className={`${styles.nature} ${
                      piece.type === "AVOIR" ? styles.natureAvoir : ""
                    }`}
                  >
                    {piece.type === "AVOIR" ? "Avoir" : "Facture"}
                  </span>
                </div>

                {/*
                 * L'AVOIR DIT LA FACTURE QU'IL CORRIGE, critere 2 : un avoir
                 * isole de sa facture ne veut rien dire. La liste etant
                 * chronologique, les deux pieces peuvent etre eloignees de
                 * plusieurs ecrans.
                 */}
                {piece.numeroFactureCorrigee ? (
                  <p className={styles.correction}>
                    Corrige la facture {piece.numeroFactureCorrigee}
                  </p>
                ) : null}

                <dl className={styles.details}>
                  <div className={styles.detail}>
                    <dt>Commande</dt>
                    <dd>{piece.numeroCommande}</dd>
                  </div>
                  <div className={styles.detail}>
                    <dt>Client</dt>
                    <dd className={styles.client}>{piece.nomClient}</dd>
                  </div>
                  <div className={styles.detail}>
                    <dt>Émise le</dt>
                    <dd>{FORMAT_DATE.format(piece.emiseA)}</dd>
                  </div>
                  <div className={styles.detailMontant}>
                    <dt>Montant</dt>
                    <dd>{formaterMontant(piece.montantCentimes)}</dd>
                  </div>
                </dl>

                {/*
                 * L'ABSENCE DE PDF EST UN ETAT AFFICHE, jamais une erreur ni un
                 * lien mort, critere 3. `cheminPdf` nul signifie un rendu en
                 * echec, LS-129, et le document existe malgre tout : sa
                 * numerotation est deja consommee, l'invariant 4 portant sur
                 * l'instantane et non sur le fichier.
                 *
                 * LE TEXTE DIT QUOI FAIRE. « PDF indisponible » seul laisserait
                 * croire a une perte definitive, alors que le rendu se relance
                 * depuis l'ecran de la commande.
                 */}
                {piece.cheminPdf ? (
                  <a
                    className={styles.telecharger}
                    href={`/administration/factures/${piece.id}`}
                  >
                    Télécharger le PDF
                    <span className={styles.invisible}> {piece.numero}</span>
                  </a>
                ) : (
                  <p className={styles.sansPdf}>
                    PDF indisponible. Le document existe et reste numéroté ; sa
                    génération se relance depuis la commande{" "}
                    {piece.numeroCommande}.
                  </p>
                )}
              </li>
            ))}
          </ul>

          {/*
           * LE PLAFOND SE DIT, motif de LS-163. Une liste qui s'arrete sans
           * l'annoncer fait croire que la periode ne contient rien de plus, et
           * sur des pieces comptables cette croyance se paie.
           *
           * LE VOLUME EST NON BORNE ICI, a la difference du catalogue : LS-183
           * avait ecrit ce meme critere par analogie et il etait FAUX,
           * `frontend-design.md` interdisant d'introduire un plafond que le
           * schema ne porte pas sur un ensemble borne a quarante references.
           * Les factures, elles, s'accumulent sans limite.
           */}
          {vue.limiteAtteinte ? (
            <p className={styles.plafond}>
              Seuls les {PLAFOND_PIECES} documents les plus récents sont
              affichés, et les comptages ci-dessus ne portent que sur eux.
              Choisissez une période plus courte pour voir les autres.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
