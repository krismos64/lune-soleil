/**
 * Rubrique Messages de l'administration, LS-97.
 *
 * COMPOSANT SERVEUR : il exige le role, lit la base et rend. Le classement d'un
 * message vit dans `classement-message.tsx`, marque client, qui ne requete rien.
 *
 * `exigerAdministratrice` EST APPELE AVANT TOUT RENDU, et la Server Action porte
 * la MEME garde : proteger la page seule laisserait ouvert l'appel direct,
 * defaut de LS-89.
 *
 * LA REPONSE PART PAR `mailto:`, ARBITRAGE DE CHRISTOPHE DU 2 SEPTEMBRE 2026.
 * Le prototype montre un champ de reponse avec un bouton d'envoi, mais ADR-008
 * dit deja l'inverse en toutes lettres : « La boite contact@lune-soleil.fr garde
 * son usage humain. La correspondance avec les clients ne passe pas par le
 * code. »
 *
 * TROIS RAISONS, ET LA TROISIEME EST DECISIVE :
 *
 *   - l'exploitante garde le fil dans SA boite, avec l'historique et la
 *     recherche que son client mail lui donne deja
 *   - repondre depuis le code demanderait une entite de reponse, son passage par
 *     l'outbox et un fil a l'ecran : le double du travail pour moins de service
 *   - l'adresse d'expedition devrait rester celle du domaine authentifie, jamais
 *     celle du client, sous peine de casser SPF et DKIM. La delivrabilite est
 *     deja fragile chez Yahoo, LS-155 n'etant pas close
 *
 * Une reponse integree reste possible plus tard, dans une story a elle.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import type { StatutMessage } from "@/generated/prisma/enums";
import { listerMessages } from "@/services/message-contact";
import { formaterDate } from "@/lib/affichage-commande";
import { ClassementMessage } from "./classement-message";
import styles from "./messages.module.css";

export const metadata = {
  title: "Messages, administration",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UNE LISTE DE MESSAGES MISE EN CACHE EST TROMPEUSE : un message arrive pendant
 * que l'ecran est ouvert doit se voir au rafraichissement, et un statut change
 * depuis un autre onglet ne doit pas reapparaitre « nouveau ».
 */
export const dynamic = "force-dynamic";

/**
 * Libelle affichable d'un statut, jamais la valeur brute de l'enum.
 *
 * `Record<StatutMessage, string>` ET NON `Record<string, string>`, correction du
 * 2 septembre 2026 relevee par `ls-frontend-revue`. La forme large compilait
 * sans rien garantir : ajouter une valeur a l'enum aurait affiche `ARCHIVE` en
 * majuscules, sans badge ni couleur, et aucun controle n'aurait rougi.
 *
 * TYPE SUR L'ENUM, `tsc` REFUSE LE FICHIER tant que le libelle manque. C'est le
 * meme mecanisme que `LIBELLES_STATUT` de l'ecran des commandes et que le
 * `Record` des modeles d'email : le piege « un enum ajoute casse l'affichage »
 * a deja frappe ce depot, et il se ferme par le typage, jamais par la
 * vigilance.
 */
const LIBELLES: Record<StatutMessage, string> = {
  NOUVEAU: "Nouveau",
  LU: "Lu",
  TRAITE: "Traité",
};

