"use client";

/**
 * Declaration d'expedition d'une commande, LS-130. Etape 11 du parcours 1.
 *
 * COMPOSANT CLIENT PARCE QU'IL Y A UNE INTERACTION REELLE : une saisie, un
 * envoi en cours, un bouton desactive pendant, un message par issue. Il ne
 * requete rien et ne decide rien, l'action portant sa garde de role.
 *
 * LES IDENTIFIANTS SONT SUFFIXES PAR LA COMMANDE, et c'est indispensable ici :
 * la page rend UN formulaire PAR colis a preparer, donc plusieurs a la fois.
 * Des `id` fixes rendraient tous les `label` pointeurs du premier champ de la
 * page, et toutes les regions live indiscernables les unes des autres. C'est le
 * defaut classique des listes de formulaires, invisible tant qu'une seule ligne
 * s'affiche.
 *
 * `livreA` N'EST SAISISSABLE NULLE PART ICI, et aucun champ ne l'approche : la
 * date de remise au destinataire vient du suivi automatique de LS-131, et
 * l'inventer ferait courir le delai de retractation depuis une date fausse.
 */
import { useState, useTransition } from "react";

import type { ModeLivraison } from "@/generated/prisma/enums";
import { LIBELLES_LIVRAISON } from "../commandes/affichage";
import { expedier } from "./actions";
import styles from "./expeditions.module.css";

/**
 * Les transporteurs proposes, ADR-025.
 *
 * UNE LISTE OUVERTE PLUTOT QU'UN `select` FERME. Mondial Relay est le seul
 * transporteur contractualise, mais un depot en bureau de poste reste possible
 * pour un colis hors gabarit : fermer la liste empecherait de declarer une
 * expedition reelle, et le champ existe pour dire ce qui a ete fait.
 *
 * LE `datalist` PROPOSE SANS CONTRAINDRE : la saisie reste libre, bornee cote
 * serveur a 80 caracteres.
 */
const TRANSPORTEURS = ["Mondial Relay", "Colissimo", "Remise en main propre"];

/** Les trois modes d'ADR-025, ecrits en dur comme dans `validation.ts`. */
const MODES: ModeLivraison[] = ["DOMICILE", "POINT_RELAIS", "LOCKER"];

