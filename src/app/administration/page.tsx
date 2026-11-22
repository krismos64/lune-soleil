/**
 * Tableau de bord de l'administration, LS-70 puis LS-181.
 *
 * CE QU'ELLE ETAIT : un `h1` et la phrase « Connexion réussie ». Elle existait
 * pour etre la PREMIERE ROUTE PROTEGEE du projet, et pour que la protection
 * soit ecrite et testee avant que du contenu sensible n'arrive derriere. Ce
 * role est rempli depuis LS-70, et LS-181 lui donne son contenu.
 *
 * LE MOTIF A REPRENDRE SUR TOUTE ROUTE D'ADMINISTRATION : appeler
 * `exigerAdministratrice` AVANT de rendre quoi que ce soit. Pas de verification
 * dans un composant enfant, pas de rendu conditionnel sur un role lu cote
 * client : le composant serveur decide, ou il n'y a pas de protection.
 *
 * Deliberement PAS de middleware. Un middleware Next.js s'execute sur la
 * peripherie et ne peut pas relire la session en base : il ne verrait que la
 * presence d'un cookie, pas sa validite ni le role. Protection reelle ici.
 *
 * CE QUE CET ECRAN NE FAIT PAS : il n'agit sur rien. Aucune Server Action, aucun
 * formulaire, aucun changement d'etat. Il oriente vers les ecrans qui agissent,
 * et c'est ce qui le rend sur : un chiffre lu ici n'autorise aucune decision,
 * c'est la liste qui fait foi. Un tableau de bord qui agirait demanderait les
 * memes gardes que les ecrans qu'il resume, dupliquees a un second endroit.
 */
import { Suspense } from "react";

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  lireComptages,
  lireEtatStock,
  lireNomAffiche,
} from "@/services/tableau-bord";
import { ACTIONS_RAPIDES } from "@/components/actions-administration";
import { heureDeParis } from "@/lib/heure-de-paris";
import { lireEtatPromotion } from "@/services/promotion";
import {
  IconeAdministration,
  type NomIcone,
} from "@/components/icones-administration";
import {
  LIBELLES_THEMES,
  lireThemeSaisonnier,
} from "@/services/theme-saisonnier";
import { formaterMontant } from "@/lib/montant";
import type { ThemeSaisonnier } from "@/lib/theme-saisonnier";

import styles from "./tableau-bord.module.css";

export const metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * UN TABLEAU DE BORD MIS EN CACHE EST TROMPEUR, et davantage qu'une liste : sa
 * raison d'etre est de dire ce qui attend MAINTENANT. Un paiement confirme
 * pendant que l'ecran est ouvert doit apparaitre au rafraichissement, sans quoi
 * l'exploitante croit sa journee finie.
 */
export const dynamic = "force-dynamic";

/**
 * La date du jour, en toutes lettres.
 *
 * `Europe/Paris` EST EXPLICITE, jamais l'heure du serveur. Les horodatages sont
 * persistes en UTC et convertis a l'affichage seulement, invariant 8 : un
 * serveur en UTC afficherait « mardi » a 1 h du matin un mercredi parisien.
 */
function dateDuJour(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date());
}

/** Bonjour le matin, bon après-midi ensuite, bonsoir dès 18 heures. */
function salutation(heure: number): string {
  return heure < 12 ? "Bonjour" : heure < 18 ? "Bon après-midi" : "Bonsoir";
}

/** Une tuile d'indicateur, avec son icône et son filet superieur colore. */
function Tuile({
  libelle,
  valeur,
  precision,
  ton,
  icone,
}: {
  libelle: string;
  valeur: string;
  precision: string;
  /**
   * `urgent` porte le filet terracotta, `recette` le vert, sinon neutre.
   *
   * `| undefined` EST EXPLICITE, `exactOptionalPropertyTypes` etant actif : le
   * point d'interrogation seul autorise l'absence de la propriete, pas sa
   * presence a `undefined`, et un appelant qui calcule le ton par une ternaire
   * passe bien `undefined` plutot que d'omettre la cle.
   */
  ton?: "urgent" | "recette" | undefined;
  /** Icône décorative, LS-325 : le libellé nomme l'indicateur. */
  icone: NomIcone;
}) {
  const classeTon =
    ton === "urgent"
      ? styles.tuileUrgente
      : ton === "recette"
        ? styles.tuileRecette
        : "";

  return (
    <div className={`${styles.tuile} ${classeTon}`}>
      <span className={styles.tuileLibelle}>
        <IconeAdministration nom={icone} className={styles.tuileIcone} />
        {libelle}
      </span>
      <span className={styles.tuileValeur}>{valeur}</span>
      <span className={styles.tuilePrecision}>{precision}</span>
    </div>
  );
}

