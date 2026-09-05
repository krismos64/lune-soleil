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
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import type { StatutCommande } from "@/generated/prisma/enums";
import { listerCommandesAExpedier } from "@/services/expedition";
import { formaterDate, LIBELLES_LIVRAISON } from "@/lib/affichage-commande";
import { FormulaireExpedition } from "./formulaire-expedition";
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

  const commandes = await listerCommandesAExpedier();

  return (
    <main className={styles.page}>
      <Link href="/administration/commandes" className={styles.retour}>
        Retour aux commandes
      </Link>

      <p className={styles.surtitre}>Mondial Relay</p>
      <h1 className={styles.titre}>Expéditions</h1>

      <p className={styles.introduction}>
        {commandes.length === 0
          ? "Aucune commande en cours d'acheminement."
          : "Les trois étapes d'un colis, de la commande payée à la remise."}
      </p>

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
    </main>
  );
}
