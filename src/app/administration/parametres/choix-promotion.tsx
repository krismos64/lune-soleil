"use client";

/**
 * L'activation de la promotion, ADR-051, LS-319, aux côtés du thème.
 *
 * AUCUN TAUX NI TEXTE À SAISIR : la promotion et son taux sont écrits dans le
 * code, `src/lib/promotion.ts`. L'écran active et désactive librement ; la
 * période annoncée se règle par deux dates, `PeriodePromotion` plus bas.
 *
 * L'ÉTAT AFFICHÉ VIENT DU SERVEUR, rendu à chaque requête, et l'issue de la
 * dernière action le complète sans le remplacer : après une activation, la
 * page se revalide et rend l'état réel.
 *
 * LE BOUTON EST DÉCRIT PAR L'ÉTAT, `aria-describedby`, revue d'interface de
 * LS-319 : au focus, le lecteur d'écran dit les pièces exclues et le gel des
 * prix, avant l'action la plus lourde de l'écran. La cible ne porte aucun
 * `aria-label`, C39.
 */
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { formaterMontant } from "@/lib/montant";
import {
  CODES_PROMOTION,
  PROMOTIONS,
  TAUX_MAXIMUM,
  TAUX_MINIMUM,
  prixDeVente,
} from "@/lib/promotion";
import {
  basculerPromotionAction,
  enregistrerPeriodeAction,
  type ResultatPeriode,
  type ResultatPromotion,
} from "./actions-promotion";
import styles from "./parametres.module.css";

/** Ce que l'écran reçoit de la promotion active, dates déjà écrites. */
export type EtatPromotionAffiche =
  | "INDISPONIBLE"
  | {
      libelle: string;
      portee: "TOUT" | "SELECTION";
      tauxGeneral: number | null;
      articles: { nom: string; taux: number }[];
      activeDepuis: string;
      reduites: number;
      exclues: number;
    }
  | null;

/** Un article en vente que l'exploitante peut cocher, LS-324. */
export type ArticleReductible = {
  produitId: string;
  nom: string;
  categorieId: string;
  categorieNom: string;
  prixMinimumCentimes: number;
};

/** Signe moins typographique, U+2212, celui des badges de la boutique. */
const MOINS = "−";

function messageDe(resultat: ResultatPromotion | null): string {
  switch (resultat?.statut) {
    case undefined:
      return "";
    case "ACTIVEE":
      return `${resultat.libelle} est active. Le détail de ce qu'elle réduit figure ci-dessus.`;
    case "DESACTIVEE":
      return "Promotion désactivée : les prix catalogue s'appliquent de nouveau.";
    case "AUCUNE_ACTIVE":
      return "Aucune promotion n'était active : l'écran est à jour.";
    case "DEJA_ACTIVE":
      return "Une promotion est déjà active : l'écran est à jour, désactivez-la d'abord.";
    case "ARTICLE_INCONNU":
      return "Un article choisi n'existe plus. Rechargez la page.";
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous pour continuer.";
    case "REAUTHENTIFICATION_REQUISE":
      return "Confirmez votre identité pour changer les prix de la boutique.";
    case "INVALIDE":
      return resultat.message;
    case "INDISPONIBLE":
      return "Le service est momentanément indisponible. Réessayez dans un instant.";
  }
}

const pluriel = (nombre: number, un: string, plusieurs: string): string =>
  `${nombre} ${nombre > 1 ? plusieurs : un}`;