export default async function PageAdministration() {
  let identite: Awaited<ReturnType<typeof exigerAdministratrice>>;
  try {
    identite = await exigerAdministratrice(await headers());
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      // Redirection et non page d'erreur : sans session, la reponse utile est
      // le formulaire de connexion. Le refus ne dit pas si le compte existe.
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  /*
   * L'EN-TETE EST RENDU TOUT DE SUITE, les comptages sous `<Suspense>`.
   */
  /*
   * LE THÈME SAISONNIER ACTIF EST RAPPELÉ ICI, ADR-046 : un thème de Noël
   * oublié en février se voit à la première ouverture. Sa lecture ne lève
   * jamais, elle peut donc précéder la frontière.
   */
  const [theme, nom] = await Promise.all([
    lireThemeSaisonnier(),
    lireNomAffiche(identite.utilisateurId, identite.email),
  ]);
  const heure = heureDeParis(new Date());

  return (
    <main id="contenu" tabIndex={-1} className={styles.page}>
      {/*
       * L'EN-TÊTE DIT LE JOUR ET SALUE, sans plus : la refonte du 22 novembre
       * 2026 a retiré l'arc du jour et la phrase qui expliquait l'écran.
       */}
      <header className={styles.entete}>
        <p className={styles.surtitre}>{dateDuJour()}</p>
        <h1 className={styles.titre}>Tableau de bord</h1>
        <p className={styles.introduction}>
          {salutation(heure)} {nom}.
        </p>
      </header>

      <Suspense fallback={<ChargementIndicateurs />}>
        <IndicateursTableauBord theme={theme} />
      </Suspense>
    </main>
  );
}

/**
 * Armature affichee pendant que les comptages arrivent, LS-188.
 *
 * TROIS BARRES PAR TUILE, aux hauteurs des trois lignes qu'elles remplacent :
 * libelle, valeur et precision. Reprendre les hauteurs est ce qui evite que la
 * grille change de taille a l'arrivee des chiffres.
 */
function ChargementIndicateurs() {
  return (
    <>
      {/*
       * `role="status"` pour qu'un lecteur d'ecran apprenne que la page
       * travaille. `aria-live` n'est pas ajoute, `role="status"` le portant
       * implicitement en `polite`.
       *
       * ELLE EST VISUELLEMENT MASQUEE, `styles.invisible`, ET C'EST LE POINT.
       * Le rendu reel n'a AUCUNE ligne de texte entre l'introduction et la
       * grille : une phrase visible ici descendrait les quatre tuiles d'une
       * hauteur de ligne, puis les ferait remonter a l'arrivee des chiffres.
       * C'est le saut de mise en page que l'armature existe pour eviter, et le
       * critere 3 l'interdit nommement.
       *
       * L'ANNONCE RESTE ENTIERE POUR QUI ECOUTE. `invisible` est la technique
       * de masquage accessible du projet, deja employee dans ce fichier pour
       * les noms de liens : le texte sort du flux visuel sans sortir de l'arbre
       * d'accessibilite, contrairement a `display: none`.
       */}
      <p className={styles.invisible} role="status">
        Chargement des indicateurs…
      </p>

      {/*
       * `aria-hidden` SUR L'ARMATURE : annoncer quatre tuiles vides n'apprend
       * rien a qui ecoute, la phrase ci-dessus le fait mieux. C'est ce partage
       * qui rend l'armature purement decorative, donc dispensee de nom
       * accessible : le sens passe par le texte, la forme par les barres.
       */}
      <div className={styles.tuiles} aria-hidden="true">
        {[0, 1, 2, 3].map((rang) => (
          <div key={rang} className={styles.tuile}>
            <span className={styles.ardoiseLibelle} />
            <span className={styles.ardoiseValeur} />
            <span className={styles.ardoisePrecision} />
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Les indicateurs, seule partie de cet ecran qui lit la base.
 *
 * ------------------------------------------------------------------
 * POURQUOI UN `<Suspense>` INTERNE ET NON UN `loading.tsx`, ALORS QUE CETTE
 * PAGE N'APPELLE PAS `notFound()`.
 *
 * Un `loading.tsx` pose ici sa frontiere sur le SEGMENT RACINE de
 * l'administration, donc sur les SEIZE ecrans du sous-arbre, exactement comme
 * `error.tsx` les couvre tous depuis LS-191. Or deux d'entre eux appellent
 * `notFound()` : leur 404 devenait un 200.
 *
 * MESURE DU 5 SEPTEMBRE 2026, sur une route de diagnostic appelant `notFound()`
 * en PREMIERE instruction : 404 hors de `/administration`, 200 dedans, le seul
 * ecart etant la presence du `loading.tsx` racine.
 *
 * C32 S'APPLIQUE DONC A UN SEGMENT DES QU'UN DESCENDANT appelle `notFound()`,
 * et pas seulement quand la page du segment le fait elle-meme.
 *
 * NE PAS RETABLIR `administration/loading.tsx`. Le raisonnement qui l'avait
 * justifie disait que « ce fichier couvre le segment racine, pas ses
 * sous-dossiers, le plus proche l'emporte » : c'est vrai du REPLI affiche, faux
 * de la frontiere, qui enveloppe tout le sous-arbre.
 * ------------------------------------------------------------------
 */
async function IndicateursTableauBord({ theme }: { theme: ThemeSaisonnier }) {
  const [comptages, stock, promotion] = await Promise.all([
    lireComptages(),
    lireEtatStock(),
    lireEtatPromotion(),
  ]);

  /*
   * CE QUI ATTEND UN GESTE, dans l'ordre où il se traite : vendre, rendre,
   * répondre, surveiller. Une ligne à zéro ne s'affiche pas. Les alertes du
   * site entrent ici, refonte du 22 novembre 2026 : leur écran reste dans
   * l'onglet Alertes de l'accueil.
   */
  const aTraiter = [
    {
      chemin: "/administration/commandes",
      libelle: (n: number) =>
        n > 1 ? "commandes à préparer" : "commande à préparer",
      nombre: comptages.commandesAPreparer,
      action: "Préparer",
    },
    {
      chemin: "/administration/expeditions",
      libelle: () => "colis à expédier",
      nombre: comptages.commandesPretesAExpedier,
      action: "Expédier",
    },
    {
      chemin: "/administration/retractations",
      libelle: (n: number) => (n > 1 ? "retours en cours" : "retour en cours"),
      nombre: comptages.retractationsEnCours,
      action: "Traiter",
    },
    {
      chemin: "/administration/messages",
      libelle: (n: number) => (n > 1 ? "messages non lus" : "message non lu"),
      nombre: comptages.messagesNonLus,
      action: "Lire",
    },
    {
      chemin: "/administration/avis",
      libelle: (n: number) => (n > 1 ? "avis à relire" : "avis à relire"),
      nombre: comptages.avisAModerer,
      action: "Relire",
    },
    {
      chemin: "/administration/stocks",
      libelle: (n: number) =>
        n > 1 ? "pièces en stock bas" : "pièce en stock bas",
      nombre: comptages.variantesStockFaible,
      action: "Voir",
    },
    {
      chemin: "/administration/alertes",
      libelle: (n: number) =>
        n > 1
          ? "problèmes signalés par le site"
          : "problème signalé par le site",
      nombre: comptages.alertesOuvertes,
      action: "Voir",
    },
  ].filter((entree) => entree.nombre > 0);

  return (
    <>
      {/*
       * LES QUATRE CHIFFRES EN TÊTE, refonte du 22 novembre 2026 : ils se
       * lisent d'un coup d'œil, la liste « À faire » dit ensuite quoi en faire.
       */}
      <div className={styles.tuiles}>
        <Tuile
          libelle="Encaissé aujourd'hui"
          valeur={formaterMontant(comptages.encaisseDuJourCentimes)}
          precision="En ligne et sur les marchés"
          ton={comptages.encaisseDuJourCentimes > 0 ? "recette" : undefined}
          icone="statistiques"
        />
        <Tuile
          libelle="À préparer"
          valeur={String(comptages.commandesAPreparer)}
          precision={
            comptages.commandesAPreparer > 0
              ? "Commandes payées"
              : "Rien en attente"
          }
          ton={comptages.commandesAPreparer > 0 ? "urgent" : undefined}
          icone="commandes"
        />
        <Tuile
          libelle="Prêtes à expédier"
          valeur={String(comptages.commandesPretesAExpedier)}
          precision={
            comptages.commandesPretesAExpedier > 0
              ? "Étiquette à créer"
              : "Aucun colis en attente"
          }
          icone="expeditions"
        />
        <Tuile
          libelle="Stock bas"
          valeur={String(comptages.variantesStockFaible)}
          precision={
            comptages.variantesIndisponibles > 0
              ? `Dont ${comptages.variantesIndisponibles} épuisée${
                  comptages.variantesIndisponibles > 1 ? "s" : ""
                }`
              : "Aucune pièce épuisée"
          }
          ton={comptages.variantesIndisponibles > 0 ? "urgent" : undefined}
          icone="stocks"
        />
      </div>

      <div className={styles.grille}>
        <section className={styles.panneau} aria-labelledby="a-traiter">
          <h2 className={styles.panneauTitre} id="a-traiter">
            À faire
          </h2>

          {aTraiter.length === 0 ? (
            <p className={styles.vide}>Rien ne vous attend pour le moment.</p>
          ) : (
            <ul className={styles.liste}>
              {aTraiter.map((entree) => (
                <li key={entree.chemin} className={styles.entree}>
                  <span className={styles.entreeNombre} aria-hidden="true">
                    {entree.nombre}
                  </span>
                  <span className={styles.entreeLibelle}>
                    {entree.nombre} {entree.libelle(entree.nombre)}
                  </span>
                  <Link
                    href={entree.chemin}
                    className={styles.entreeAction}
                    prefetch={false}
                  >
                    {entree.action}
                    {/*
                     * LE NOM DU LIEN DIT CE QU'IL OUVRE : sept « Voir » ou
                     * « Lire » nus seraient indiscernables au lecteur d'écran.
                     */}
                    <span className={styles.invisible}>
                      {" "}
                      : {entree.libelle(entree.nombre)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={styles.colonneDroite}>
          {/*
           * LES DEUX GESTES LES PLUS FRÉQUENTS, à un clic. Le thème et la
           * promotion se règlent depuis le bloc « En ce moment », qui dit
           * aussi ce qui est actif.
           */}
          <nav
            className={`${styles.panneau} ${styles.actions}`}
            aria-label="Actions directes"
          >
            <ul className={styles.listeActions}>
              {ACTIONS_RAPIDES.slice(0, 2).map((action) => (
                <li key={action.chemin}>
                  <Link
                    href={action.chemin}
                    className={styles.action}
                    prefetch={false}
                  >
                    <span className={styles.actionIcone}>
                      <IconeAdministration nom={action.icone} />
                    </span>
                    <span className={styles.actionTextes}>
                      <span className={styles.actionLibelle}>
                        {action.libelle}
                      </span>
                      <span className={styles.actionPrecision}>
                        {action.precision}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/*
           * CE QUI HABILLE LA BOUTIQUE EN CE MOMENT, ADR-046 et ADR-051 : un
           * thème de Noël oublié en février, ou une promotion restée active,
           * se voit à la première ouverture.
           */}
          <section className={styles.panneau} aria-labelledby="en-ce-moment">
            <h2 className={styles.panneauTitre} id="en-ce-moment">
              En ce moment sur la boutique
            </h2>
            <dl className={styles.etatBoutique}>
              <div className={styles.etatStockLigne}>
                <dt>Ambiance</dt>
                <dd>{theme === "AUCUN" ? "Aucune" : LIBELLES_THEMES[theme]}</dd>
              </div>
              <div className={styles.etatStockLigne}>
                <dt>Promotion</dt>
                <dd>
                  {promotion.active === null
                    ? "Aucune"
                    : promotion.active.libelle}
                </dd>
              </div>
            </dl>
            <div className={styles.liensPanneau}>
              <Link
                href="/administration/parametres?section=ambiance#theme-saisonnier"
                className={styles.lienPanneau}
                prefetch={false}
              >
                Changer l&apos;ambiance
              </Link>
              <Link
                href="/administration/parametres?section=ambiance#promotion"
                className={styles.lienPanneau}
                prefetch={false}
              >
                Régler une promotion
              </Link>
            </div>
          </section>

          {/*
           * L'ÉTAT DU STOCK, en mots de tous les jours : « en cours de
           * paiement » plutôt que « réservées », la notion technique.
           */}
          <section className={styles.panneau} aria-labelledby="etat-stock">
            <h2 className={styles.panneauTitre} id="etat-stock">
              État du stock
            </h2>

            {stock.variantes === 0 ? (
              <p className={styles.vide}>
                Aucune pièce en stock pour le moment.
              </p>
            ) : (
              <>
                <div className={styles.jauge} aria-hidden="true">
                  <span
                    className={styles.jaugeReservee}
                    style={{ flexGrow: stock.reservees }}
                  />
                  <span
                    className={styles.jaugeDisponible}
                    // Le disponible du SERVEUR, calculé variante par variante :
                    // le recalculer ici pourrait diverger du chiffre affiché.
                    style={{ flexGrow: stock.disponibles }}
                  />
                </div>
                <dl className={styles.etatStock}>
                  <div className={styles.etatStockLigne}>
                    <dt>Pièces en stock</dt>
                    <dd>{stock.physiques}</dd>
                  </div>
                  <div className={styles.etatStockLigne}>
                    <dt>En cours de paiement</dt>
                    <dd>{stock.reservees}</dd>
                  </div>
                  <div className={styles.etatStockLigne}>
                    <dt>Disponibles à la vente</dt>
                    <dd>{stock.disponibles}</dd>
                  </div>
                </dl>
              </>
            )}

            <Link
              href="/administration/stocks"
              className={styles.lienPanneau}
              prefetch={false}
            >
              Voir le stock et les marchés
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
