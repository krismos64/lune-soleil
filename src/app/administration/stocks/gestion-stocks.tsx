"use client";

/**
 * Ecran de gestion du stock multicanal, LS-106. Parcours 2.
 *
 * COMPOSANT CLIENT parce qu'il porte des formulaires et des etats de refus. Il
 * ne requete rien lui-meme : les donnees viennent de la page serveur, et les
 * ecritures passent par les Server Actions, qui portent la garde de role.
 *
 * TROIS QUANTITES EN COLONNES DISTINCTES, critere 1 de la story. Physique,
 * reserve et disponible ne se deduisent pas l'une de l'autre a l'oeil : les
 * confondre est exactement l'erreur que l'invariant 6 previent, et c'est ce qui
 * fait vendre deux fois la meme piece.
 *
 * A 320 px LE TABLEAU DEVIENT DES CARTES. Un tableau a cinq colonnes y serait
 * illisible ou deborderait ; `frontend-design.md` demande des cartes quand un
 * tableau ne tient plus, et le rendu bascule par une media query, sans deux
 * arbres de DOM concurrents.
 */
import { useState, useTransition } from "react";

import type { EtatStockVariante, Mouvement } from "@/services/stock-multicanal";
import {
  ajusterInventaireAction,
  corrigerMouvementAction,
  enregistrerVenteExterneAction,
  reactiverVenteWebAction,
  suspendreVenteWebAction,
  type ResultatAction,
} from "./actions";
import styles from "./stocks.module.css";

/** Les messages de chaque issue, LS-106. Le refus n'est pas une panne. */
const MESSAGES: Record<ResultatAction["statut"], string> = {
  SUCCES: "Enregistré.",
  SESSION_ABSENTE: "Session expirée. Reconnectez-vous pour continuer.",
  INVALIDE: "",
  RESERVATION_ACTIVE:
    "Un paiement est en cours sur cette pièce. Vérifiez la réservation avant de la vendre sur un marché.",
  STOCK_INSUFFISANT: "Le stock physique est insuffisant pour cette vente.",
  INTROUVABLE: "Cette pièce n'existe plus ou a été archivée.",
  DEJA_COMPENSE: "Ce mouvement a déjà été corrigé.",
  NON_COMPENSABLE: "Une correction ne se corrige pas à son tour.",
  SANS_ECART: "Comptage conforme, aucun écart à enregistrer.",
  INDISPONIBLE: "Opération indisponible. Réessayez dans un instant.",
};

/** Formate un prix en centimes, invariant 1 : la division est un affichage. */
function formaterPrix(centimes: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(centimes / 100);
}

/**
 * Centimes vers euros, pour la VALEUR d'un champ de saisie.
 *
 * DISTINCTE DE `formaterPrix`, qui produit « 42,50 € » avec son symbole et son
 * espace insecable : coller ce texte dans un champ ferait echouer la validation
 * du service, qui n'accepte que des chiffres et un separateur.
 */
function eurosDepuisCentimes(centimes: number): string {
  return (centimes / 100).toFixed(2).replace(".", ",");
}

/** Libelle public de chaque type de mouvement. */
const LIBELLE_TYPE: Record<Mouvement["type"], string> = {
  VENTE_WEB: "Vente en ligne",
  VENTE_EXTERNE: "Vente sur un marché",
  RETOUR: "Retour ou correction",
  AJUSTEMENT: "Ajustement d'inventaire",
  ENTREE: "Entrée en stock",
};

