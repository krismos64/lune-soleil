/**
 * File de preparation des colis, LS-130. Etape 11 du parcours 1.
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. Le formulaire de
 * chaque carte vit dans `formulaire-expedition.tsx`, marque client, qui ne
 * requete rien lui-meme.
 *
 * `exigerAdministratrice` EST APPELE AVANT TOUT RENDU, et la Server Action porte
 * la MEME garde : proteger la page seule laisserait ouvert l'appel direct,
 * defaut de LS-89.
 *
 * L'ADRESSE EST AFFICHEE PARCE QU'ELLE SERT A COLLER L'ETIQUETTE. C'est une
 * donnee personnelle, et l'arbitrage de son affichage est ecrit dans
 * `.claude/familles-sans-action.txt` : la file est bornee aux commandes
 * `EN_PREPARATION`, sans recherche ni export, ce qui la distingue d'une
 * consultation en masse au sens d'ADR-021.
 */
import Link from "next/link";
import { Suspense } from "react";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import type { StatutCommande } from "@/generated/prisma/enums";
import { LIMITE_LISTE, listerCommandesAExpedier } from "@/services/expedition";
import { formaterDate, LIBELLES_LIVRAISON } from "@/lib/affichage-commande";
import { FormulaireExpedition } from "./formulaire-expedition";
import { ChargementAdministration } from "@/components/chargement-administration";
import styles from "./expeditions.module.css";

export const metadata = {
  title: "Expéditions",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UNE FILE DE PREPARATION MISE EN CACHE EST TROMPEUSE : une commande annulee
 * pendant que l'ecran est ouvert doit disparaitre au rafraichissement, sans
 * quoi l'exploitante prepare un colis pour une vente qui n'existe plus.
 */
export const dynamic = "force-dynamic";

/** Adresse figee, telle que la commande l'a copiee. A3, invariants 3 et 4. */
type AdresseFigee = {
  ligne1?: string;
  ligne2?: string;
  codePostal?: string;
  ville?: string;
  pays?: string;
  libelle?: string;
  nom?: string;
};

/*
 * LES MEMES LIGNES QUE LE DETAIL DE COMMANDE, et le `nom` en plus : sur une
 * etiquette de colis, le destinataire compte autant que la rue. Le detail de
 * commande l'affiche separement, ce qui n'est pas le geste d'ici.
 */
function lignesAdresse(valeur: unknown): string[] {
  if (valeur === null || typeof valeur !== "object") {
    return [];
  }

  const adresse = valeur as AdresseFigee;

  return [
    adresse.nom,
    adresse.libelle,
    adresse.ligne1,
    adresse.ligne2,
    [adresse.codePostal, adresse.ville].filter(Boolean).join(" "),
    adresse.pays,
  ].filter(
    (ligne): ligne is string => typeof ligne === "string" && ligne !== "",
  );
}

/**
 * Les trois colonnes du tableau, dans l'ordre du cycle de vie d'un colis.
 *
 * ELLES SONT ANCREES SUR LE STATUT DE LA COMMANDE et non sur une notion propre
 * a cet ecran : les trois valeurs viennent de `StatutCommande`, et la table de
 * transitions de LS-121 gouverne le passage de l'une a l'autre. Inventer ici un
 * etat « en transit » distinct ouvrirait un second vocabulaire pour la meme
 * chose.
 *
 * `LIVREE` N'A PAS DE COLONNE, et c'est deliberé : un colis remis ne demande
 * plus rien, et l'y garder ferait grossir l'ecran sans fin. Le detail de la
 * commande porte cette information.
 */
const COLONNES = [
  {
    statut: "CONFIRMEE",
    titre: "À préparer",
    vide: "Aucune commande payée en attente.",
  },
  {
    statut: "EN_PREPARATION",
    titre: "Prête à expédier",
    vide: "Aucun colis prêt à partir.",
  },
  {
    statut: "EXPEDIEE",
    titre: "En transit",
    vide: "Aucun colis chez le transporteur.",
  },
] as const satisfies readonly {
  statut: StatutCommande;
  titre: string;
  vide: string;
}[];

export default async function PageExpeditions() {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <Link
        href="/administration/commandes"
        className={styles.retour}
        prefetch={false}
      >
        Retour aux commandes
      </Link>

      <p className={styles.surtitre}>Mondial Relay</p>
      <h1 className={styles.titre}>Expéditions</h1>

      <Suspense fallback={<ChargementExpeditions />}>
        <FileExpeditions />
      </Suspense>
    </main>
  );
}

