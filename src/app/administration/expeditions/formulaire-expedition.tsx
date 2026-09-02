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
import { useRef, useState, useTransition } from "react";

import type { ModeLivraison } from "@/generated/prisma/enums";
import { LIBELLES_LIVRAISON, LIBELLES_STATUT } from "@/lib/affichage-commande";
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

  /*
   * LE FOCUS DOIT ATTERRIR QUELQUE PART APRES LE GESTE, et ce point existe pour
   * cela. Au succes, `declaree` desactive le bouton QUI PORTE LE FOCUS : un
   * element desactive le perd, et le focus retombe sur `<body>`. Au clavier, la
   * tabulation repart alors du haut du document, donc avant la premiere carte,
   * sur une file qui peut en compter dix.
   *
   * C'EST LA VARIANTE DESACTIVEE DU PIEGE DEJA RENCONTRE sur un element
   * DETACHE : le bouton reste dans le DOM, donc aucune verification
   * d'`isConnected` ne l'attraperait, et le resultat pour la personne est le
   * meme. Releve par `ls-frontend-revue` le 2 septembre 2026.
   *
   * `tabIndex={-1}` REND LE CONTENEUR FOCALISABLE SANS L'AJOUTER A L'ORDRE DE
   * TABULATION : il se recoit par programme, jamais par la touche Tab, donc
   * rien n'est ajoute au parcours clavier normal.
   */
  const conteneur = useRef<HTMLDivElement>(null);

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
          conteneur.current?.focus();
          setMessage({
            texte: `Commande ${numero} déclarée expédiée. Rafraîchir la page pour mettre la file à jour.`,
            erreur: false,
          });
          break;
        case "DEJA_EXPEDIEE":
          setDeclaree(true);
          conteneur.current?.focus();
          setMessage({
            texte:
              "Cette commande porte déjà une expédition, aucune seconde " +
              "déclaration n'a été enregistrée. Rafraîchir la page.",
            erreur: true,
          });
          break;
        case "STATUT_INCOMPATIBLE":
          /*
           * L'ETAT REEL EST NOMME, comme sur l'ecran voisin des transitions.
           * Entre l'affichage et le clic, la commande a pu etre ANNULEE depuis
           * son detail ou par une tache : dire seulement « elle n'est plus en
           * preparation » laisserait chercher du cote d'une panne, quand la
           * cause est lisible et deja connue du serveur.
           *
           * Le commentaire de la premiere version promettait cet etat sans que
           * le message le porte, releve par `ls-frontend-revue` le 2 septembre
           * 2026. La cause etait un type elargi a `string` dans `actions.ts`,
           * qui interdisait d'indexer `LIBELLES_STATUT`.
           */
          setDeclaree(true);
          conteneur.current?.focus();
          setMessage({
            texte:
              `Action impossible, la commande est « ${LIBELLES_STATUT[resultat.statutActuel]} ». ` +
              "Rafraîchir la page.",
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
    <div ref={conteneur} tabIndex={-1} className={styles.bloc}>
      {/*
       * L'AVERTISSEMENT EST AVANT LE FORMULAIRE, jamais apres le bouton, meme
       * regle que l'ecran de remboursement : l'irreversibilite doit se lire
       * AVANT le geste, pas au moment de le regretter.
       *
       * ELLE EST REELLE ET NON THEORIQUE. `TRANSITIONS_ADMINISTRATRICE` de
       * LS-121 ne porte AUCUN retour depuis `EXPEDIEE` : une commande declaree
       * partie par erreur ne redevient pas « en preparation » depuis
       * l'interface, et l'unicite `commande_id` interdit une seconde
       * declaration. Une erreur se corrige alors en base, pas d'un clic.
       *
       * ELLE MANQUAIT ENTIEREMENT dans la premiere version : le mot
       * n'apparaissait que dans des commentaires de code, invisibles pour
       * l'exploitante. Releve par `ls-frontend-revue` le 2 septembre 2026.
       */}
      <p className={styles.avertissement}>
        Déclarer une expédition est irréversible : la commande passe à «
        Expédiée » et ne revient pas en préparation. À faire une fois le colis
        réellement remis au transporteur.
      </p>

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
           *
           * ELLE ANNONCE AUSSI LE CHAMP QUI APPARAIT, ajout du 2 septembre 2026
           * sur relevé de `ls-frontend-revue`. Changer le mode insere un champ
           * OBLIGATOIRE sous ce `select` : sans mention, la synthese vocale
           * n'annonce rien, et l'envoi echoue ensuite sur un champ dont
           * l'existence n'a jamais ete dite. Le rattachement passe par
           * `aria-describedby`, deja pose sur ce `select`, donc la phrase est
           * lue au moment ou le mode est choisi.
           */}
          <p id={idAideMode} className={styles.aide}>
            Le modifier n&apos;altère pas la commande, qui garde le mode choisi
            et payé par le client. À changer seulement si le colis a réellement
            été remis autrement. Un mode en relais ajoute un champ obligatoire,
            le point de retrait exécuté.
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