export function GestionStocks({
  stocks,
  journal,
}: {
  stocks: EtatStockVariante[];
  journal: Mouvement[];
}) {
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<ResultatAction | null>(null);
  /** La variante dont le formulaire de vente est ouvert, une seule a la fois. */
  const [venteOuverte, setVenteOuverte] = useState<string | null>(null);

  const executer = (action: () => Promise<ResultatAction>) => {
    demarrer(async () => {
      setRetour(await action());
    });
  };

  /*
   * LE SEUIL D'ALERTE EST A UN EXEMPLAIRE, et ce n'est pas arbitraire : chaque
   * bijou est fait main, donc la piece unique est le cas ORDINAIRE de cette
   * boutique. Un seuil plus haut ferait clignoter tout le catalogue.
   */
  const SEUIL_ALERTE = 1;

  return (
    <div className={styles.contenu}>
      {/*
       * LE RETOUR EST ANNONCE, LS-85. Une action qui change une quantite sans
       * rien dire laisse l'administratrice deviner si son geste a porte, et
       * `role="status"` le porte aussi a qui n'a pas l'ecran sous les yeux.
       */}
      {retour !== null && (
        <p
          className={
            retour.statut === "SUCCES" || retour.statut === "SANS_ECART"
              ? styles.retourSucces
              : styles.retourRefus
          }
          role="status"
          aria-live="polite"
        >
          {retour.statut === "INVALIDE"
            ? retour.message
            : MESSAGES[retour.statut]}
        </p>
      )}

      <section aria-labelledby="titre-disponibilite">
        <h2 id="titre-disponibilite" className={styles.titreSection}>
          Disponibilité par déclinaison
        </h2>

        {stocks.length === 0 ? (
          <p className={styles.etatVide}>
            Aucune déclinaison en catalogue pour le moment.
          </p>
        ) : (
          <ul className={styles.listeStocks}>
            {stocks.map((ligne) => (
              <li key={ligne.varianteId} className={styles.carteStock}>
                <div className={styles.enteteCarte}>
                  <span className={styles.nomProduit}>{ligne.produitNom}</span>
                  <span className={styles.libelleVariante}>
                    {ligne.libelle}
                  </span>
                  <span className={styles.reference}>{ligne.reference}</span>
                </div>

                {/*
                 * LES TROIS QUANTITES, chacune nommee. Un tableau de chiffres
                 * sans etiquette obligerait a se souvenir de l'ordre des
                 * colonnes, et confondre physique et disponible fait vendre une
                 * piece deja reservee.
                 */}
                <dl className={styles.quantites}>
                  <div className={styles.quantite}>
                    <dt>Physique</dt>
                    <dd>{ligne.quantitePhysique}</dd>
                  </div>
                  <div className={styles.quantite}>
                    <dt>Réservé</dt>
                    <dd>{ligne.quantiteReservee}</dd>
                  </div>
                  <div className={styles.quantite}>
                    <dt>Disponible</dt>
                    <dd>{ligne.quantiteDisponible}</dd>
                  </div>
                </dl>

                {/*
                 * L'ALERTE DE STOCK FAIBLE, critere 7. Elle porte du TEXTE et
                 * pas seulement une couleur : `frontend-design.md` interdit de
                 * transmettre une information par la couleur seule.
                 */}
                {ligne.quantiteDisponible <= SEUIL_ALERTE && (
                  <p className={styles.alerteStock}>
                    {ligne.quantiteDisponible === 0
                      ? "Épuisé, plus aucune pièce disponible."
                      : "Dernière pièce disponible."}
                  </p>
                )}

                <div className={styles.commandes}>
                  {/*
                   * LA BASCULE DIT SON ETAT COURANT ET SON EFFET. « Suspendre »
                   * sur une piece deja suspendue laisserait croire qu'elle est
                   * en vente : le libelle change avec l'etat, et un texte le
                   * rappelle sous le bouton.
                   */}
                  {ligne.venteWebActivee ? (
                    <button
                      type="button"
                      className={styles.bouton}
                      disabled={enCours}
                      onClick={() =>
                        executer(() =>
                          suspendreVenteWebAction(ligne.varianteId),
                        )
                      }
                    >
                      Suspendre la vente en ligne
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.bouton}
                      disabled={enCours}
                      onClick={() =>
                        executer(() =>
                          reactiverVenteWebAction(ligne.varianteId),
                        )
                      }
                    >
                      Remettre en vente en ligne
                    </button>
                  )}

                  <button
                    type="button"
                    className={styles.boutonSecondaire}
                    disabled={enCours}
                    aria-expanded={venteOuverte === ligne.varianteId}
                    onClick={() =>
                      setVenteOuverte(
                        venteOuverte === ligne.varianteId
                          ? null
                          : ligne.varianteId,
                      )
                    }
                  >
                    Vendre sur un marché
                  </button>
                </div>

                <p className={styles.etatVenteWeb}>
                  {ligne.venteWebActivee
                    ? "En vente sur la boutique."
                    : "Retirée de la boutique, le stock physique est inchangé."}
                </p>

                {/*
                 * L'AJUSTEMENT EST REPLIE PAR DEFAUT. C'est l'operation la plus
                 * rare des trois, et la seule qui reecrive une quantite sans
                 * qu'une vente l'explique : la mettre en avant inviterait a
                 * corriger le stock a la main plutot qu'a enregistrer la vente
                 * qui l'a fait bouger.
                 */}
                <details className={styles.ajustement}>
                  <summary>Ajuster après comptage</summary>
                  <form
                    className={styles.formulaire}
                    onSubmit={(evenement) => {
                      evenement.preventDefault();
                      const donnees = new FormData(evenement.currentTarget);
                      executer(() =>
                        ajusterInventaireAction({
                          varianteId: ligne.varianteId,
                          quantiteConstatee: Number(
                            donnees.get("quantiteConstatee"),
                          ),
                          motif: String(donnees.get("motif") ?? ""),
                        }),
                      );
                    }}
                  >
                    <div className={styles.champ}>
                      <label htmlFor={`comptage-${ligne.varianteId}`}>
                        Quantité réellement comptée
                      </label>
                      {/*
                       * LA QUANTITE CONSTATEE, ET NON L'ECART. L'exploitante
                       * compte ce qu'elle a sous les yeux : lui demander la
                       * difference deplacerait sur elle une soustraction que le
                       * service fait sans se tromper.
                       */}
                      <input
                        id={`comptage-${ligne.varianteId}`}
                        name="quantiteConstatee"
                        type="number"
                        required
                        min={0}
                        defaultValue={ligne.quantitePhysique}
                      />
                    </div>
                    <div className={styles.champ}>
                      <label htmlFor={`motif-ajust-${ligne.varianteId}`}>
                        Motif
                      </label>
                      <input
                        id={`motif-ajust-${ligne.varianteId}`}
                        name="motif"
                        type="text"
                        required
                        maxLength={500}
                        placeholder="Inventaire du 18 août"
                      />
                    </div>
                    <button
                      type="submit"
                      className={styles.boutonSecondaire}
                      disabled={enCours}
                    >
                      Enregistrer l&apos;ajustement
                    </button>
                  </form>
                </details>

                {venteOuverte === ligne.varianteId && (
                  <FormulaireVenteExterne
                    ligne={ligne}
                    enCours={enCours}
                    onEnvoi={(entree) =>
                      executer(async () => {
                        const resultat =
                          await enregistrerVenteExterneAction(entree);
                        if (resultat.statut === "SUCCES") {
                          setVenteOuverte(null);
                        }
                        return resultat;
                      })
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titre-journal">
        <h2 id="titre-journal" className={styles.titreSection}>
          Journal des mouvements
        </h2>
        {/*
         * LE JOURNAL EST UN HISTORIQUE, PAS UN ETAT MODIFIABLE, regle S4. Aucune
         * ligne n'est editable ni supprimable : une erreur se corrige par un
         * mouvement compensateur qui s'ajoute, et les deux lignes racontent
         * ensemble ce qui s'est passe.
         */}
        <p className={styles.introductionSection}>
          Aucune ligne ne se modifie ni ne se supprime. Une erreur se corrige
          par un mouvement inverse, qui s&apos;ajoute au journal.
        </p>

        {journal.length === 0 ? (
          <p className={styles.etatVide}>Aucun mouvement enregistré.</p>
        ) : (
          <ul className={styles.listeJournal}>
            {journal.map((mouvement) => (
              <li key={mouvement.id} className={styles.ligneJournal}>
                <div className={styles.enteteLigne}>
                  <span className={styles.typeMouvement}>
                    {LIBELLE_TYPE[mouvement.type]}
                  </span>
                  <time dateTime={mouvement.creeA.toISOString()}>
                    {new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                      // Invariant 8 : persiste en UTC, converti a l'affichage.
                      timeZone: "Europe/Paris",
                    }).format(mouvement.creeA)}
                  </time>
                </div>

                <p className={styles.detailMouvement}>
                  {mouvement.produitNom}, {mouvement.varianteLibelle}{" "}
                  <span className={styles.reference}>
                    {mouvement.varianteReference}
                  </span>
                </p>

                <p className={styles.detailMouvement}>
                  {/*
                   * LE SIGNE EST EXPLICITE. « 1 » ne dit pas si la piece entre
                   * ou sort ; le journal se somme pour retrouver le stock, et
                   * cette lecture doit rester possible a l'oeil.
                   */}
                  <span className={styles.quantiteMouvement}>
                    {mouvement.quantite > 0
                      ? `+${mouvement.quantite}`
                      : mouvement.quantite}
                  </span>
                  {mouvement.canal !== null && `, ${mouvement.canal}`}
                  {mouvement.prixUnitaireFigeCentimes !== null &&
                    `, ${formaterPrix(mouvement.prixUnitaireFigeCentimes)} la pièce`}
                </p>

                {mouvement.motif !== null && (
                  <p className={styles.motifMouvement}>{mouvement.motif}</p>
                )}

                {/*
                 * LA CORRECTION N'EST PROPOSEE QUE SUR UNE VENTE EXTERNE. Les
                 * mouvements web naissent d'un paiement et se corrigent par un
                 * remboursement, phase 4 ; un compensateur ne se compense pas.
                 */}
                {mouvement.type === "VENTE_EXTERNE" && (
                  <details className={styles.correction}>
                    <summary>Corriger cette saisie</summary>
                    <form
                      className={styles.formulaire}
                      onSubmit={(evenement) => {
                        evenement.preventDefault();
                        const donnees = new FormData(evenement.currentTarget);
                        executer(() =>
                          corrigerMouvementAction({
                            mouvementId: mouvement.id,
                            motif: String(donnees.get("motif") ?? ""),
                          }),
                        );
                      }}
                    >
                      <div className={styles.champ}>
                        <label htmlFor={`motif-${mouvement.id}`}>
                          Motif de la correction
                        </label>
                        <input
                          id={`motif-${mouvement.id}`}
                          name="motif"
                          type="text"
                          required
                          maxLength={500}
                          placeholder="Saisie erronée, pièce non vendue"
                        />
                      </div>
                      <button
                        type="submit"
                        className={styles.boutonSecondaire}
                        disabled={enCours}
                      >
                        Enregistrer la correction
                      </button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Formulaire de vente sur un marche, etape 3 du parcours 2.
 *
 * LE PRIX EST PREREMPLI AU CATALOGUE ET RESTE MODIFIABLE. Le parcours l'exige :
 * « une remise consentie sur un stand est un cas courant ». Le figer au
 * catalogue rendrait le chiffre d'affaires des marches faux, et ne rien
 * preremplir ferait ressaisir un prix connu a chaque vente.
 *
 * LE PRIX PART EN EUROS, sous forme de chaine, tel qu'il est saisi. La
 * conversion en centimes appartient a la validation du service, invariant 1 :
 * la faire ici la placerait dans un composant, ou un `parseFloat` mal place
 * introduirait le flottant que l'invariant interdit.
 */
function FormulaireVenteExterne({
  ligne,
  enCours,
  onEnvoi,
}: {
  ligne: EtatStockVariante;
  enCours: boolean;
  onEnvoi: (entree: {
    varianteId: string;
    quantite: number;
    prixUnitaireEuros: string;
    canal: string;
  }) => void;
}) {
  return (
    <form
      className={styles.formulaire}
      onSubmit={(evenement) => {
        evenement.preventDefault();
        const donnees = new FormData(evenement.currentTarget);
        onEnvoi({
          varianteId: ligne.varianteId,
          quantite: Number(donnees.get("quantite")),
          prixUnitaireEuros: String(donnees.get("prixUnitaireEuros") ?? ""),
          canal: String(donnees.get("canal") ?? ""),
        });
      }}
    >
      <div className={styles.champ}>
        <label htmlFor={`canal-${ligne.varianteId}`}>Lieu de vente</label>
        <input
          id={`canal-${ligne.varianteId}`}
          name="canal"
          type="text"
          required
          maxLength={120}
          placeholder="Marché de Noël, Pau"
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor={`quantite-${ligne.varianteId}`}>Quantité vendue</label>
        <input
          id={`quantite-${ligne.varianteId}`}
          name="quantite"
          type="number"
          required
          min={1}
          max={ligne.quantiteDisponible}
          defaultValue={1}
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor={`prix-${ligne.varianteId}`}>
          Prix encaissé, par pièce
        </label>
        {/*
         * `inputMode="decimal"` OUVRE LE PAVE NUMERIQUE SUR MOBILE sans imposer
         * `type="number"`, dont les fleches et le comportement de la virgule
         * varient d'un navigateur a l'autre sur un montant. La validation reste
         * cote serveur, invariant 7.
         */}
        <input
          id={`prix-${ligne.varianteId}`}
          name="prixUnitaireEuros"
          type="text"
          inputMode="decimal"
          required
          placeholder="42,50"
          /*
           * PREREMPLI AU PRIX DU CATALOGUE, et `defaultValue` et non `value` :
           * le champ reste librement modifiable, le parcours 2 exigeant qu'une
           * remise de stand puisse etre saisie.
           */
          defaultValue={eurosDepuisCentimes(ligne.prixCatalogueCentimes)}
        />
        <span className={styles.aideChamp}>
          Le prix réellement encaissé, remise comprise. Prix du catalogue :{" "}
          {formaterPrix(ligne.prixCatalogueCentimes)}.
        </span>
      </div>

      <button type="submit" className={styles.bouton} disabled={enCours}>
        Enregistrer la vente
      </button>
    </form>
  );
}
