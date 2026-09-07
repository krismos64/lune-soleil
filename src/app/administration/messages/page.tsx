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
import { LIMITE_LISTE, listerMessages } from "@/services/message-contact";
import { formaterDate } from "@/lib/affichage-commande";
import { ClassementMessage } from "./classement-message";
import styles from "./messages.module.css";

export const metadata = {
  title: "Messages",
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

/**
 * Les filtres proposes, LS-163, dans l'ordre du cycle de vie d'un message.
 *
 * ILS PORTENT L'ATTEIGNABILITE, critere 2. Sans pagination, c'est le filtre qui
 * rend joignable un message ancien : « Nouveaux » retire de la liste ceux qui
 * sont deja traites, donc fait remonter ceux que le plafond de cent cachait.
 *
 * MEME FORME QUE L'ECRAN DES COMMANDES, `TOUS` etant une valeur du filtre et non
 * un statut : la table decide de ce qui s'affiche ET de ce qui est accepte, donc
 * l'ecran et le service ne peuvent pas diverger.
 */
const FILTRES: { valeur: StatutMessage | "TOUS"; libelle: string }[] = [
  { valeur: "TOUS", libelle: "Tous" },
  { valeur: "NOUVEAU", libelle: "Nouveaux" },
  { valeur: "LU", libelle: "Lus" },
  { valeur: "TRAITE", libelle: "Traités" },
];

export default async function PageMessages({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const enTetes = await headers();

  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  const parametres = await searchParams;

  /*
   * LA VALEUR DE L'URL N'ATTEINT JAMAIS LA REQUETE, invariant 7 : elle sert
   * uniquement a retrouver une entree de la table ci-dessus, et une valeur
   * inconnue retombe sur « Tous » plutot que de produire une liste vide. Un lien
   * partage avec un parametre perime doit montrer quelque chose.
   */
  const filtreDemande = FILTRES.find(
    (filtre) => filtre.valeur === parametres.statut,
  );
  const filtreActif = filtreDemande ?? FILTRES[0]!;

  const { messages, tronquee, total, nouveaux } = await listerMessages(
    undefined,
    filtreActif.valeur === "TOUS" ? undefined : filtreActif.valeur,
  );

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      <Link
        href="/administration/commandes"
        className={styles.retour}
        prefetch={false}
      >
        Retour aux commandes
      </Link>

      <h1 className={styles.titre}>Messages</h1>

      {/*
       * LES DEUX NOMBRES VIENNENT DE LA BASE, JAMAIS DE LA TRANCHE, LS-163 et
       * critere 1. Ils comptent TOUS les messages, filtre compris : c'est ce
       * qui les rend justes une fois le plafond de cent franchi, la ou
       * `messages.length` aurait dit « 100 » pour toujours.
       */}
      <p className={styles.introduction}>
        {total === 0
          ? "Aucun message reçu."
          : `${total} message${total > 1 ? "s" : ""}, dont ${nouveaux} non lu${nouveaux > 1 ? "s" : ""}.`}
      </p>

      {/*
       * LES FILTRES, critere 2 : le seul chemin vers un message que le plafond
       * cache. Ils sont des LIENS et non un formulaire, donc l'etat vit dans
       * l'URL, se partage et repond au retour navigateur.
       */}
      {/*
       * `aria-label` NOMME LE CRITERE, jamais l'objet filtre : « Filtrer par
       * statut », comme les quatre autres barres du depot. Il n'y a qu'une
       * barre par ecran, donc redire « les messages » n'apprend rien qu'un
       * lecteur d'ecran ne sache deja par le `h1`.
       */}
      <nav aria-label="Filtrer par statut" className={styles.filtres}>
        {/*
         * `ul`/`li` COMME LES QUATRE AUTRES BARRES, et ce n'est pas decoratif :
         * un lecteur d'ecran annonce « liste de 4 elements » et permet d'en
         * sortir d'un geste. Les liens nus perdaient cette annonce, seul ecart
         * du depot.
         */}
        <ul className={styles.listeFiltres}>
          {FILTRES.map((filtre) => (
            <li key={filtre.valeur}>
              <Link
                href={
                  filtre.valeur === "TOUS"
                    ? "/administration/messages"
                    : `/administration/messages?statut=${filtre.valeur}`
                }
                className={styles.filtre}
                prefetch={false}
                /*
                 * `aria-current="page"` PORTE L'INFORMATION, la couleur ne fait
                 * que l'appuyer : `frontend-design.md` interdit qu'une
                 * information passe par la seule couleur.
                 */
                aria-current={
                  filtre.valeur === filtreActif.valeur ? "page" : undefined
                }
              >
                {filtre.libelle}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tronquee ? (
        /*
         * LE PLAFOND EST DIT, critere 1 : une liste qui tronque en silence fait
         * croire que tout est affiche, et l'exploitante conclut qu'elle a tout
         * traite. Le nombre vient de la constante du service, jamais ecrit ici :
         * un « 100 » en dur serait une seconde source de verite.
         */
        <p className={styles.troncature} role="status">
          Seuls les {LIMITE_LISTE} messages les plus récents sont affichés.
          {/*
           * LE CONSEIL NE S'AFFICHE QUE S'IL EST VRAI, releve par
           * `ls-frontend-revue` : sur `?statut=NOUVEAU`, « filtrer par statut
           * permet de les atteindre » s'adressait a quelqu'un qui venait de
           * filtrer. Le conseil etait faux au moment exact ou il comptait, le
           * seul ou l'exploitante en aurait eu besoin.
           */}
          {filtreActif.valeur === "TOUS"
            ? " D'autres existent au-delà : filtrer par statut permet de les atteindre."
            : " D'autres existent au-delà dans ce statut."}
        </p>
      ) : null}

      {messages.length === 0 ? (
        /*
         * L'ETAT VIDE DIT POURQUOI ET NON SEULEMENT QU'IL EST VIDE, meme regle
         * que la file d'expedition : une boite vide est le cas normal la
         * plupart du temps, et sans cette phrase elle se lit comme un ecran
         * casse.
         *
         * IL DISTINGUE LA BOITE VIDE DU FILTRE SANS RESULTAT, LS-163 : « aucun
         * message » sur un filtre actif ferait croire que la boite est vide,
         * alors que d'autres messages existent sous un autre statut.
         */
        <p className={styles.vide}>
          {/*
           * LA BOITE VIDE EST TESTEE EN PREMIER, releve par `ls-frontend-revue`.
           * L'ordre inverse affichait « Aucun message dans « Nouveaux ». La
           * boite en compte 0 au total. » sur une boutique qui demarre : une
           * phrase bancale qui privait en plus l'exploitante du seul texte
           * utile, celui qui dit d'ou viennent les messages.
           *
           * « tous statuts confondus » ET NON « au total » : le nombre est le
           * total GENERAL, jamais celui du filtre, et deux nombres coexistent a
           * l'ecran. Le dire evite de lire l'un pour l'autre.
           */}
          {total === 0
            ? "Les demandes envoyées par le formulaire de contact du site arrivent ici. Elles sont conservées même si l'email de notification n'est pas parti."
            : `Aucun message dans « ${filtreActif.libelle} ». La boîte en compte ${total} message${total > 1 ? "s" : ""} tous statuts confondus.`}
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
