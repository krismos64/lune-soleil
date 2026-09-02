"use client";

/**
 * Liste du carnet, avec ses gestes. LS-59, etapes 1, 3, 4 et 5.
 *
 * COMPOSANT CLIENT PAR NECESSITE : choisir l'adresse par defaut, ouvrir un
 * formulaire d'edition et supprimer sont trois interactions reelles.
 *
 * IL NE DECIDE RIEN. Chaque geste passe par une Server Action qui recoupe la
 * session cote serveur : l'identifiant d'adresse qu'il transmet n'autorise
 * rien, invariant 2 et regle A1.
 */
import { useRef, useState, useTransition } from "react";

import {
  choisirDefautAction,
  supprimerAdresseAction,
  type ResultatAdresse,
} from "./actions";
import { FormulaireAdresse, type AdresseAModifier } from "./formulaire-adresse";
import styles from "./adresses.module.css";

export type AdresseAffichee = AdresseAModifier & {
  pays: string;
  estParDefaut: boolean;
};

export function ListeAdresses({ adresses }: { adresses: AdresseAffichee[] }) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState("");
  const [enErreur, setEnErreur] = useState(false);
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const compteRendu = useRef<HTMLParagraphElement>(null);

  const appliquer = (resultat: ResultatAdresse, succes: string) => {
    switch (resultat.statut) {
      case "FAIT":
        setEnErreur(false);
        setMessage(succes);
        break;
      case "INTROUVABLE":
        setEnErreur(true);
        setMessage("Cette adresse n'existe plus dans votre carnet.");
        break;
      case "SESSION_ABSENTE":
        setEnErreur(true);
        setMessage("Votre session a expiré.");
        break;
      default:
        setEnErreur(true);
        setMessage(
          "L'opération est momentanément indisponible. Réessayez dans quelques instants.",
        );
    }

    compteRendu.current?.focus();
  };

  const agir = (
    action: () => Promise<ResultatAdresse>,
    succes: string,
  ): void => {
    demarrer(async () => {
      const resultat = await action();
      // Second `demarrer` impose apres un `await`, limitation React.
      demarrer(() => {
        appliquer(resultat, succes);
      });
    });
  };

  /*
   * LA REGION LIVE EST RENDUE DANS LES DEUX BRANCHES, et c'est une condition de
   * correction. La premiere version sortait tot sur l'etat vide, sans elle :
   * apres la suppression de la DERNIERE adresse, `revalidatePath` faisait
   * basculer la liste sur cette branche et la region etait retiree du DOM au
   * moment meme ou son message devenait utile, focus compris.
   *
   * C'est le defaut que `bloc-rattachement.tsx` a corrige ce matin, revenu ici
   * sous une autre forme. Releve par la revue frontend.
   */
  const compteRenduLive = (
    <p
      ref={compteRendu}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      aria-label="Gestion du carnet d'adresses"
      className={styles.annonce}
      data-etat={enErreur ? "erreur" : undefined}
    >
      {message === "" && enCours ? "Enregistrement…" : message}
    </p>
  );

  if (adresses.length === 0) {
    /*
     * L'ETAT VIDE DIT CE QU'IL FAUT FAIRE, jamais seulement « rien ». Un carnet
     * vide est l'etat normal d'un compte neuf, l'achat sans carnet restant le
     * mode par defaut : le texte ne doit rien reclamer.
     */
    return (
      <>
        <p className={styles.texte}>
          Votre carnet est vide. Enregistrez une adresse pour la retrouver lors
          de vos prochaines commandes.
        </p>
        {compteRenduLive}
      </>
    );
  }

  return (
    <>
      <ul className={styles.adresses}>
        {adresses.map((adresse) => (
          <li key={adresse.id} className={styles.adresse}>
            {/*
             * L'ADRESSE PAR DEFAUT SE SIGNALE PAR UN TEXTE, jamais par la
             * couleur seule : WCAG 2.2, et un liseré ne se lit pas au lecteur
             * d'ecran.
             */}
            {adresse.estParDefaut && (
              <p className={styles.marque}>Adresse par défaut</p>
            )}

            {adresse.libelle && (
              <p className={styles.libelle}>{adresse.libelle}</p>
            )}

            <address className={styles.postale}>
              {[
                adresse.nomComplet,
                adresse.ligne1,
                adresse.ligne2,
                `${adresse.codePostal} ${adresse.ville}`,
              ]
                .filter((ligne): ligne is string => Boolean(ligne?.trim()))
                /*
                 * LA CLE VIENT DU RANG, pas du contenu : deux lignes
                 * identiques, cas reel quand `ligne2` repete `ligne1`,
                 * produiraient deux cles egales. Releve par la revue frontend.
                 */
                .map((ligne, rang, toutes) => (
                  <span key={`${adresse.id}-${rang}`}>
                    {ligne}
                    {rang < toutes.length - 1 ? <br /> : null}
                  </span>
                ))}
            </address>

            {enEdition === adresse.id ? (
              /*
               * LE MESSAGE DU FORMULAIRE ATTERRIT DANS **CETTE** REGION LIVE,
               * qui survit a la fermeture de l'edition. Celle du formulaire
               * disparait avec lui : y poser le succes revenait a l'ecrire dans
               * un nœud demonte au meme rendu.
               */
              <FormulaireAdresse
                adresse={adresse}
                onTermine={(succes) => {
                  setEnEdition(null);
                  setEnErreur(false);
                  setMessage(succes);
                  compteRendu.current?.focus();
                }}
              />
            ) : (
              <div className={styles.gestes}>
                {/*
                 * CHAQUE BOUTON PORTE LE LIBELLE OU L'ADRESSE DANS SON NOM
                 * ACCESSIBLE : sans cela, un lecteur d'ecran qui parcourt les
                 * boutons entend « Modifier » cinq fois de suite sans savoir
                 * laquelle il modifie.
                 */}
                <button
                  type="button"
                  className={styles.actionSecondaire}
                  onClick={() => setEnEdition(adresse.id)}
                  aria-label={`Modifier ${adresse.libelle ?? adresse.ligne1}`}
                >
                  Modifier
                </button>

                {!adresse.estParDefaut && (
                  <button
                    type="button"
                    className={styles.actionSecondaire}
                    disabled={enCours}
                    onClick={() =>
                      agir(
                        () => choisirDefautAction(adresse.id),
                        "Adresse par défaut modifiée.",
                      )
                    }
                    aria-label={`Définir ${adresse.libelle ?? adresse.ligne1} comme adresse par défaut`}
                  >
                    Définir par défaut
                  </button>
                )}

                {aSupprimer === adresse.id ? (
                  /*
                   * LA CONFIRMATION DEMANDE UN GESTE DIFFERENT, jamais un
                   * second clic au meme endroit : un double clic accidentel
                   * supprimerait sinon l'adresse. Pas de `window.confirm`, qui
                   * se lit mal au lecteur d'ecran et se valide en gardant
                   * Entree enfoncee.
                   */
                  <span className={styles.confirmation}>
                    <span>Supprimer définitivement ?</span>
                    <button
                      type="button"
                      className={styles.actionDanger}
                      disabled={enCours}
                      aria-label={`Confirmer la suppression de ${adresse.libelle ?? adresse.ligne1}`}
                      onClick={() => {
                        setASupprimer(null);
                        agir(
                          () => supprimerAdresseAction(adresse.id),
                          "Adresse supprimée de votre carnet.",
                        );
                      }}
                    >
                      Oui, supprimer
                    </button>
                    <button
                      type="button"
                      className={styles.actionSecondaire}
                      aria-label={`Annuler la suppression de ${adresse.libelle ?? adresse.ligne1}`}
                      onClick={() => setASupprimer(null)}
                    >
                      Annuler
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.actionSecondaire}
                    onClick={() => setASupprimer(adresse.id)}
                    aria-label={`Supprimer ${adresse.libelle ?? adresse.ligne1}`}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {compteRenduLive}
    </>
  );
}
