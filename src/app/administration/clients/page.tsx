/**
 * Ecran « Clients » de l'administration. LS-185.
 *
 * TRAITEMENT T11 DU REGISTRE. Cet ecran rassemble en une vue ce que quatre
 * tables portent separement, ce qui en fait un traitement distinct de ceux qui
 * les alimentent : `docs/architecture/REGISTRE-DES-TRAITEMENTS.md` porte ses
 * trois finalites et ses deux bases legales.
 *
 * LA RECHERCHE LIBRE EST UN ECART ASSUME A ADR-027, arbitrage de Christophe du
 * 5 septembre 2026, ecrit dans `.claude/familles-sans-action.txt` et dans le
 * service. Ne pas ajouter `exigerReauthentificationRecente` en croyant reparer
 * un oubli : revenir sur cet arbitrage lui appartient.
 *
 * COMPOSANT SERVEUR, `exigerAdministratrice` appele AVANT tout rendu. C'est la
 * seule garde de cet ecran, et elle suffit a ce que le role decide : sans elle,
 * un client inscrit atteindrait le fichier de tous les autres.
 *
 * AUCUNE SERVER ACTION. L'ecran ne modifie rien : la suppression d'un compte
 * appartient au client lui-meme, LS-95, et reste une action sensible de la
 * famille `IDENTIFIANTS` portee par l'espace client. L'exploitante ne supprime
 * pas un compte a la place de son titulaire.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formaterMontant } from "@/lib/montant";
import {
  PLAFOND_CLIENTS,
  listerClientsAdministration,
} from "@/services/administration-clients";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";

import styles from "./clients.module.css";

export const metadata = {
  title: "Clients, administration",
  robots: { index: false, follow: false },
};

/**
 * La page relit a chaque affichage.
 *
 * Une liste de personnes mise en cache servirait un etat perime, et surtout
 * ferait survivre a l'ecran un compte que son titulaire vient de supprimer.
 */
export const dynamic = "force-dynamic";

/**
 * La date d'inscription et de derniere connexion, sans l'heure.
 *
 * LE FUSEAU EST EXPLICITE, jamais deduit du serveur, invariant 8 : la
 * production tourne en UTC, et « inscrit le 1er juillet » ne doit pas devenir
 * « 30 juin » pour un compte cree a 00 h 30.
 */
const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "Europe/Paris",
});

