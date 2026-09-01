"use client";

/**
 * Formulaires du tunnel de commande, LS-115.
 *
 * COMPOSANT CLIENT, ET LE SEUL DE L'ECRAN. Il porte la saisie et la navigation
 * entre etapes ; la page reste un composant serveur qui calcule les montants.
 *
 * IL NE CALCULE AUCUN MONTANT. Frais de port et total arrivent deja calcules du
 * serveur : un montant calcule dans le navigateur serait un montant que le
 * client peut influencer, `frontend-design.md`.
 *
 * LE FOCUS SE DEPLACE SUR LE TITRE A CHAQUE CHANGEMENT D'ETAPE, critere 7 et
 * LS-85. Sans cela, un changement d'etape laisse le focus sur le bouton
 * disparu, qui retombe sur `body` : la personne au lecteur d'ecran ne sait pas
 * que la page a change. Le piege est connu du projet, fiche « focus sur un
 * element detache ».
 */
import { formaterMontant } from "@/lib/montant";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { SaisieTunnel } from "@/lib/tunnel-cookie";
import type { ModeLivraison } from "@/generated/prisma/enums";
import type { Recapitulatif } from "@/services/tunnel";
import type { MotifIndisponible } from "@/services/panier";
import type { ResultatPointsRetrait } from "@/integrations/mondial-relay";
import {
  enregistrerAdresse,
  enregistrerCoordonnees,
  enregistrerLivraison,
  passerCommandeAction,
} from "./actions-tunnel";
import styles from "./commande.module.css";

type Etape = "coordonnees" | "adresse" | "livraison" | "recapitulatif";

/** Les quatre etapes dans l'ordre, pour situer celle qui est franchie. */
const ORDRE: readonly Etape[] = [
  "coordonnees",
  "adresse",
  "livraison",
  "recapitulatif",
];

/** Titre de chaque etape, aussi utilise pour l'annonce au lecteur d'ecran. */
const TITRES: Record<Etape, string> = {
  coordonnees: "Vos coordonnées",
  adresse: "Votre adresse de livraison",
  livraison: "Votre mode de livraison",
  recapitulatif: "Vérifier votre commande",
};

/** Libelle de chaque mode, avec ce qu'il implique pour le visiteur. */
const LIBELLES_MODE: Record<ModeLivraison, string> = {
  POINT_RELAIS: "Point Relais",
  LOCKER: "Locker",
  DOMICILE: "À domicile",
};

/**
 * Ce que chaque motif dit au visiteur, identique a la page du panier.
 *
 * LES TEXTES DISTINGUENT CE QUI REVIENDRA DE CE QUI NE REVIENDRA PAS.
 * « Épuisée » laisse esperer un reapprovisionnement, « retirée de la vente »
 * non.
 */
const TEXTE_MOTIF: Record<MotifIndisponible, string> = {
  VARIANTE_INTROUVABLE: "Cette pièce n'est plus disponible.",
  PLUS_VENDABLE: "Cette pièce a été retirée de la vente.",
  EPUISE: "Cette pièce est épuisée.",
  QUANTITE_REDUITE: "La quantité a été ajustée au stock restant.",
};

/**
 * Libelle visible de chaque champ, pour les messages d'erreur.
 *
 * `formaterProblemes` prefixe le message par le NOM TECHNIQUE du champ, ce qui
 * convient a un journal serveur mais pas a un client : il lisait
 * « telephone : ... » quand l'etiquette a l'ecran dit « Téléphone ». Le socle
 * reste inchange, sa forme etant juste pour son usage d'origine ; la traduction
 * appartient a l'ecran qui affiche. Releve par `ls-frontend-revue`.
 */
const LIBELLES_CHAMP: Record<string, string> = {
  nomClient: "Nom et prénom",
  email: "Adresse email",
  telephone: "Téléphone",
  ligne1: "Adresse",
  ligne2: "Complément",
  codePostal: "Code postal",
  ville: "Ville",
  pays: "Pays",
  mode: "Mode de livraison",
  pointRetrait: "Point de retrait",
};

