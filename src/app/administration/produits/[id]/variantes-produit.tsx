"use client";

/**
 * Variantes d'un produit, composant client. LS-101, ADR-029.
 *
 * TROIS PROPRIETES QUE CET ECRAN DOIT RENDRE VISIBLES, et qui ne vont pas de
 * soi pour qui saisit :
 *
 * 1. LE PRIX SE SAISIT EN EUROS ET SE STOCKE EN CENTIMES. La conversion vit
 *    dans le service, invariant 1 ; l'ecran n'en fait aucune, pas meme pour
 *    l'affichage d'un total.
 * 2. UNE VARIANTE NE SE SUPPRIME PAS, C13. Il n'y a donc AUCUN bouton de
 *    suppression ici, seulement « Archiver », et le texte dit ce que cela
 *    implique.
 * 3. MODIFIER UNE REFERENCE DEJA VENDUE A UNE CONSEQUENCE, ADR-029. L'ecran
 *    l'annonce avant l'enregistrement, sans l'empecher.
 */

import { centimesVersSaisie, formaterMontant } from "@/lib/montant";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  archiverVarianteAction,
  creerVarianteAction,
  modifierVarianteAction,
  type ResultatVariante,
} from "./actions-variantes";
import styles from "./editeur.module.css";

export type VarianteAffichee = {
  id: string;
  reference: string;
  libelle: string;
  dimensions: string | null;
  prixCentimes: number;
  quantitePhysique: number;
  quantiteReservee: number;
  archivee: boolean;
  /** Nombre de lignes de commande citant la variante, ADR-029. */
  nombreCommandes: number;
};

function messageDe(resultat: ResultatVariante): string | null {
  switch (resultat.statut) {
    case "SUCCES":
      return null;
    case "SESSION_ABSENTE":
      return "Session expirée. Reconnectez-vous pour continuer.";
    case "INVALIDE":
      return resultat.message;
    case "REFERENCE_PRISE":
      // LE NOM DU PRODUIT PORTEUR EST DANS LE MESSAGE, cas d'erreur du parcours
      // 3. La piece porteuse peut etre archivee : sa reference reste occupee,
      // C14, et c'est le cas ou le refus est le plus deroutant.
      return `La référence ${resultat.reference} est déjà portée par « ${resultat.nomProduit} ». Une référence n'est jamais réattribuée, y compris après archivage.`;
    case "INTROUVABLE":
      return "Cette variante n'existe plus. Actualisez la page pour voir la fiche à jour.";
    case "DEJA_ARCHIVEE":
      return "Cette variante est déjà archivée. Actualisez la page.";
    case "RESERVATION_ACTIVE":
      // LE MESSAGE DIT QUOI FAIRE, et non seulement que c'est refusé : le refus
      // impose un contrôle humain, il n'est pas définitif.
      return `Cette déclinaison porte ${resultat.nombreReservations} réservation${resultat.nombreReservations > 1 ? "s" : ""} en cours : un achat est peut-être en train de se conclure. L'archivage sera possible une fois la réservation expirée.`;
    case "INDISPONIBLE":
      return "Enregistrement momentanément indisponible. Réessayez dans un instant.";
  }
}

/** Champs d'un formulaire de variante, saisis en euros. */
type Saisie = {
  reference: string;
  libelle: string;
  dimensions: string;
  prixEuros: string;
  quantitePhysique: string;
};

const SAISIE_VIDE: Saisie = {
  reference: "",
  libelle: "",
  dimensions: "",
  prixEuros: "",
  quantitePhysique: "0",
};