export default async function PageClients({
  searchParams,
}: {
  searchParams: Promise<{ recherche?: string }>;
}) {
  try {
    await exigerAdministratrice(await headers());
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }

    throw erreur;
  }

  const parametres = await searchParams;
  const terme = parametres.recherche?.trim() ?? "";

  const vue = await listerClientsAdministration(
    terme.length > 0 ? { terme } : {},
  );

  const aucunClient = vue.clients.length === 0;

  return (
    <main className={styles.page}>
      <p className={styles.surtitre}>Relation client</p>
      <h1 className={styles.titre}>Clients</h1>

      <p className={styles.introduction}>
        Les comptes créés sur la boutique, du plus récent au plus ancien. Un
        compte supprimé disparaît d&apos;ici : ses commandes et ses factures
        sont conservées pour la comptabilité, sans lui être rattachées.
      </p>

      {/*
       * LE FORMULAIRE EST EN `GET`, ET C'EST CE QUI MET L'ETAT DANS L'URL.
       *
       * Un `POST` ou une Server Action garderait le terme dans l'etat du
       * navigateur : le retour arriere ne le retrouverait pas, et un resultat ne
       * se partagerait pas par son lien. Un `GET` ecrit `?recherche=...`, ce que
       * la page relit a chaque rendu.
       *
       * `method="get"` EXPLICITE ET `action` ABSENT, jamais `action=""`.
       *
       * DEUX RAISONS. React 19 traite `action` comme une prop SPECIALE, point
       * d'entree des Server Actions : lui donner une chaine vide est exactement
       * la forme qui prete a confusion sur un formulaire dont le commentaire
       * insiste qu'il n'en est pas une. Et une chaine vide se resout vers l'URL
       * courante QUERY COMPRISE, ce qui marche aujourd'hui parce que ce
       * formulaire porte le seul parametre de l'ecran, mais effacerait en
       * silence un filtre ou une pagination ajoutes plus tard.
       *
       * `action` ABSENT resout vers l'URL de la page sans sa query, ce qui est
       * le comportement voulu : la soumission remplace la recherche, elle ne
       * s'ajoute pas a l'ancienne.
       */}
      <form className={styles.recherche} role="search" method="get">
        <label className={styles.rechercheLabel} htmlFor="recherche">
          Rechercher par nom ou adresse email
        </label>

        <div className={styles.rechercheLigne}>
          <input
            id="recherche"
            name="recherche"
            type="search"
            className={styles.rechercheChamp}
            defaultValue={terme}
            placeholder="Nom ou adresse email"
            /*
             * `autoComplete="off"` PARCE QUE CE CHAMP N'EST PAS CELUI DE
             * L'UTILISATRICE. Le navigateur proposerait sinon l'adresse de
             * l'exploitante elle-meme, qui n'a aucun sens ici, et memoriserait
             * les noms de clients recherches dans son profil local.
             */
            autoComplete="off"
            /*
             * `spellCheck` DESACTIVE PARCE QUE CE CHAMP REÇOIT DES NOMS DE
             * PERSONNES. Le correcteur orthographique de macOS et d'iOS
             * transmet le contenu des champs texte a un service systeme : sur
             * un ecran qui affiche un fichier client, c'est un transfert que
             * rien ne justifie. Les deux autres attributs ferment la correction
             * et la capitalisation automatiques, qui deformeraient un nom
             * propre pendant la saisie.
             */
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />

          <button type="submit" className={styles.rechercheBouton}>
            Rechercher
          </button>
        </div>
      </form>

      {terme.length > 0 ? (
        <p className={styles.rappelRecherche}>
          Résultats pour «&nbsp;{terme}&nbsp;».{" "}
          <Link href="/administration/clients" className={styles.lien}>
            Afficher tous les comptes
          </Link>
        </p>
      ) : null}

      {aucunClient ? (
        /*
         * L'ETAT VIDE EST UN ETAT, pas un incident, et son texte DIFFERE selon
         * la cause : « aucun compte » sur une recherche ferait croire que la
         * boutique n'en a aucun, alors que le terme suffit a l'expliquer.
         */
        <p className={styles.vide}>
          {terme.length > 0
            ? "Aucun compte ne correspond à cette recherche. Vérifiez l'orthographe, ou affichez tous les comptes."
            : "Aucun compte client pour le moment. Le premier apparaîtra à la première inscription."}
        </p>
      ) : (
        <>
          <ul className={styles.liste}>
            {vue.clients.map((client) => (
              <li key={client.id} className={styles.client}>
                <div className={styles.enTeteClient}>
                  {/*
                   * LE NOM PEUT ETRE ABSENT, et c'est un cas nominal :
                   * `Utilisateur.nom` est nullable, l'inscription ne l'exigeant
                   * pas par tous les chemins. L'adresse email prend alors sa
                   * place plutot qu'un vide, qui ferait croire a une anomalie.
                   */}
                  <span className={styles.nom}>
                    {client.nom ?? client.email}
                  </span>

                  {/*
                   * L'ETAT DE VERIFICATION SE DIT PAR UN LIBELLE, jamais par la
                   * seule couleur. Il n'est PAS alarmant : la verification ne
                   * bloque rien, arbitrage du 2 septembre 2026, elle conditionne
                   * seulement le rattachement des commandes invitees.
                   */}
                  <span
                    className={`${styles.etat} ${
                      client.emailVerifie ? "" : styles.etatAConfirmer
                    }`}
                  >
                    {client.emailVerifie
                      ? "Email vérifié"
                      : "Email à confirmer"}
                  </span>
                </div>

                {/*
                 * L'ADRESSE EMAIL EST REPETEE SOUS LE NOM quand le nom existe,
                 * parce que c'est elle qui sert a repondre a une demande RGPD,
                 * finalite 1 de T11. Quand le nom manque, elle est deja en tete
                 * et ne se repete pas.
                 */}
                {client.nom ? (
                  <p className={styles.email}>{client.email}</p>
                ) : null}

                <dl className={styles.details}>
                  <div className={styles.detail}>
                    <dt>Inscrit le</dt>
                    <dd>{FORMAT_DATE.format(client.creeA)}</dd>
                  </div>

                  <div className={styles.detail}>
                    <dt>Dernière connexion</dt>
                    <dd>
                      {client.derniereConnexion
                        ? FORMAT_DATE.format(client.derniereConnexion)
                        : "Jamais connecté"}
                    </dd>
                  </div>

                  <div className={styles.detail}>
                    <dt>Adresses enregistrées</dt>
                    <dd>{client.nombreAdresses}</dd>
                  </div>

                  {/*
                   * LES DEUX LIGNES SUIVANTES RELEVENT DE LA FINALITE 3, le
                   * suivi d'activite commerciale, et de l'interet legitime. Les
                   * deux autres finalites ne les justifieraient pas : c'est la
                   * distinction que T11 porte, et elle est ce qui rend l'ecran
                   * defendable si l'interet legitime etait conteste.
                   */}
                  <div className={styles.detail}>
                    <dt>Commandes</dt>
                    <dd>{client.nombreCommandes}</dd>
                  </div>

                  <div className={styles.detailTotal}>
                    <dt>Montant commandé</dt>
                    <dd>{formaterMontant(client.totalCentimes)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {vue.limiteAtteinte ? (
            <p className={styles.plafond}>
              Seuls les {PLAFOND_CLIENTS} comptes les plus récents sont
              affichés. Affinez la recherche pour retrouver les autres.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