export function FormulaireExpedition({
  commandeId,
  numero,
  modeCommande,
}: {
  commandeId: string;
  numero: string;
  modeCommande: ModeLivraison;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{
    texte: string;
    erreur: boolean;
  } | null>(null);

  /*
   * LE MODE EXECUTE EST PRE-REMPLI AVEC CELUI DE LA COMMANDE, cas le plus
   * frequent de tres loin : le transporteur execute ce qui a ete paye. Il
   * reste modifiable, c'est tout l'objet du rebasculement.
   *
   * PRE-REMPLIR N'EST PAS RECOPIER. Ce que le service ecrit est la valeur du
   * champ au moment de l'envoi, jamais le mode de la commande relu en base :
   * la distinction est exactement ce que le critere 2 protege.
   */
  const [mode, setMode] = useState<ModeLivraison>(modeCommande);
  const [transporteur, setTransporteur] = useState(TRANSPORTEURS[0] ?? "");
  const [numeroSuivi, setNumeroSuivi] = useState("");
  const [pointRelaisId, setPointRelaisId] = useState("");

  /*
   * LE FORMULAIRE SE FERME APRES UN SUCCES, meme motif que la reference brulee
   * du remboursement : `revalidatePath` invalide le cache serveur, mais ce
   * composant client deja monte ne se remonte pas. Le laisser ouvert
   * proposerait de declarer une seconde fois un colis deja parti.
   */
  const [declaree, setDeclaree] = useState(false);

  const exigePointRelais = mode === "POINT_RELAIS" || mode === "LOCKER";

  const idTransporteur = `transporteur-${commandeId}`;
  const idListeTransporteurs = `liste-transporteurs-${commandeId}`;
  const idMode = `mode-${commandeId}`;
  const idSuivi = `suivi-${commandeId}`;
  const idPointRelais = `point-relais-${commandeId}`;
  const idMessage = `message-expedition-${commandeId}`;
  const idAideMode = `aide-mode-${commandeId}`;

  function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();

    const formulaire = new FormData();
    formulaire.set("commandeId", commandeId);
    formulaire.set("transporteur", transporteur);
    formulaire.set("mode", mode);
    formulaire.set("numeroSuivi", numeroSuivi);
    /*
     * LE POINT DE RETRAIT N'EST ENVOYE QUE S'IL EST EXIGE. Un champ masque qui
     * garde son ancienne valeur ferait refuser une livraison a domicile par la
     * contrainte d'equivalence, sans que l'exploitante voie le champ fautif.
     */
    formulaire.set("pointRelaisId", exigePointRelais ? pointRelaisId : "");

    demarrer(async () => {
      const resultat = await expedier(formulaire);

      /*
       * CHAQUE ISSUE A SON MESSAGE, aucune n'est laissee sans retour :
       * `frontend-design.md` interdit le faux succes optimiste.
       */
      switch (resultat.statut) {
        case "SUCCES":
          setDeclaree(true);
          setMessage({
            texte: `Commande ${numero} déclarée expédiée. Rafraîchir la page pour mettre la file à jour.`,
            erreur: false,
          });
          break;
        case "DEJA_EXPEDIEE":
          setDeclaree(true);
          setMessage({
            texte:
              "Cette commande porte déjà une expédition, aucune seconde " +
              "déclaration n'a été enregistrée. Rafraîchir la page.",
            erreur: true,
          });
          break;
        case "STATUT_INCOMPATIBLE":
          /*
           * L'ETAT REEL EST DIT : entre l'affichage et le clic, la commande a
           * pu etre annulee depuis son detail ou par une tache, et un refus
           * opaque laisserait croire a une panne.
           */
          setDeclaree(true);
          setMessage({
            texte: `Action impossible, cette commande n'est plus en préparation. Rafraîchir la page.`,
            erreur: true,
          });
          break;
        case "INVALIDE":
          setMessage({ texte: resultat.message, erreur: true });
          break;
        case "SESSION_ABSENTE":
          setMessage({
            texte: "Session expirée. Se reconnecter pour continuer.",
            erreur: true,
          });
          break;
        case "INTROUVABLE":
          setMessage({ texte: "Cette commande n'existe plus.", erreur: true });
          break;
        case "INDISPONIBLE":
          setMessage({
            texte: "Le service est momentanément indisponible. Réessayer.",
            erreur: true,
          });
          break;
      }
    });
  }

  return (
    <div>
      <form onSubmit={envoyer} className={styles.formulaire}>
        <div className={styles.champ}>
          <label htmlFor={idTransporteur}>Transporteur</label>
          <input
            id={idTransporteur}
            name="transporteur"
            type="text"
            list={idListeTransporteurs}
            value={transporteur}
            onChange={(evenement) => setTransporteur(evenement.target.value)}
            disabled={enCours || declaree}
            required
            aria-describedby={idMessage}
          />
          <datalist id={idListeTransporteurs}>
            {TRANSPORTEURS.map((nom) => (
              <option key={nom} value={nom} />
            ))}
          </datalist>
        </div>

        <div className={styles.champ}>
          <label htmlFor={idMode}>Mode réellement exécuté</label>
          <select
            id={idMode}
            name="mode"
            value={mode}
            onChange={(evenement) =>
              setMode(evenement.target.value as ModeLivraison)
            }
            disabled={enCours || declaree}
            aria-describedby={`${idAideMode} ${idMessage}`}
          >
            {MODES.map((valeur) => (
              <option key={valeur} value={valeur}>
                {LIBELLES_LIVRAISON[valeur] ?? valeur}
              </option>
            ))}
          </select>
          {/*
           * L'AIDE DIT POURQUOI CE CHAMP EXISTE, et elle n'est pas decorative :
           * sans elle, un mode different de celui de la commande se lit comme
           * une erreur de saisie a corriger, alors que c'est le cas d'usage.
           */}
          <p id={idAideMode} className={styles.aide}>
            Le modifier n&apos;altère pas la commande, qui garde le mode choisi
            et payé par le client. À changer seulement si le colis a réellement
            été remis autrement.
          </p>
        </div>

        {/*
         * LE CHAMP DE POINT DE RETRAIT N'EXISTE QUE S'IL EST EXIGE, plutot que
         * d'etre desactive : la contrainte est une EQUIVALENCE, une livraison a
         * domicile n'ADMET pas de point de retrait. Un champ desactive mais
         * present laisserait croire qu'il est facultatif.
         */}
        {exigePointRelais && (
          <div className={styles.champ}>
            <label htmlFor={idPointRelais}>Point de retrait exécuté</label>
            <input
              id={idPointRelais}
              name="pointRelaisId"
              type="text"
              value={pointRelaisId}
              onChange={(evenement) => setPointRelaisId(evenement.target.value)}
              disabled={enCours || declaree}
              required
              aria-describedby={idMessage}
            />
          </div>
        )}

        <div className={styles.champ}>
          <label htmlFor={idSuivi}>Numéro de suivi</label>
          <input
            id={idSuivi}
            name="numeroSuivi"
            type="text"
            value={numeroSuivi}
            onChange={(evenement) => setNumeroSuivi(evenement.target.value)}
            disabled={enCours || declaree}
            aria-describedby={idMessage}
          />
          {/*
           * PAS DE `required` NI DE `maxLength`. Le numero est FACULTATIF, un
           * depot ne le rendant pas toujours tout de suite, et le colis est
           * parti quand meme. `maxLength` bloquerait la frappe sans aucun
           * retour, defaut retenu en LS-160 : le serveur refuse et le dit.
           */}
        </div>

        <button
          type="submit"
          className={styles.bouton}
          disabled={enCours || declaree}
          /*
           * LE BOUTON PORTE LE RATTACHEMENT AU MESSAGE, comme sur les ecrans
           * voisins : trois issues n'ont AUCUN rapport avec un champ, la
           * session expiree, l'indisponibilite et le statut incompatible. Une
           * annonce polie passe une fois, et rien ne ramenerait au message.
           */
          aria-describedby={idMessage}
        >
          {enCours ? "Déclaration en cours…" : "Déclarer expédiée"}
        </button>
      </form>

      {/*
       * LA REGION EST TOUJOURS PRESENTE, MEME VIDE : une region live inseree en
       * meme temps que son contenu n'est pas lue par les lecteurs d'ecran.
       *
       * PAS D'`aria-label`, decision de LS-160 : il ANNULERAIT la description
       * des champs qui pointent ici, le calcul du nom accessible consultant
       * `aria-label` avant le contenu. Le champ s'annoncerait alors
       * « Transporteur, Résultat de l'expédition » sans jamais lire le refus.
       */}
      <p
        id={idMessage}
        className={`${styles.message} ${message?.erreur === true ? styles.messageErreur : ""}`}
        role="status"
      >
        {enCours ? "Déclaration en cours…" : (message?.texte ?? "")}
      </p>
    </div>
  );
}