/** Remplace le nom technique de chaque champ par son libelle visible. */
function messageLisible(brut: string): string {
  return brut
    .split(", ")
    .map((partie) => {
      const separateur = partie.indexOf(" : ");

      if (separateur === -1) {
        return partie;
      }

      const champ = partie.slice(0, separateur);
      const reste = partie.slice(separateur + 3);

      return `${LIBELLES_CHAMP[champ] ?? champ} : ${reste}`;
    })
    .join(", ");
}

export function EtapesTunnel({
  etape,
  saisie,
  recapitulatif,
  pointsRetrait,
}: {
  etape: Etape;
  saisie: SaisieTunnel;
  recapitulatif: Recapitulatif | null;
  pointsRetrait: ResultatPointsRetrait | null;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const titreRef = useRef<HTMLHeadingElement>(null);

  /*
   * LE TITRE RECOIT LE FOCUS A CHAQUE CHANGEMENT D'ETAPE.
   *
   * `tabIndex={-1}` EST INDISPENSABLE : sans lui, `focus()` sur un titre ne
   * fait rien du tout, l'element n'etant pas focusable. La page defilerait
   * peut-etre, mais le focus retomberait sur `body` sans qu'aucune erreur ne
   * soit levee, et `axe-core` ne le verrait pas. Fiche « cible du lien
   * d'evitement ».
   */
  useEffect(() => {
    titreRef.current?.focus();
  }, [etape]);

  /** Envoie une etape, puis avance ou affiche l'erreur. */
  function envoyer(
    action: (
      entree: unknown,
    ) => Promise<
      | { statut: "OK"; etapeSuivante: string }
      | { statut: "INVALIDE"; message: string }
    >,
    entree: unknown,
  ): void {
    demarrer(async () => {
      const resultat = await action(entree);

      /*
       * LE RESULTAT EST LU, JAMAIS IGNORE. Annoncer « enregistré » sans
       * regarder le retour serait un faux succes, interdit par
       * `frontend-design.md`. Le defaut a ete releve en LS-114 par
       * `ls-frontend-revue`.
       */
      if (resultat.statut === "INVALIDE") {
        setErreur(messageLisible(resultat.message));
        return;
      }

      setErreur("");
      router.push(`/commande?etape=${resultat.etapeSuivante}`);
    });
  }

  /**
   * Etape 4, passation de la commande.
   *
   * LE REFUS NOMME LA PIECE, critere 3 de LS-117. Le message reste metier,
   * « cette piece vient d'etre vendue », et le panier est conserve : le client
   * peut retirer la ligne et poursuivre avec le reste.
   */
  function commander(): void {
    demarrer(async () => {
      const resultat = await passerCommandeAction();

      if (resultat.statut === "REFUSE") {
        const ligne = recapitulatif?.lignes.find(
          (candidate) => candidate.varianteId === resultat.varianteRefusee,
        );

        setErreur(
          ligne === undefined
            ? "Une pièce de votre panier vient d'être vendue. Vérifiez votre panier avant de recommencer."
            : `${ligne.produitNom}, ${ligne.libelle} vient d'être vendue. Retirez cette pièce de votre panier pour continuer.`,
        );
        return;
      }

      if (resultat.statut === "REESSAYER" || resultat.statut === "INVALIDE") {
        setErreur(messageLisible(resultat.message));
        return;
      }

      setErreur("");

      /*
       * LA REDIRECTION VERS LE PRESTATAIRE VIENT DU SERVEUR, LS-118 : l'URL de
       * session est rendue par l'action, jamais construite ici. `assign` et non
       * `router.push`, la destination etant hors du site.
       *
       * SANS URL, LA CREATION DE SESSION A ECHOUE : cas d'erreur du parcours 1,
       * la commande existe et reste payable. La confirmation explique et porte
       * le bouton de reessai, `retour=indisponible` ne choisissant que les mots.
       */
      if (resultat.urlPaiement !== null) {
        window.location.assign(resultat.urlPaiement);
        return;
      }

      /*
       * `encodeURIComponent` bien que le format d'ADR-031 soit alphanumerique :
       * une chaine construite a l'execution ne se relit pas au moment ou le
       * format change. Fiche « chaine construite a l'execution ».
       */
      router.push(
        `/commande/confirmation?retour=indisponible&numero=${encodeURIComponent(resultat.numero)}`,
      );
    });
  }

  return (
    <>
      {/*
       * LE FIL EST NAVIGABLE VERS L'ARRIERE, et il ne l'etait pas.
       *
       * Sans cela, corriger une faute d'adresse depuis le recapitulatif
       * imposait de repasser par le panier ou d'editer l'URL a la main, sur
       * l'ecran dont la raison d'etre est justement de permettre la correction
       * avant paiement. Releve par `ls-frontend-revue`.
       *
       * VERS L'AVANT, RIEN N'EST CLIQUABLE : une etape non atteinte reste un
       * simple libelle. La page ramene de toute facon a la premiere etape
       * incomplete, mais offrir le lien promettrait un raccourci qui n'existe
       * pas.
       */}
      <ol className={styles.fil} aria-label="Progression de la commande">
        {(Object.keys(TITRES) as Etape[]).map((cle, rang) => {
          const franchie = ORDRE.indexOf(cle) < ORDRE.indexOf(etape);

          return (
            <li
              key={cle}
              className={cle === etape ? styles.filActuel : styles.filEtape}
              aria-current={cle === etape ? "step" : undefined}
            >
              <span className={styles.filRang}>{rang + 1}</span>
              {franchie ? (
                <Link
                  href={`/commande?etape=${cle}`}
                  className={styles.filLien}
                >
                  {TITRES[cle]}
                  {/*
                   * LE COMPLEMENT EST UNE PHRASE AUTONOME, sans virgule
                   * d'attaque. Colle au titre par une virgule, le nom
                   * accessible devenait « Vos coordonnées , revenir à cette
                   * étape » : une espace avant la virgule, faute de
                   * typographie francaise que la concatenation JSX introduit
                   * toute seule. Mesure a l'`ariaSnapshot` le 25 aout 2026.
                   */}
                  <span className={styles.invisible}>
                    {"Revenir à cette étape."}
                  </span>
                </Link>
              ) : (
                <span className={styles.filLibelle}>{TITRES[cle]}</span>
              )}
            </li>
          );
        })}
      </ol>

      <h1 ref={titreRef} tabIndex={-1} className={styles.titre}>
        {TITRES[etape]}
      </h1>

      {/*
       * REGION LIVE DES ERREURS, `alert` et non `status`, critere 8. Une erreur
       * de saisie interrompt la personne : c'est precisement ce que `alert`
       * fait et que `status` evite.
       */}
      <p
        role="alert"
        aria-label="Erreurs de saisie"
        className={erreur === "" ? styles.erreurVide : styles.erreur}
      >
        {erreur}
      </p>

      {etape === "coordonnees" && (
        <form
          className={styles.formulaire}
          onSubmit={(evenement) => {
            evenement.preventDefault();
            const donnees = new FormData(evenement.currentTarget);
            envoyer(enregistrerCoordonnees, {
              nomClient: String(donnees.get("nomClient") ?? ""),
              email: String(donnees.get("email") ?? ""),
              telephone: String(donnees.get("telephone") ?? ""),
            });
          }}
        >
          <label className={styles.champ}>
            <span className={styles.libelle}>Nom et prénom</span>
            <input
              name="nomClient"
              defaultValue={saisie.nomClient}
              maxLength={120}
              autoComplete="name"
              required
              className={styles.saisie}
            />
          </label>

          <label className={styles.champ}>
            <span className={styles.libelle}>Adresse email</span>
            <input
              name="email"
              type="email"
              defaultValue={saisie.email}
              autoComplete="email"
              required
              className={styles.saisie}
            />
            <span className={styles.aide}>
              Elle sert à vous envoyer la confirmation et la facture.
            </span>
          </label>

          <label className={styles.champ}>
            <span className={styles.libelle}>
              Téléphone <span className={styles.facultatif}>(facultatif)</span>
            </span>
            <input
              name="telephone"
              type="tel"
              defaultValue={saisie.telephone ?? ""}
              autoComplete="tel"
              className={styles.saisie}
            />
            <span className={styles.aide}>
              Le transporteur s&apos;en sert pour prévenir de la mise à
              disposition du colis.
            </span>
          </label>

          <button type="submit" disabled={enCours} className={styles.suivant}>
            {enCours ? "Enregistrement…" : "Continuer"}
          </button>
        </form>
      )}

      {etape === "adresse" && (
        <form
          className={styles.formulaire}
          onSubmit={(evenement) => {
            evenement.preventDefault();
            const donnees = new FormData(evenement.currentTarget);
            const ligne2 = String(donnees.get("ligne2") ?? "").trim();

            envoyer(enregistrerAdresse, {
              ligne1: String(donnees.get("ligne1") ?? ""),
              ...(ligne2 === "" ? {} : { ligne2 }),
              codePostal: String(donnees.get("codePostal") ?? ""),
              ville: String(donnees.get("ville") ?? ""),
              pays: "FR",
            });
          }}
        >
          <label className={styles.champ}>
            <span className={styles.libelle}>Adresse</span>
            <input
              name="ligne1"
              defaultValue={saisie.adresse.ligne1}
              maxLength={120}
              autoComplete="address-line1"
              required
              className={styles.saisie}
            />
          </label>

          <label className={styles.champ}>
            <span className={styles.libelle}>
              Complément <span className={styles.facultatif}>(facultatif)</span>
            </span>
            <input
              name="ligne2"
              defaultValue={saisie.adresse.ligne2 ?? ""}
              maxLength={120}
              autoComplete="address-line2"
              className={styles.saisie}
            />
          </label>

          <label className={styles.champ}>
            <span className={styles.libelle}>Code postal</span>
            <input
              name="codePostal"
              defaultValue={saisie.adresse.codePostal}
              maxLength={5}
              autoComplete="postal-code"
              inputMode="numeric"
              required
              className={styles.saisie}
            />
          </label>

          <label className={styles.champ}>
            <span className={styles.libelle}>Ville</span>
            <input
              name="ville"
              defaultValue={saisie.adresse.ville}
              maxLength={80}
              autoComplete="address-level2"
              required
              className={styles.saisie}
            />
          </label>

          <button type="submit" disabled={enCours} className={styles.suivant}>
            {enCours ? "Enregistrement…" : "Continuer"}
          </button>
        </form>
      )}

      {etape === "livraison" && (
        <ChoixLivraison
          saisie={saisie}
          pointsRetrait={pointsRetrait}
          enCours={enCours}
          onValider={(choix) => envoyer(enregistrerLivraison, choix)}
        />
      )}

      {etape === "recapitulatif" && recapitulatif !== null && (
        <Recapitulatif
          recapitulatif={recapitulatif}
          enCours={enCours}
          onCommander={commander}
        />
      )}
    </>
  );
}

/**
 * Etape 3, le mode de livraison.
 *
 * QUAND LE TRANSPORTEUR NE REPOND PAS, seuls les modes sans point de retrait
 * sont proposes et le message l'explique. La vente continue a domicile : c'est
 * le cas d'erreur du parcours 1 et le critere 6 de la story.
 */
function ChoixLivraison({
  saisie,
  pointsRetrait,
  enCours,
  onValider,
}: {
  saisie: SaisieTunnel;
  pointsRetrait: ResultatPointsRetrait | null;
  enCours: boolean;
  onValider: (choix: {
    mode: ModeLivraison;
    pointRetrait: SaisieTunnel["pointRetrait"];
  }) => void;
}) {
  const [mode, setMode] = useState<ModeLivraison | null>(saisie.mode);
  const [pointChoisi, setPointChoisi] = useState(saisie.pointRetrait);

  const indisponible = pointsRetrait !== null && !pointsRetrait.disponible;
  const modesOfferts = indisponible
    ? pointsRetrait.modesEncoreProposables
    : (["POINT_RELAIS", "LOCKER", "DOMICILE"] as const);

  const exigePoint = mode === "POINT_RELAIS" || mode === "LOCKER";

  return (
    <form
      className={styles.formulaire}
      onSubmit={(evenement) => {
        evenement.preventDefault();

        /*
         * AUCUN MODE PAR DEFAUT N'EST ENVOYE. Tant que rien n'est coche, la
         * soumission ne fait rien : poser `DOMICILE` en repli ferait choisir a
         * la place du visiteur, ce qui est precisement le defaut que le mode
         * nullable ferme.
         */
        if (mode === null) {
          return;
        }

        onValider({
          mode,
          /*
           * LE POINT EST MIS A `null` DES QUE LE MODE N'EN VEUT PAS. Sans cela,
           * choisir un relais puis revenir au domicile enverrait un DOMICILE
           * porteur d'un point, que le schema refuse a juste titre : le
           * visiteur verrait une erreur qu'il n'a pas causee.
           */
          pointRetrait: exigePoint ? pointChoisi : null,
        });
      }}
    >
      {indisponible && (
        <p
          role="status"
          aria-label="Disponibilité des points de retrait"
          className={styles.avertissement}
        >
          {pointsRetrait.message}
        </p>
      )}

      <fieldset className={styles.modes}>
        <legend className={styles.libelle}>Mode de livraison</legend>

        {modesOfferts.map((candidat) => (
          <label key={candidat} className={styles.mode}>
            <input
              type="radio"
              name="mode"
              value={candidat}
              checked={mode === candidat}
              onChange={() => setMode(candidat)}
              className={styles.radio}
            />
            <span>{LIBELLES_MODE[candidat]}</span>
          </label>
        ))}
      </fieldset>

      {exigePoint && (
        <fieldset className={styles.modes}>
          <legend className={styles.libelle}>Point de retrait</legend>

          {pointsRetrait !== null && pointsRetrait.points.length > 0 ? (
            pointsRetrait.points.map((point) => (
              <label key={point.identifiant} className={styles.mode}>
                <input
                  type="radio"
                  name="pointRetrait"
                  value={point.identifiant}
                  checked={pointChoisi?.identifiant === point.identifiant}
                  onChange={() => setPointChoisi(point)}
                  className={styles.radio}
                />
                <span>
                  {point.nom}, {point.ligne1}, {point.codePostal} {point.ville}
                </span>
              </label>
            ))
          ) : (
            <p className={styles.aide}>
              Aucun point de retrait n&apos;est disponible pour le moment.
            </p>
          )}
        </fieldset>
      )}

      <button
        type="submit"
        disabled={enCours || mode === null}
        className={styles.suivant}
      >
        {enCours ? "Enregistrement…" : "Continuer"}
      </button>
    </form>
  );
}

/**
 * Etape 4, le recapitulatif avant paiement.
 *
 * CE QU'IL DOIT PORTER EST ETABLI PAR LS-86, aux sources. L221-14 alinea 1
 * impose de rappeler les caracteristiques essentielles et le prix.
 *
 * L'ADRESSE N'EST IMPOSEE PAR AUCUN TEXTE : elle est affichee par decision
 * d'ergonomie du 25 aout 2026, parce qu'elle evite les erreurs de saisie et les
 * colis non distribues. Ne pas transformer cette decision en obligation legale.
 */
function Recapitulatif({
  recapitulatif,
  enCours,
  onCommander,
}: {
  recapitulatif: Recapitulatif;
  enCours: boolean;
  onCommander: () => void;
}) {
  const { adresseRappelee } = recapitulatif;

  return (
    <div className={styles.recapitulatif}>
      {/*
       * LA CONFIRMATION DEMANDEE QUAND LE PANIER A CHANGE, part du critere 6 de
       * LS-114 laissee ouverte : le mecanisme etait livre, le moment de le
       * declencher appartenait a ce tunnel.
       */}
      {recapitulatif.aChange && (
        <p
          role="alert"
          aria-label="Changement dans votre panier"
          className={styles.avertissement}
        >
          Certaines pièces ont changé depuis votre dernière visite. Vérifiez le
          récapitulatif ci-dessous avant de payer.
        </p>
      )}

      <section className={styles.bloc}>
        <h2 className={styles.sousTitre}>Vos pièces</h2>
        <ul className={styles.lignes}>
          {recapitulatif.lignes.map((ligne) => (
            <li key={ligne.varianteId} className={styles.ligne}>
              <span className={styles.ligneNom}>
                {ligne.produitNom}, {ligne.libelle}
              </span>
              <span className={styles.ligneQuantite}>×{ligne.quantite}</span>
              <span className={styles.lignePrix}>
                {formaterMontant(ligne.totalLigneCentimes)}
              </span>
              {/*
               * LE MOTIF EST RENDU ICI AUSSI, et pas seulement au panier.
               * `LignePanierRevalidee.motif` existe depuis LS-114 et la page du
               * panier l'affiche ; le tunnel consommait le meme type en
               * l'ignorant. Un client voyait sa quantite passer de 1 a 0 sans
               * une ligne d'explication. Quatrieme occurrence du motif « champ
               * d'etat ajoute sans etre porte partout ».
               */}
              {ligne.motif !== null && (
                <span className={styles.ligneMotif}>
                  {TEXTE_MOTIF[ligne.motif]}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.bloc}>
        <h2 className={styles.sousTitre}>Vos coordonnées</h2>
        <p className={styles.donnee}>{recapitulatif.nomClient}</p>
        <p className={styles.donnee}>{recapitulatif.email}</p>
        {recapitulatif.telephone !== null && (
          <p className={styles.donnee}>{recapitulatif.telephone}</p>
        )}
      </section>

      <section className={styles.bloc}>
        <h2 className={styles.sousTitre}>
          {adresseRappelee.nature === "POINT_RETRAIT"
            ? "Votre point de retrait"
            : "Votre adresse de livraison"}
        </h2>

        {/*
         * EN POINT RELAIS, LE NOM DU DESTINATAIRE EST RAPPELE A COTE DU POINT :
         * c'est l'identite a presenter au retrait. L'adresse personnelle, elle,
         * n'a aucun usage puisque le colis part au commerce partenaire.
         */}
        {adresseRappelee.nature === "POINT_RETRAIT" && (
          <>
            <p className={styles.donnee}>{adresseRappelee.nomPoint}</p>
            <p className={styles.aide}>
              À retirer au nom de {recapitulatif.nomClient}.
            </p>
          </>
        )}

        <p className={styles.donnee}>{adresseRappelee.ligne1}</p>
        {adresseRappelee.ligne2 !== undefined && (
          <p className={styles.donnee}>{adresseRappelee.ligne2}</p>
        )}
        <p className={styles.donnee}>
          {adresseRappelee.codePostal} {adresseRappelee.ville}
        </p>
        <p className={styles.donnee}>{LIBELLES_MODE[recapitulatif.mode]}</p>
      </section>

      <section className={styles.bloc}>
        <h2 className={styles.sousTitre}>Total</h2>

        <p className={styles.totalLigne}>
          <span>Sous-total</span>
          <span>{formaterMontant(recapitulatif.totalArticlesCentimes)}</span>
        </p>

        <p className={styles.totalLigne}>
          <span>Livraison</span>
          <span>
            {recapitulatif.livraisonOfferte
              ? "Offerte"
              : formaterMontant(recapitulatif.fraisPortCentimes)}
          </span>
        </p>

        <p className={styles.totalFinal}>
          <span>Total</span>
          <span>{formaterMontant(recapitulatif.totalCentimes)}</span>
        </p>
      </section>

      {/*
       * LE LIBELLE DU BOUTON EST IMPOSE PAR L221-14 ALINEA 2 : la fonction de
       * validation porte la mention « commande avec obligation de paiement »,
       * ou une formule analogue denuee de toute ambiguite. « Payer » ou
       * « Valider » seuls ne satisfont pas cette exigence. Etabli par LS-86.
       *
       * IL ECRIT LA COMMANDE PUIS PART AU PAIEMENT, LS-117 puis LS-118 : la
       * session se cree APRES le commit, ADR-024, et la redirection vers le
       * prestataire suit. Un echec de creation laisse la commande payable
       * depuis la page de confirmation.
       *
       * DESACTIVE PENDANT L'ENVOI, sans quoi un double clic lance deux
       * transactions : la seconde echouerait sur une piece unique, mais
       * creerait une commande de plus sur un stock a plusieurs exemplaires.
       */}
      <button
        type="button"
        disabled={enCours}
        onClick={onCommander}
        className={styles.payer}
      >
        {enCours ? "Enregistrement…" : "Commander avec obligation de paiement"}
      </button>

      <p className={styles.aide}>
        Paiement sécurisé par Stripe. La page de paiement s&apos;ouvre après
        validation.
      </p>
    </div>
  );
}