export function VariantesProduit({
  produitId,
  variantes,
}: {
  produitId: string;
  variantes: VarianteAffichee[];
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [ajout, setAjout] = useState<Saisie>(SAISIE_VIDE);
  const [edition, setEdition] = useState<Record<string, Saisie>>({});
  const [aArchiver, setAArchiver] = useState<string | null>(null);

  /*
   * LE FOCUS ENTRE DANS LE PANNEAU A SON OUVERTURE, et revient au bouton qui l'a
   * ouvert a sa fermeture.
   *
   * SANS CELA, UN `alertdialog` EST PIRE QU'UN SIMPLE BLOC. La majorite des
   * lecteurs d'ecran ne l'annoncent qu'une fois le focus a l'interieur, et la
   * touche Echap ne sert a rien puisque son gestionnaire ne recoit jamais
   * l'evenement. Le role promet un dialogue, il faut en tenir le contrat.
   */
  const panneau = useRef<HTMLDivElement | null>(null);
  const declencheur = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (aArchiver !== null) {
      panneau.current?.focus();
    } else {
      declencheur.current?.focus();
      declencheur.current = null;
    }
  }, [aArchiver]);

  /** Ouvre la confirmation en retenant le bouton d'ou elle vient. */
  function demanderArchivage(
    id: string,
    bouton: HTMLButtonElement | null,
  ): void {
    declencheur.current = bouton;
    setAArchiver(id);
  }

  /** Efface le succès dès que la saisie reprend, LS-100. */
  function oublierSucces() {
    setSucces((precedent) => (precedent === null ? precedent : null));
  }

  function jouer(
    action: () => Promise<ResultatVariante>,
    messageSucces: string,
    apres?: () => void,
  ) {
    setErreur(null);
    setSucces(null);

    demarrer(async () => {
      const message = messageDe(await action());

      if (message) {
        setErreur(message);
        return;
      }

      // LE SUCCES N'EST POSE QU'APRES LE RETOUR DU SERVEUR : un succes
      // optimiste ferait croire a un enregistrement qu'une base injoignable n'a
      // pas fait.
      setSucces(messageSucces);
      apres?.();
    });
  }

  /** Ouvre l'edition d'une variante, en repartant de ses valeurs en base. */
  function ouvrirEdition(variante: VarianteAffichee) {
    oublierSucces();
    // LA CONFIRMATION D'ARCHIVAGE SE FERME EXPLICITEMENT. Le JSX la rend
    // aujourd'hui inatteignable pendant une edition, les deux boutons vivant
    // dans le meme bloc : cette ligne rend la propriete voulue plutot
    // qu'accidentelle, et elle survivra a un deplacement des boutons.
    setAArchiver(null);
    setEdition((precedent) => ({
      ...precedent,
      [variante.id]: {
        reference: variante.reference,
        libelle: variante.libelle,
        dimensions: variante.dimensions ?? "",
        prixEuros: centimesVersSaisie(variante.prixCentimes),
        quantitePhysique: String(variante.quantitePhysique),
      },
    }));
  }

  function fermerEdition(id: string) {
    setEdition((precedent) => {
      const suite = { ...precedent };
      delete suite[id];
      return suite;
    });
  }

  function ecrireSaisie(id: string, champ: keyof Saisie, valeur: string) {
    oublierSucces();
    setEdition((precedent) => {
      const courante = precedent[id];
      if (!courante) {
        return precedent;
      }
      return { ...precedent, [id]: { ...courante, [champ]: valeur } };
    });
  }

  function ajouter(evenement: React.FormEvent) {
    evenement.preventDefault();
    jouer(
      () =>
        creerVarianteAction(
          produitId,
          ajout.reference,
          ajout.libelle,
          ajout.dimensions,
          ajout.prixEuros,
          Number(ajout.quantitePhysique),
        ),
      `Variante ${ajout.reference.toUpperCase()} ajoutée.`,
      () => setAjout(SAISIE_VIDE),
    );
  }

  function enregistrer(variante: VarianteAffichee) {
    const saisie = edition[variante.id];
    if (!saisie) {
      return;
    }

    jouer(
      () =>
        modifierVarianteAction(
          produitId,
          variante.id,
          saisie.reference,
          saisie.libelle,
          saisie.dimensions,
          saisie.prixEuros,
          Number(saisie.quantitePhysique),
        ),
      `Variante ${saisie.reference.toUpperCase()} enregistrée.`,
      () => fermerEdition(variante.id),
    );
  }

  function archiver(variante: VarianteAffichee) {
    jouer(
      () => archiverVarianteAction(produitId, variante.id),
      `Variante ${variante.reference} archivée.`,
      () => setAArchiver(null),
    );
  }

  const actives = variantes.filter((v) => !v.archivee);

  return (
    <section aria-labelledby="titre-variantes">
      <h2 className={styles.sousTitre} id="titre-variantes">
        Déclinaisons et prix
      </h2>
      <p className={styles.aide}>
        Chaque déclinaison porte sa référence, son prix et son stock. Les
        dimensions se saisissent ici, elles varient d&apos;une déclinaison à
        l&apos;autre.
      </p>

      <p className={styles.erreur} role="alert">
        {erreur}
      </p>
      <p className={styles.succes} role="status">
        {succes}
      </p>

      {actives.length === 0 && (
        <p className={styles.vide}>
          Aucune déclinaison en vente. Le produit ne peut pas être publié tant
          qu&apos;il n&apos;en porte aucune : sans elle, il n&apos;a ni prix ni
          stock.
        </p>
      )}

      <ul className={styles.liste}>
        {variantes.map((variante) => {
          const saisie = edition[variante.id];

          return (
            <li className={styles.carte} key={variante.id}>
              <div className={styles.enTeteVariante}>
                <h3 className={styles.referenceVariante}>
                  {variante.reference}
                </h3>
                {variante.archivee && (
                  <span className={styles.marqueur}>Archivée</span>
                )}
              </div>

              {!saisie && (
                <>
                  <dl className={styles.faits}>
                    <div className={styles.fait}>
                      <dt className={styles.faitLabel}>Déclinaison</dt>
                      <dd className={styles.faitValeur}>{variante.libelle}</dd>
                    </div>
                    <div className={styles.fait}>
                      <dt className={styles.faitLabel}>Dimensions</dt>
                      <dd className={styles.faitValeur}>
                        {variante.dimensions ?? "Non renseignées"}
                      </dd>
                    </div>
                    <div className={styles.fait}>
                      <dt className={styles.faitLabel}>Prix</dt>
                      <dd className={styles.faitValeur}>
                        {formaterMontant(variante.prixCentimes)}
                      </dd>
                    </div>
                    <div className={styles.fait}>
                      <dt className={styles.faitLabel}>Stock physique</dt>
                      <dd className={styles.faitValeur}>
                        {variante.quantitePhysique}
                      </dd>
                    </div>
                    {/*
                     * LA QUANTITE RESERVEE EST AFFICHEE SEPAREMENT du stock
                     * physique, invariant 6 : ce sont deux notions distinctes,
                     * et les additionner ou les confondre produirait un
                     * inventaire faux. Elle est en lecture seule ici, seule la
                     * reservation l'ecrit, ADR-006.
                     */}
                    <div className={styles.fait}>
                      <dt className={styles.faitLabel}>Réservé</dt>
                      <dd className={styles.faitValeur}>
                        {variante.quantiteReservee}
                      </dd>
                    </div>
                  </dl>

                  {!variante.archivee && (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.bouton}
                        onClick={() => ouvrirEdition(variante)}
                        disabled={enCours}
                        aria-label={`Modifier la déclinaison ${variante.reference}`}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className={styles.boutonDanger}
                        onClick={(evenement) =>
                          demanderArchivage(
                            variante.id,
                            evenement.currentTarget,
                          )
                        }
                        disabled={enCours}
                        aria-label={`Archiver la déclinaison ${variante.reference}`}
                      >
                        Archiver
                      </button>
                    </div>
                  )}

                  {variante.archivee && (
                    <p className={styles.aide}>
                      Retirée de la vente en ligne. Son stock reste disponible
                      pour la vente en main propre, et sa référence reste
                      occupée : elle ne sera jamais réattribuée.
                    </p>
                  )}
                </>
              )}

              {saisie && (
                <>
                  <div className={styles.champ}>
                    <label
                      className={styles.label}
                      htmlFor={`reference-${variante.id}`}
                    >
                      Référence
                    </label>
                    <input
                      id={`reference-${variante.id}`}
                      className={styles.saisie}
                      value={saisie.reference}
                      maxLength={30}
                      readOnly={enCours}
                      onChange={(e) =>
                        ecrireSaisie(variante.id, "reference", e.target.value)
                      }
                      aria-describedby={
                        variante.nombreCommandes > 0
                          ? `format-${variante.id} avertissement-${variante.id}`
                          : `format-${variante.id}`
                      }
                    />
                    {/*
                     * L'AIDE DE FORMAT EST AUSSI PRESENTE EN EDITION, et pas
                     * seulement a l'ajout : sans elle, une exploitante qui
                     * corrige une reference existante decouvre la regle par le
                     * message de refus.
                     */}
                    <p className={styles.aide} id={`format-${variante.id}`}>
                      Lettres sans accent, chiffres et tirets.
                    </p>
                    {/*
                     * L'AVERTISSEMENT D'ADR-029, decision 2. Il n'apparait que
                     * si la variante a deja vendu : sur une piece jamais
                     * commandee, la modification est sans consequence et un
                     * message permanent serait du bruit.
                     *
                     * IL N'EMPECHE RIEN. L'arbitrage du 14 aout 2026 a retenu
                     * la reference librement modifiable ; un avertissement
                     * bloquant reviendrait au verrouillage ecarte.
                     */}
                    {variante.nombreCommandes > 0 && (
                      <p
                        className={styles.avertissement}
                        id={`avertissement-${variante.id}`}
                      >
                        Cette référence apparaît dans {variante.nombreCommandes}{" "}
                        commande
                        {variante.nombreCommandes > 1 ? "s" : ""} déjà passée
                        {variante.nombreCommandes > 1 ? "s" : ""}. La modifier
                        laissera leurs avis et leurs statistiques sur
                        l&apos;ancienne référence. Les commandes et les
                        factures, elles, ne changent pas.
                      </p>
                    )}
                  </div>

                  <div className={styles.champ}>
                    <label
                      className={styles.label}
                      htmlFor={`libelle-${variante.id}`}
                    >
                      Déclinaison
                    </label>
                    <input
                      id={`libelle-${variante.id}`}
                      className={styles.saisie}
                      value={saisie.libelle}
                      maxLength={80}
                      readOnly={enCours}
                      onChange={(e) =>
                        ecrireSaisie(variante.id, "libelle", e.target.value)
                      }
                    />
                  </div>

                  <div className={styles.champ}>
                    <label
                      className={styles.label}
                      htmlFor={`dimensions-${variante.id}`}
                    >
                      Dimensions
                    </label>
                    <input
                      id={`dimensions-${variante.id}`}
                      className={styles.saisie}
                      value={saisie.dimensions}
                      maxLength={120}
                      readOnly={enCours}
                      onChange={(e) =>
                        ecrireSaisie(variante.id, "dimensions", e.target.value)
                      }
                    />
                  </div>

                  <div className={styles.champ}>
                    <label
                      className={styles.label}
                      htmlFor={`prix-${variante.id}`}
                    >
                      Prix en euros
                    </label>
                    <input
                      id={`prix-${variante.id}`}
                      className={styles.saisie}
                      value={saisie.prixEuros}
                      inputMode="decimal"
                      readOnly={enCours}
                      onChange={(e) =>
                        ecrireSaisie(variante.id, "prixEuros", e.target.value)
                      }
                      aria-describedby={`aide-prix-${variante.id}`}
                    />
                    <p className={styles.aide} id={`aide-prix-${variante.id}`}>
                      Deux décimales au plus, la virgule est acceptée.
                    </p>
                  </div>

                  <div className={styles.champ}>
                    <label
                      className={styles.label}
                      htmlFor={`quantite-${variante.id}`}
                    >
                      Stock physique
                    </label>
                    <input
                      id={`quantite-${variante.id}`}
                      className={styles.saisie}
                      value={saisie.quantitePhysique}
                      inputMode="numeric"
                      readOnly={enCours}
                      onChange={(e) =>
                        ecrireSaisie(
                          variante.id,
                          "quantitePhysique",
                          e.target.value,
                        )
                      }
                    />
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.bouton}
                      onClick={() => enregistrer(variante)}
                      disabled={enCours}
                    >
                      {enCours ? "Enregistrement..." : "Enregistrer"}
                    </button>
                    <button
                      type="button"
                      className={styles.boutonSecondaire}
                      onClick={() => fermerEdition(variante.id)}
                      disabled={enCours}
                    >
                      Annuler
                    </button>
                  </div>
                </>
              )}

              {aArchiver === variante.id && (
                <div
                  className={styles.confirmation}
                  role="alertdialog"
                  ref={panneau}
                  // `-1` ET NON `0` : le panneau doit pouvoir RECEVOIR le focus
                  // par programme sans entrer dans l'ordre de tabulation, ou il
                  // s'intercalerait entre les boutons a chaque parcours.
                  tabIndex={-1}
                  aria-labelledby={`archivage-titre-${variante.id}`}
                  aria-describedby={`archivage-texte-${variante.id}`}
                  onKeyDown={(evenement) => {
                    if (evenement.key === "Escape") {
                      setAArchiver(null);
                    }
                  }}
                >
                  <h3
                    className={styles.confirmationTitre}
                    id={`archivage-titre-${variante.id}`}
                  >
                    Archiver cette déclinaison ?
                  </h3>
                  {/*
                   * LE CAS ZERO N'EST PAS UN ACCORD, C'EST UNE AUTRE PHRASE.
                   * « Ses 0 pièce en stock reste disponible » est faux, et le
                   * cas est atteignable de plein droit : le formulaire accepte
                   * explicitement zero, pour une piece pas encore fabriquee.
                   * A zero, la mention de la vente en main propre n'a aucun
                   * objet et disparait plutot que de s'accorder.
                   */}
                  <p
                    className={styles.confirmationTexte}
                    id={`archivage-texte-${variante.id}`}
                  >
                    {variante.reference} sortira de la vente en ligne.{" "}
                    {variante.quantitePhysique > 0 && (
                      <>
                        {variante.quantitePhysique === 1
                          ? "La pièce en stock reste disponible"
                          : `Les ${variante.quantitePhysique} pièces en stock restent disponibles`}{" "}
                        pour la vente en main propre.{" "}
                      </>
                    )}
                    La référence restera occupée et ne sera jamais réattribuée.
                    Les commandes passées ne changent pas.
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.boutonDanger}
                      onClick={() => archiver(variante)}
                      disabled={enCours}
                    >
                      Archiver
                    </button>
                    <button
                      type="button"
                      className={styles.boutonSecondaire}
                      onClick={() => setAArchiver(null)}
                      disabled={enCours}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <form className={styles.carte} onSubmit={ajouter}>
        <h3 className={styles.sousTitre}>Ajouter une déclinaison</h3>

        <div className={styles.champ}>
          <label className={styles.label} htmlFor="reference-nouvelle">
            Référence
          </label>
          <input
            id="reference-nouvelle"
            className={styles.saisie}
            value={ajout.reference}
            maxLength={30}
            readOnly={enCours}
            required
            placeholder="COL-AUBE-42"
            onChange={(e) => {
              oublierSucces();
              setAjout({ ...ajout, reference: e.target.value });
            }}
            aria-describedby="aide-reference-nouvelle"
          />
          <p className={styles.aide} id="aide-reference-nouvelle">
            Lettres sans accent, chiffres et tirets. Elle ne sera jamais
            réattribuée à une autre pièce.
          </p>
        </div>

        <div className={styles.champ}>
          <label className={styles.label} htmlFor="libelle-nouvelle">
            Déclinaison
          </label>
          <input
            id="libelle-nouvelle"
            className={styles.saisie}
            value={ajout.libelle}
            maxLength={80}
            readOnly={enCours}
            required
            placeholder="Doré, 42 cm"
            onChange={(e) => {
              oublierSucces();
              setAjout({ ...ajout, libelle: e.target.value });
            }}
          />
        </div>

        <div className={styles.champ}>
          <label className={styles.label} htmlFor="dimensions-nouvelle">
            Dimensions
          </label>
          <input
            id="dimensions-nouvelle"
            className={styles.saisie}
            value={ajout.dimensions}
            maxLength={120}
            readOnly={enCours}
            placeholder="42 cm, pendentif 18 mm"
            onChange={(e) => {
              oublierSucces();
              setAjout({ ...ajout, dimensions: e.target.value });
            }}
          />
        </div>

        <div className={styles.champ}>
          <label className={styles.label} htmlFor="prix-nouvelle">
            Prix en euros
          </label>
          <input
            id="prix-nouvelle"
            className={styles.saisie}
            value={ajout.prixEuros}
            inputMode="decimal"
            readOnly={enCours}
            required
            placeholder="19,99"
            onChange={(e) => {
              oublierSucces();
              setAjout({ ...ajout, prixEuros: e.target.value });
            }}
          />
        </div>

        <div className={styles.champ}>
          <label className={styles.label} htmlFor="quantite-nouvelle">
            Stock physique
          </label>
          <input
            id="quantite-nouvelle"
            className={styles.saisie}
            value={ajout.quantitePhysique}
            inputMode="numeric"
            readOnly={enCours}
            required
            onChange={(e) => {
              oublierSucces();
              setAjout({ ...ajout, quantitePhysique: e.target.value });
            }}
            aria-describedby="aide-quantite-nouvelle"
          />
          <p className={styles.aide} id="aide-quantite-nouvelle">
            Zéro est accepté, pour une pièce pas encore fabriquée.
          </p>
        </div>

        <button type="submit" className={styles.bouton} disabled={enCours}>
          {enCours ? "Ajout en cours..." : "Ajouter la déclinaison"}
        </button>
      </form>
    </section>
  );
}
