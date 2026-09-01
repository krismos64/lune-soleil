"use client";

/**
 * Lignes du panier, LS-114.
 *
 * COMPOSANT CLIENT, ET C'EST LE SEUL DE L'ECRAN. Il porte deux interactions
 * reelles : changer une quantite, retirer une ligne. Le reste de la page est
 * servi par un composant serveur.
 *
 * IL NE CALCULE AUCUN MONTANT. Les totaux arrivent deja calcules du serveur,
 * `frontend-design.md` : un prix calcule dans le navigateur serait un prix que
 * le client peut influencer.
 *
 * `useTransition` PLUTOT QU'UN ETAT DE CHARGEMENT MAISON : il expose l'attente
 * de la Server Action sans dupliquer l'etat, et laisse React ordonner le rendu.
 */
import { formaterMontant } from "@/lib/montant";
import { useState, useTransition } from "react";

import type {
  LignePanierRevalidee,
  MotifIndisponible,
} from "@/services/panier";
import { changerQuantite, retirerDuPanier } from "./actions-panier";
import styles from "./panier.module.css";

/**
 * Ce que chaque motif dit au visiteur.
 *
 * LES TEXTES DISTINGUENT CE QUI REVIENDRA DE CE QUI NE REVIENDRA PAS.
 * « Épuisée » laisse esperer un reapprovisionnement, « retirée de la vente »
 * non : les confondre ferait attendre une piece qui ne reviendra jamais.
 */
const TEXTE_MOTIF: Record<MotifIndisponible, string> = {
  VARIANTE_INTROUVABLE: "Cette pièce n'est plus disponible.",
  PLUS_VENDABLE: "Cette pièce a été retirée de la vente.",
  EPUISE: "Cette pièce est épuisée.",
  QUANTITE_REDUITE: "La quantité a été ajustée au stock restant.",
};

const PREFIXE_MEDIAS = process.env.NEXT_PUBLIC_MEDIA_PREFIXE ?? "/medias";