/** Armature affichee pendant que la file arrive, LS-139. */
function ChargementExpeditions() {
  return (
    <ChargementAdministration
      annonce="Chargement des expéditions…"
      lignes={4}
    />
  );
}

/**
 * La file elle-meme, seule partie de cet ecran qui lit la base.
 *
 * POURQUOI UN `<Suspense>` INTERNE ET NON UN `loading.tsx`, LS-139. Un fichier
 * de segment pose sa frontiere sur la page ENTIERE : le streaming demarre alors
 * des le premier `await`, et un statut ne se change plus une fois les octets
 * partis. Une base injoignable rendait donc **200** avec l'armature figee, au
 * lieu du 500 que `error.tsx` doit servir.
 *
 * Mesure en arretant reellement la base de production le 9 septembre 2026, sur
 * le catalogue public qui portait le meme defaut.
 *
 * NE PAS RETABLIR `expeditions/loading.tsx`.
 */
async function FileExpeditions() {
  const { commandes, tronquee } = await listerCommandesAExpedier();

  return (
    <>
      <p className={styles.introduction}>
        {commandes.length === 0
          ? "Aucune commande en cours d'acheminement."
          : "Les trois étapes d'un colis, de la commande payée à la remise."}
      </p>

      {tronquee ? (
        /*
         * LE PLAFOND EST DIT, LS-163 : une file qui tronque en silence fait
         * croire que tout est affiche, et l'exploitante conclut qu'elle a tout
         * prepare. Le nombre vient de la constante du service, jamais ecrit ici.
         *
         * AUCUN FILTRE N'ACCOMPAGNE CE MESSAGE, contrairement aux messages :
         * cette file ne porte QUE des commandes `EN_PREPARATION`, donc un filtre
         * ne revelerait rien.
         *
         * L'ARGUMENT DE FOND EST AILLEURS, ET IL EST PLUS SOLIDE, releve par
         * `ls-frontend-revue` : la file est triee du PLUS ANCIEN au plus recent.
         * Les cent affichees sont donc exactement celles a traiter en premier,
         * et la troncature cache du travail FUTUR, jamais du travail en retard.
         *
         * « COMMANDES A PREPARER » ET NON « COLIS » : rien n'est encore un colis
         * a ce stade, ces commandes n'ayant ni etiquette ni numero de suivi, et
         * l'ecran lui-meme parle de « la commande payée à la remise ».
         */
        <p className={styles.troncature} role="status">
          Seules les {LIMITE_LISTE} commandes à préparer les plus anciennes sont
          affichées. D&apos;autres attendent au-delà : elles remonteront à
          mesure que celles-ci partent.
        </p>
      ) : null}

      {commandes.length === 0 ? (
        /*
         * L'ETAT VIDE DIT POURQUOI ET NON SEULEMENT QU'IL EST VIDE. Un tableau
         * vide est le cas NORMAL la plupart du temps : sans cette phrase, il se
         * lit comme un ecran casse ou un filtre mal compris.
         */
        <p className={styles.vide}>
          Une commande apparaît ici dès que son paiement est confirmé, et la
          quitte une fois le colis remis à son destinataire.
        </p>
      ) : (
        <div className={styles.colonnes}>
          {COLONNES.map((colonne) => {
            const deLaColonne = commandes.filter(
              (commande) => commande.statut === colonne.statut,
            );

            return (
              <section
                key={colonne.statut}
                className={styles.colonne}
                aria-labelledby={`colonne-${colonne.statut}`}
              >
                <div className={styles.enTeteColonne}>
                  <h2
                    className={styles.titreColonne}
                    id={`colonne-${colonne.statut}`}
                  >
                    {colonne.titre}
                  </h2>
                  {/*
                   * LE COMPTEUR EST DECORATIF, le titre de section portant deja
                   * le nombre dans son texte masque : le faire lire donnerait
                   * « À préparer 2, 2 commandes ».
                   */}
                  <span className={styles.compteurColonne} aria-hidden="true">
                    {deLaColonne.length}
                  </span>
                  {/*
                   * A ZERO, RIEN N'EST ANNONCE : l'etat vide juste en dessous
                   * dit deja « Aucun colis chez le transporteur », en toutes
                   * lettres. Ajouter « 0 commande » ferait entendre deux fois
                   * la meme absence.
                   */}
                  {deLaColonne.length > 0 ? (
                    <span className={styles.invisible}>
                      , {deLaColonne.length}{" "}
                      {deLaColonne.length > 1 ? "commandes" : "commande"}
                    </span>
                  ) : null}
                </div>

                {deLaColonne.length === 0 ? (
                  <p className={styles.colonneVide}>{colonne.vide}</p>
                ) : (
                  <ul className={styles.listeCommandes}>
                    {deLaColonne.map((commande) => {
                      const pointRelais = lignesAdresse(
                        commande.pointRelaisAdresse,
                      );
                      const adresse = lignesAdresse(commande.adresseLivraison);

                      return (
                        <li key={commande.id} className={styles.carte}>
                          <div className={styles.enTeteCarte}>
                            <Link
                              href={`/administration/commandes/${commande.id}`}
                              className={styles.numero}
                              prefetch={false}
                            >
                              {commande.numero}
                            </Link>
                            <span className={styles.date}>
                              {formaterDate(commande.creeA)}
                            </span>
                          </div>

                          <p className={styles.client}>{commande.nomClient}</p>

                          {/*
                           * LE MODE AFFICHE EST CELUI QUE LE CLIENT A CHOISI ET PAYE,
                           * `Commande.modeLivraison`. C'est lui qui dit comment preparer
                           * le colis. Le mode REELLEMENT execute se saisit plus bas et
                           * peut differer, ADR-025 : les deux ne se confondent jamais.
                           */}
                          <p className={styles.mode}>
                            Mode choisi :{" "}
                            {LIBELLES_LIVRAISON[commande.modeLivraison] ??
                              commande.modeLivraison}
                          </p>

                          {/*
                           * LE POINT DE RETRAIT PREND LA PLACE DE L'ADRESSE quand il
                           * existe, meme regle que le detail de commande : c'est la
                           * destination reelle du colis.
                           */}
                          <address className={styles.adresse}>
                            {(pointRelais.length > 0
                              ? pointRelais
                              : adresse
                            ).map((ligne) => (
                              <span key={ligne}>{ligne}</span>
                            ))}
                          </address>

                          {/*
                           * LE FORMULAIRE N'EXISTE QUE SUR LA COLONNE DU MILIEU.
                           *
                           * CE N'EST PAS LA PROTECTION, et il ne faut pas le lire ainsi.
                           * `declarerExpedition` relit le statut EN BASE dans sa
                           * transaction et s'appuie sur `TRANSITIONS_ADMINISTRATRICE` :
                           * une commande `CONFIRMEE` ou `EXPEDIEE` est refusee meme si
                           * l'action est appelee directement en HTTP. Motif de LS-89, un
                           * ecran qui n'affiche pas un bouton n'empeche personne
                           * d'invoquer l'action.
                           *
                           * Ce test-ci evite d'AFFICHER un geste qui serait refuse, ce
                           * qui est une question de justesse de l'ecran, pas de securite.
                           */}
                          {commande.statut === "EN_PREPARATION" ? (
                            <FormulaireExpedition
                              commandeId={commande.id}
                              numero={commande.numero}
                              modeCommande={commande.modeLivraison}
                            />
                          ) : null}

                          {/*
                           * LE LIEN D'ETIQUETTE VIT SUR LA CARTE ET NON DANS LE
                           * FORMULAIRE, LS-218, et cette place est le correctif
                           * d'un defaut releve par la revue frontend.
                           *
                           * LE FORMULAIRE DISPARAIT DES QUE LA COMMANDE PASSE
                           * `EXPEDIEE`, condition ci-dessus : un lien qui n'y
                           * vivrait que dans l'etat du composant serait perdu au
                           * premier rafraichissement, et l'etiquette PAYEE
                           * deviendrait introuvable autrement qu'en retournant
                           * sur Sendcloud, ce que cette story existe pour
                           * supprimer.
                           *
                           * IL EST CONDITIONNE A `identifiantColis`, lu EN BASE :
                           * il n'apparait donc que sur une expedition creee par
                           * l'API, jamais sur une declaration manuelle qui n'a
                           * aucune etiquette a relire.
                           */}
                          {commande.identifiantColis !== null ? (
                            <a
                              href={`/administration/expeditions/etiquette/${commande.identifiantColis}`}
                              className={styles.lienEtiquette}
                              download
                            >
                              Télécharger l&apos;étiquette (PDF)
                            </a>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