/** Ce que fait la promotion active, en phrases. */
function ResumeActive({
  etat,
}: {
  etat: Exclude<EtatPromotionAffiche, "INDISPONIBLE" | null>;
}) {
  return (
    <>
      <p id="promotion-etat" className={styles.aide}>
        <strong>
          {etat.libelle}, active depuis le {etat.activeDepuis}.
        </strong>{" "}
        {etat.portee === "TOUT"
          ? `Toute la boutique à ${MOINS}${etat.tauxGeneral ?? 0} %${
              etat.articles.length === 0 ? "" : ", sauf les articles ci-dessous"
            }.`
          : "Les seuls articles ci-dessous sont réduits."}{" "}
        {etat.reduites === 0
          ? "Aucune pièce en vente n'est réduite en ce moment : rien n'est annoncé sur la boutique"
          : `${pluriel(etat.reduites, "pièce réduite", "pièces réduites")} en ce moment`}
        {etat.exclues === 0
          ? "."
          : `, ${pluriel(etat.exclues, "reste", "restent")} au prix catalogue : prix modifié dans les trente derniers jours.`}{" "}
        Les prix sont gelés tant qu&apos;elle est active. Pour changer un taux
        ou un article, désactivez-la puis activez-en une nouvelle.
      </p>
      {etat.articles.length === 0 ? null : (
        <ul className={styles.recapPromotion} aria-label="Taux par article">
          {etat.articles.map((article, rang) => (
            // Deux articles peuvent porter le même nom : le rang fait la clé.
            <li key={rang}>
              {article.nom} : {MOINS}
              {article.taux}&nbsp;%
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Entrée dans un champ de taux n'envoie pas le formulaire : sur un clavier de
 * bureau, valider le taux général activait toute la boutique avant que les
 * articles soient cochés. L'activation passe par son bouton.
 */
const sansEnvoiParEntree = (evenement: {
  key: string;
  preventDefault(): void;
}) => {
  if (evenement.key === "Enter") evenement.preventDefault();
};

const tauxValide = (texte: string): boolean => {
  const taux = Number(texte);
  return (
    texte.trim() !== "" &&
    Number.isInteger(taux) &&
    taux >= TAUX_MINIMUM &&
    taux <= TAUX_MAXIMUM
  );
};

/**
 * Le formulaire d'activation, LS-324, ADR-051 amendé : le nom de l'opération
 * dans la liste fermée, la portée, et les taux saisis.
 *
 * L'ÉTAT LOCAL NE SERT QU'À L'AFFICHAGE : désactiver un champ, montrer le prix
 * que donnera un taux, compter les articles. Ce que le serveur reçoit est le
 * formulaire, et il revalide tout, bornes comprises, invariant 7. Le prix
 * montré ici vient de `prixDeVente`, la fonction du serveur, sur le prix le
 * plus bas de l'article : une aide à la saisie, jamais un prix encaissé.
 */
function FormulaireActivation({
  articles: articlesLus,
  enCours,
  refuse,
}: {
  /** `null` : la liste n'a pas pu être lue, ce qui n'est pas « aucun article ». */
  articles: ArticleReductible[] | null;
  enCours: boolean;
  /** Le serveur vient de refuser : les taux manquants se signalent aussi. */
  refuse: boolean;
}) {
  const articles = articlesLus ?? [];
  /*
   * TOUT CHAMP EST CONTRÔLÉ, le nom compris, revue d'interface de LS-324 : ce
   * que l'écran montre est ce que le serveur reçoit. Un champ laissé au
   * navigateur revenait à sa valeur de départ après un envoi refusé, et
   * « Promotion » partait à la place de « Soldes d'été ».
   */
  const [code, setCode] = useState<string>("PROMOTION");
  const [portee, setPortee] = useState<"TOUT" | "SELECTION">("TOUT");
  const [tauxGeneral, setTauxGeneral] = useState("");
  const [coches, setCoches] = useState<ReadonlySet<string>>(new Set());
  const [taux, setTaux] = useState<Readonly<Record<string, string>>>({});

  const categories = [
    ...new Map(
      articles.map((article) => [article.categorieId, article.categorieNom]),
    ),
  ];
  const basculer = (ids: readonly string[], coche: boolean) =>
    setCoches((avant) => {
      const apres = new Set(avant);
      for (const id of ids) {
        if (coche) apres.add(id);
        else apres.delete(id);
      }
      return apres;
    });

  const articlesCoches = articles.filter((a) => coches.has(a.produitId));
  const tauxIncomplets = articlesCoches.filter(
    (a) => !tauxValide(taux[a.produitId] ?? ""),
  ).length;
  const resume =
    portee === "TOUT"
      ? tauxValide(tauxGeneral)
        ? `Toute la boutique à ${MOINS}${Number(tauxGeneral)} %${
            articlesCoches.length === 0
              ? ""
              : `, sauf ${pluriel(articlesCoches.length, "article", "articles")} à un autre taux`
          }.`
        : `Saisissez le taux général, entre ${TAUX_MINIMUM} et ${TAUX_MAXIMUM} %.`
      : articlesCoches.length === 0
        ? "Cochez au moins un article."
        : `${pluriel(articlesCoches.length, "article réduit", "articles réduits")}, le reste de la boutique au prix catalogue.`;

  return (
    <>
      <div className={styles.champ}>
        <label htmlFor="promotion-code" className={styles.libelle}>
          Nom de l&apos;opération
        </label>
        <select
          id="promotion-code"
          name="code"
          className={styles.saisie}
          value={code}
          onChange={(evenement) => setCode(evenement.target.value)}
          aria-describedby="promotion-code-aide"
        >
          {CODES_PROMOTION.map((code) => (
            <option key={code} value={code}>
              {PROMOTIONS[code].libelle}
            </option>
          ))}
        </select>
        <p id="promotion-code-aide" className={styles.aide}>
          Ce nom s&apos;affiche sur la boutique et sur la facture. Il est
          indépendant du thème saisonnier : accordez les deux. « Soldes » ne
          s&apos;emploie que pendant les périodes légales des soldes.
        </p>
      </div>

      <fieldset className={styles.groupe}>
        <legend className={styles.legende}>Articles réduits</legend>
        <ul className={styles.interrupteurs}>
          <li className={styles.interrupteur}>
            <input
              type="radio"
              id="promotion-portee-tout"
              name="portee"
              value="TOUT"
              checked={portee === "TOUT"}
              onChange={() => setPortee("TOUT")}
              className={styles.caseACocher}
            />
            <label
              htmlFor="promotion-portee-tout"
              className={styles.libelleCase}
            >
              Toute la boutique
            </label>
          </li>
          <li className={styles.interrupteur}>
            <input
              type="radio"
              id="promotion-portee-selection"
              name="portee"
              value="SELECTION"
              checked={portee === "SELECTION"}
              onChange={() => setPortee("SELECTION")}
              className={styles.caseACocher}
            />
            <label
              htmlFor="promotion-portee-selection"
              className={styles.libelleCase}
            >
              Seulement les articles cochés
            </label>
          </li>
        </ul>

        {portee === "TOUT" ? (
          <div className={styles.champ}>
            <label htmlFor="promotion-taux" className={styles.libelle}>
              Taux général, en %
            </label>
            <input
              id="promotion-taux"
              name="taux"
              type="number"
              inputMode="numeric"
              min={TAUX_MINIMUM}
              max={TAUX_MAXIMUM}
              step={1}
              value={tauxGeneral}
              onChange={(evenement) => setTauxGeneral(evenement.target.value)}
              onKeyDown={sansEnvoiParEntree}
              className={`${styles.saisie} ${styles.saisieTaux}`}
              aria-describedby="promotion-taux-aide"
              aria-invalid={
                (tauxGeneral !== "" || refuse) && !tauxValide(tauxGeneral)
              }
            />
            <p id="promotion-taux-aide" className={styles.aide}>
              Un nombre entier entre {TAUX_MINIMUM} et {TAUX_MAXIMUM}. Cochez un
              article ci-dessous pour lui donner un autre taux.
            </p>
          </div>
        ) : (
          <p id="promotion-taux-aide" className={styles.aide}>
            Cochez les articles à réduire et donnez à chacun son taux, un nombre
            entier entre {TAUX_MINIMUM} et {TAUX_MAXIMUM}.
          </p>
        )}

        {articlesLus === null ? (
          <p className={styles.aide}>
            La liste des articles n&apos;a pas pu être lue. Rechargez la page
            dans un instant ; « toute la boutique » reste utilisable.
          </p>
        ) : articles.length === 0 ? (
          <p className={styles.aide}>Aucun article n&apos;est en vente.</p>
        ) : (
          categories.map(([categorieId, categorieNom]) => {
            const duGroupe = articles.filter(
              (article) => article.categorieId === categorieId,
            );
            const ids = duGroupe.map((article) => article.produitId);
            const tousCoches = ids.every((id) => coches.has(id));
            return (
              <div key={categorieId} className={styles.famille}>
                <div className={styles.enteteCategorie}>
                  <h3 className={styles.titreFamille}>{categorieNom}</h3>
                  <button
                    type="button"
                    className={styles.boutonDiscret}
                    onClick={() => basculer(ids, !tousCoches)}
                  >
                    {tousCoches ? "Tout décocher" : "Tout cocher"}
                    <span className={styles.horsEcran}>
                      {" "}
                      dans {categorieNom}
                    </span>
                  </button>
                </div>
                <ul className={styles.articlesPromotion}>
                  {duGroupe.map((article) => {
                    const coche = coches.has(article.produitId);
                    const saisi = taux[article.produitId] ?? "";
                    return (
                      <li
                        key={article.produitId}
                        className={styles.articlePromotion}
                      >
                        <input
                          type="checkbox"
                          id={`promotion-article-${article.produitId}`}
                          name="article"
                          value={article.produitId}
                          checked={coche}
                          onChange={(evenement) =>
                            basculer(
                              [article.produitId],
                              evenement.target.checked,
                            )
                          }
                          className={styles.caseACocher}
                        />
                        <label
                          htmlFor={`promotion-article-${article.produitId}`}
                          className={styles.libelleCase}
                        >
                          {article.nom}
                        </label>
                        {coche ? (
                          <span className={styles.tauxArticle}>
                            <label
                              htmlFor={`promotion-taux-${article.produitId}`}
                              className={styles.horsEcran}
                            >
                              Taux de {article.nom}, en %
                            </label>
                            <input
                              id={`promotion-taux-${article.produitId}`}
                              name={`taux-${article.produitId}`}
                              type="number"
                              inputMode="numeric"
                              min={TAUX_MINIMUM}
                              max={TAUX_MAXIMUM}
                              step={1}
                              value={saisi}
                              onChange={(evenement) =>
                                setTaux((avant) => ({
                                  ...avant,
                                  [article.produitId]: evenement.target.value,
                                }))
                              }
                              onKeyDown={sansEnvoiParEntree}
                              className={`${styles.saisie} ${styles.saisieTaux}`}
                              aria-describedby={`promotion-taux-aide promotion-prix-${article.produitId}`}
                              aria-invalid={
                                (saisi !== "" || refuse) && !tauxValide(saisi)
                              }
                            />
                            <span aria-hidden="true">%</span>
                            <span
                              id={`promotion-prix-${article.produitId}`}
                              className={styles.prixArticle}
                            >
                              {tauxValide(saisi)
                                ? `${formaterMontant(article.prixMinimumCentimes)} devient ${formaterMontant(prixDeVente(article.prixMinimumCentimes, Number(saisi)))}`
                                : formaterMontant(article.prixMinimumCentimes)}
                            </span>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </fieldset>

      <p id="promotion-etat" className={styles.aide}>
        <strong>Ce que vous allez activer.</strong> {resume}
        {tauxIncomplets === 0
          ? ""
          : ` ${pluriel(tauxIncomplets, "article coché n'a", "articles cochés n'ont")} pas encore de taux valide.`}{" "}
        Une pièce dont le prix a changé dans les trente derniers jours reste au
        prix catalogue.
      </p>
      <input type="hidden" name="action" value="ACTIVER" />
      <button
        type="submit"
        className={styles.bouton}
        disabled={enCours}
        aria-describedby="promotion-etat"
      >
        Activer la promotion
      </button>
    </>
  );
}

/**
 * La promotion de catalogue, ADR-051 amendé par LS-324 : l'exploitante choisit
 * le nom, les articles et les taux, active et désactive quand elle veut.
 */
export function ChoixPromotion({
  etat,
  articles,
}: {
  etat: EtatPromotionAffiche;
  /** `null` quand la liste des articles n'a pas pu être lue. */
  articles: ArticleReductible[] | null;
}) {
  const [resultat, action, enAction] = useActionState<
    ResultatPromotion | null,
    FormData
  >(basculerPromotionAction, null);
  const [enTransition, demarrer] = useTransition();
  const enCours = enAction || enTransition;
  const formulaire = useRef<HTMLFormElement>(null);

  /*
   * L'ENVOI PASSE PAR `onSubmit` ET NON PAR `action` SEUL, revue d'interface
   * de LS-324. React 19 remet un formulaire à ses valeurs de départ à la fin
   * de CHAQUE action portée par `action={…}`, refus compris : cases et portée
   * revenaient à leur état initial dans la page pendant que l'état React les
   * montrait encore cochées, et un second clic envoyait autre chose que ce
   * qui était affiché. Appelée dans une transition, l'action ne remet rien.
   * `action` reste sur le formulaire pour un navigateur sans script.
   */
  const envoyer = (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    demarrer(() => action(donnees));
  };

  /*
   * APRÈS UNE BASCULE, LE BOUTON CLIQUÉ N'EXISTE PLUS : le formulaire
   * d'activation et le résumé se remplacent. Le focus revient au formulaire,
   * sans quoi il retombe sur `body` et la tabulation repart du haut.
   */
  const statut = resultat?.statut;
  useEffect(() => {
    if (statut === "ACTIVEE" || statut === "DESACTIVEE") {
      formulaire.current?.focus();
    }
  }, [statut]);

  if (etat === "INDISPONIBLE") {
    return (
      <section
        className={styles.formulaire}
        id="promotion"
        aria-labelledby="promotion-titre"
      >
        <h2 id="promotion-titre" className={styles.legende}>
          Promotion
        </h2>
        <p className={styles.aide}>
          L&apos;état de la promotion n&apos;a pas pu être lu. Rechargez la page
          dans un instant ; les autres réglages restent utilisables.
        </p>
      </section>
    );
  }

  return (
    /*
     * `noValidate` : LE REFUS VIENT DU SERVEUR, dans la région d'état, et non
     * de la bulle native du navigateur. `min` et `max` restent sur les champs
     * pour le clavier numérique et les flèches ; sans `noValidate`, un taux à
     * 80 bloquait l'envoi sans aucun message dans la page, relevé par le test
     * de bout en bout.
     */
    <form
      ref={formulaire}
      action={action}
      onSubmit={envoyer}
      className={styles.formulaire}
      id="promotion"
      aria-labelledby="promotion-titre"
      tabIndex={-1}
      noValidate
    >
      <h2 id="promotion-titre" className={styles.legende}>
        Promotion
      </h2>

      {etat === null ? (
        <>
          <p className={styles.aide}>
            Aucune promotion active. Vous choisissez le nom, les articles et les
            taux, et vous l&apos;activez et la désactivez quand vous le
            souhaitez ; le bandeau annonce la période réglée plus bas.
          </p>
          <FormulaireActivation
            articles={articles}
            enCours={enCours}
            refuse={resultat?.statut === "INVALIDE"}
          />
        </>
      ) : (
        <>
          <ResumeActive etat={etat} />
          <input type="hidden" name="action" value="DESACTIVER" />
          <button
            type="submit"
            className={styles.bouton}
            disabled={enCours}
            aria-describedby="promotion-etat"
          >
            Désactiver la promotion
          </button>
        </>
      )}

      <p
        role="status"
        aria-label="État de la promotion"
        className={styles.sortie}
      >
        {enCours ? "Application…" : messageDe(resultat)}
      </p>

      {resultat?.statut === "REAUTHENTIFICATION_REQUISE" && (
        <p className={styles.sortie}>
          <Link
            href="/administration/reauthentification?retour=parametres"
            prefetch={false}
            className={styles.lienSortie}
          >
            Confirmer mon identité
          </Link>
        </p>
      )}

      {resultat?.statut === "SESSION_ABSENTE" && (
        <p className={styles.sortie}>
          <Link
            href="/administration/connexion"
            prefetch={false}
            className={styles.lienSortie}
          >
            Se reconnecter
          </Link>
        </p>
      )}
    </form>
  );
}

function messagePeriode(resultat: ResultatPeriode | null): string {
  switch (resultat?.statut) {
    case undefined:
      return "";
    case "ENREGISTREE":
      return resultat.periode === null
        ? "Aucune date n'est plus annoncée par le bandeau."
        : `Le bandeau annonce désormais : ${resultat.periode}.`;
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous pour continuer.";
    case "PARAMETRES_ABSENTS":
      return "Aucun paramètre n'est enregistré pour cette boutique.";
    case "INVALIDE":
      return resultat.message;
    case "INDISPONIBLE":
      return "Le service est momentanément indisponible. Réessayez dans un instant.";
  }
}

/**
 * La période annoncée par le bandeau, amendement d'ADR-051 du 13 novembre
 * 2026 : deux dates choisies par l'exploitante, indépendantes de
 * l'activation. Les deux vides, le bandeau n'annonce aucune date.
 */
export function PeriodePromotion({
  periode,
}: {
  periode: { debut: string; fin: string } | null;
}) {
  const [resultat, action, enAction] = useActionState<
    ResultatPeriode | null,
    FormData
  >(enregistrerPeriodeAction, null);
  const [enTransition, demarrer] = useTransition();
  const enCours = enAction || enTransition;
  // Même motif que `ChoixPromotion` : envoyée par `action` seul, une période
  // refusée faisait revenir les deux dates à leurs valeurs enregistrées.
  const envoyer = (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    demarrer(() => action(donnees));
  };

  return (
    <form
      action={action}
      onSubmit={envoyer}
      className={styles.formulaire}
      id="periode-promotion"
      aria-labelledby="periode-titre"
    >
      <h2 id="periode-titre" className={styles.legende}>
        Période annoncée de la promotion
      </h2>
      <p id="periode-aide" className={styles.aide}>
        Le bandeau de la promotion écrit ces dates, par exemple « du lundi 23 au
        dimanche 29 novembre ». Laissez les deux champs vides pour
        n&apos;annoncer aucune date.
      </p>
      <div className={styles.champs}>
        <div className={styles.champ}>
          <label htmlFor="periode-debut" className={styles.libelle}>
            Premier jour
          </label>
          <input
            id="periode-debut"
            name="debut"
            type="date"
            defaultValue={periode?.debut ?? ""}
            className={styles.saisie}
            aria-describedby="periode-aide"
          />
        </div>
        <div className={styles.champ}>
          <label htmlFor="periode-fin" className={styles.libelle}>
            Dernier jour
          </label>
          <input
            id="periode-fin"
            name="fin"
            type="date"
            defaultValue={periode?.fin ?? ""}
            className={styles.saisie}
            aria-describedby="periode-aide"
          />
        </div>
      </div>
      <p
        role="status"
        aria-label="État de la période annoncée"
        className={styles.sortie}
      >
        {enCours ? "Enregistrement…" : messagePeriode(resultat)}
      </p>
      {resultat?.statut === "SESSION_ABSENTE" && (
        <p className={styles.sortie}>
          <Link
            href="/administration/connexion"
            prefetch={false}
            className={styles.lienSortie}
          >
            Se reconnecter
          </Link>
        </p>
      )}
      <button type="submit" className={styles.bouton} disabled={enCours}>
        Appliquer la période
      </button>
    </form>
  );
}