export default async function PageMessages() {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  const messages = await listerMessages();
  const nouveaux = messages.filter(
    (message) => message.statut === "NOUVEAU",
  ).length;

  return (
    <main className={styles.page}>
      <Link href="/administration/commandes" className={styles.retour}>
        Retour aux commandes
      </Link>

      <h1 className={styles.titre}>Messages</h1>

      <p className={styles.introduction}>
        {messages.length === 0
          ? "Aucun message reçu."
          : `${messages.length} message${messages.length > 1 ? "s" : ""}, dont ${nouveaux} non lu${nouveaux > 1 ? "s" : ""}.`}
      </p>

      {messages.length === 0 ? (
        /*
         * L'ETAT VIDE DIT POURQUOI ET NON SEULEMENT QU'IL EST VIDE, meme regle
         * que la file d'expedition : une boite vide est le cas normal la
         * plupart du temps, et sans cette phrase elle se lit comme un ecran
         * casse.
         */
        <p className={styles.vide}>
          Les demandes envoyées par le formulaire de contact du site arrivent
          ici. Elles sont conservées même si l&apos;email de notification
          n&apos;est pas parti.
        </p>
      ) : (
        <ul className={styles.listeMessages}>
          {messages.map((message) => (
            <li key={message.id} className={styles.carte}>
              <div className={styles.enTeteCarte}>
                {/*
                 * LE REPLI `?? message.statut` A DISPARU avec le typage
                 * ci-dessus : il masquait le trou au lieu de le signaler, en
                 * affichant une valeur brute d'enum a une exploitante. Le
                 * libelle est desormais garanti par `tsc`.
                 *
                 * LA CLASSE DE BADGE GARDE SON REPLI, elle : les modules CSS
                 * sont types `Record<string, string>` par le chargeur, donc
                 * `tsc` ne peut rien garantir de ce cote. Un statut sans style
                 * s'affiche alors sans fond plutot que de faire lever le rendu.
                 */}
                <span
                  className={`${styles.badge} ${styles[`badge${message.statut}`] ?? ""}`}
                >
                  {LIBELLES[message.statut]}
                </span>
                <span className={styles.date}>
                  {formaterDate(message.creeA)}
                </span>
              </div>

              <h2 className={styles.sujet}>{message.sujet}</h2>

              <p className={styles.expediteur}>
                {message.nom}
                {" · "}
                {/*
                 * L'ADRESSE EST UN LIEN `mailto:` AVEC SUJET PRE-REMPLI, et
                 * c'est tout le mecanisme de reponse de cette story : le fil
                 * reste dans la boite de l'exploitante, ou son client mail lui
                 * donne deja historique et recherche.
                 *
                 * LE PREFIXE « Re : » EST POSE ICI, sans quoi elle le
                 * retaperait a chaque fois, et le fil se casserait cote client.
                 */}
                <a
                  /*
                   * L'ADRESSE N'EST PAS ENCODEE, LE SUJET L'EST, et cette
                   * asymetrie est mesuree plutot que supposee.
                   *
                   * `encodeURIComponent` transforme l'arobase en `%40` :
                   * certains clients mail l'acceptent, d'autres ouvrent une
                   * fenetre avec une adresse illisible, et l'adresse est de
                   * toute facon deja validee par `schemaEmailClient`, donc sans
                   * caractere a echapper.
                   *
                   * LE SUJET, LUI, PORTE DES ESPACES ET DES DEUX-POINTS, qui
                   * couperaient l'URL sans encodage.
                   */
                  href={`mailto:${message.email}?subject=${encodeURIComponent(`Re : ${message.sujet}`)}`}
                  className={styles.lienEmail}
                >
                  {message.email}
                </a>
              </p>

              {/*
               * LE CORPS EST RENDU DANS UN `details` PLIABLE, jamais deplie
               * d'office : il peut atteindre 4000 caracteres, et cinq messages
               * deplies rendraient la liste impraticable a 320 px.
               *
               * LE `summary` PORTE UN LIBELLE EXPLICITE et non une fleche
               * seule : un nom accessible est exige sur tout controle,
               * `frontend-design.md`.
               */}
              <details className={styles.detail}>
                <summary className={styles.resume}>Lire le message</summary>
                {/*
                 * `white-space: pre-wrap` PRESERVE LES RETOURS A LA LIGNE que la
                 * personne a saisis. Sans lui, un message structure en
                 * paragraphes s'afficherait en un bloc continu.
                 */}
                <p className={styles.corps}>{message.corps}</p>
              </details>

              <ClassementMessage
                messageId={message.id}
                statutActuel={message.statut}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