export function LignesPanier({ lignes }: { lignes: LignePanierRevalidee[] }) {
  const [enCours, demarrer] = useTransition();
  const [annonce, setAnnonce] = useState("");

  return (
    <>
      {/*
       * REGION LIVE, critere 10 et LS-85. Sans elle, un retrait ou un
       * changement de quantite ne produit aucun retour audible : la page se
       * met a jour en silence pour qui ne la voit pas.
       *
       * `aria-live="polite"` ET NON `assertive` : l'annonce attend une pause
       * dans la lecture plutot que de couper la phrase en cours.
       *
       * `aria-label` NOMME LA REGION, sans quoi l'arbre d'accessibilite porte un
       * `status` nu : le lecteur d'ecran annonce le changement sans dire de quoi
       * il parle, et deux regions anonymes sur une meme page s'annoncent
       * identiquement. Releve le 1er septembre 2026 en capturant l'arbre reel,
       * critere 5 de LS-85, la fiche produit portant deja ce nommage.
       */}
      <p
        role="status"
        aria-live="polite"
        aria-label="Modification du panier"
        className={styles.annonce}
      >
        {annonce}
      </p>

      <ul className={styles.lignes}>
        {lignes.map((ligne) => (
          <li key={ligne.varianteId} className={styles.ligne}>
            <div className={styles.vignette}>
              {ligne.mediaChemin ? (
                // eslint-disable-next-line @next/next/no-img-element -- fichiers servis par Nginx depuis un volume, hors de la portee de l'optimiseur de Next.js, declinaisons pre-generees par ADR-007
                <img
                  src={`${PREFIXE_MEDIAS}/${ligne.mediaChemin}320.jpeg`}
                  alt={ligne.mediaTexteAlternatif ?? ""}
                  className={styles.image}
                  width={320}
                  height={320}
                  loading="lazy"
                />
              ) : (
                <div className={styles.imageAbsente} aria-hidden="true" />
              )}
            </div>

            <div className={styles.details}>
              <p className={styles.nomProduit}>{ligne.produitNom}</p>
              <p className={styles.libelle}>{ligne.libelle}</p>

              {ligne.motif !== null && (
                <p className={styles.motif}>{TEXTE_MOTIF[ligne.motif]}</p>
              )}

              <p className={styles.prixUnitaire}>
                {/*
                 * L'ESPACE EST EXPLICITE. JSX supprime l'espace de fin de ligne
                 * avant un saut : ecrit naturellement, le rendu donnait
                 * « 49,00 €l'unité », defaut vu a la mesure du rendu et non a
                 * la relecture du source, ou l'espace est pourtant present.
                 */}
                {formaterMontant(ligne.prixUnitaireCentimes)}
                {" l'unité"}
              </p>
            </div>

            <div className={styles.actions}>
              {/*
               * UN `select` ET NON DES BOUTONS PLUS ET MOINS. Deux boutons
               * demandent quatre appuis pour passer de 1 a 5, et chacun
               * declenche un aller-retour serveur. Le `select` porte aussi son
               * etiquette, ce que des icones n'auraient pas.
               */}
              {/*
               * PAS DE SELECTEUR SUR UNE LIGNE A QUANTITE NULLE.
               *
               * Une piece epuisee ou retiree porte `quantite: 0`, et le
               * selecteur ne propose que 1 a 20 : React retombait alors sur la
               * premiere option et AFFICHAIT « 1 » sous le message « Cette
               * piece est epuisee ». Un visiteur pouvait croire qu'un
               * exemplaire lui etait reserve. Defaut mesure sur le rendu, releve
               * par `ls-frontend-revue`.
               *
               * Le retrait reste possible : c'est la seule action qui ait un
               * sens sur une ligne qu'on ne peut pas commander.
               */}
              {ligne.quantite > 0 ? (
                <label className={styles.etiquetteQuantite}>
                  <span className={styles.texteEtiquette}>
                    Quantité pour {ligne.produitNom}
                  </span>
                  <select
                    className={styles.selecteur}
                    value={ligne.quantite}
                    disabled={enCours || ligne.motif === "VARIANTE_INTROUVABLE"}
                    onChange={(evenement) => {
                      const quantite = Number(evenement.target.value);

                      demarrer(async () => {
                        const issue = await changerQuantite(
                          ligne.varianteId,
                          quantite,
                        );

                        /*
                         * L'ISSUE EST LUE, ET NON SUPPOSEE. La premiere version
                         * annoncait « mise a jour » quel que soit le retour :
                         * un refus de validation produisait donc un FAUX SUCCES,
                         * ce que `frontend-design.md` interdit nommement. Defaut
                         * releve par `ls-frontend-revue`.
                         */
                        setAnnonce(
                          issue.statut === "OK"
                            ? `Quantité de ${ligne.produitNom} mise à jour : ${quantite}.`
                            : issue.message,
                        );
                      });
                    }}
                  >
                    {Array.from({ length: 20 }, (_, index) => index + 1).map(
                      (valeur) => (
                        <option key={valeur} value={valeur}>
                          {valeur}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ) : (
                <p className={styles.quantiteNulle}>Aucun exemplaire</p>
              )}

              <p className={styles.totalLigne}>
                {formaterMontant(ligne.totalLigneCentimes)}
              </p>

              <button
                type="button"
                className={styles.retirer}
                disabled={enCours}
                onClick={() => {
                  demarrer(async () => {
                    const issue = await retirerDuPanier(ligne.varianteId);

                    setAnnonce(
                      issue.statut === "OK"
                        ? `${ligne.produitNom} retiré du panier.`
                        : issue.message,
                    );
                  });
                }}
              >
                {/*
                 * LE NOM DU PRODUIT EST DANS LE NOM ACCESSIBLE, pas seulement
                 * « Retirer » : dans une liste de cinq lignes, cinq boutons
                 * nommes « Retirer » sont indiscernables au lecteur d'ecran.
                 */}
                <span aria-hidden="true">Retirer</span>
                <span className={styles.texteEtiquette}>
                  Retirer {ligne.produitNom} du panier
                </span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
