"use client";

/**
 * Gestion des categories, composant client. LS-99.
 *
 * COMPOSANT CLIENT PARCE QU'IL Y A UNE INTERACTION REELLE : creation, renommage
 * en place, deplacement, suppression, chacune avec ses etats pending et erreur.
 * La lecture, elle, reste au serveur : ce composant recoit sa liste en
 * proprietes et ne requete rien.
 *
 * IL NE DECIDE RIEN. Chaque geste appelle une Server Action, qui exige le role
 * et delegue au service. Le rendu conditionnel ici n'est jamais une protection,
 * seulement un affichage : un client qui masquerait le bouton par l'inspecteur
 * n'obtiendrait rien de plus, la garde etant cote serveur.
 *
 * DEPLACEMENT PAR BOUTONS ET NON PAR GLISSER-DEPOSER. Un glisser-deposer
 * accessible au clavier et au lecteur d'ecran demande une implementation
 * complete que WCAG 2.2 impose ; deux boutons « monter » et « descendre »
 * rendent le meme service, fonctionnent au clavier sans travail
 * supplementaire et restent utilisables au pouce a 320 px.
 */

import { useState, useTransition } from "react";

import {
  creerCategorieAction,
  renommerCategorieAction,
  reordonnerCategoriesAction,
  supprimerCategorieAction,
  type ResultatAction,
} from "./actions";
import styles from "./categories.module.css";

export type CategorieAffichee = {
  id: string;
  nom: string;
  slug: string;
  ordre: number;
  nombreProduits: number;
};

/**
 * Traduit un resultat d'action en message affichable.
 *
 * UN SEUL ENDROIT POUR LES MESSAGES, ce qui evite qu'un meme refus soit formule
 * differemment selon le bouton. Les textes suivent les regles de redaction du
 * projet : accents presents, aucun accord au feminin par defaut.
 */
function messageDe(resultat: ResultatAction): string | null {
  switch (resultat.statut) {
    case "SUCCES":
      return null;
    case "SESSION_ABSENTE":
      return "Session expirée. Reconnectez-vous pour continuer.";
    case "INVALIDE":
      return resultat.message;
    case "SLUG_DEJA_PRIS":
      return "Une catégorie porte déjà une adresse identique. Choisissez un autre nom.";
    case "INTROUVABLE":
      return "Cette catégorie n'existe plus. Actualisez la page.";
    case "CATEGORIE_NON_VIDE":
      return `Suppression impossible : ${resultat.nombreProduits} produit${
        resultat.nombreProduits > 1 ? "s y sont rattachés" : " y est rattaché"
      }. Déplacez-${resultat.nombreProduits > 1 ? "les" : "le"} d'abord vers une autre catégorie.`;
    case "ORDRE_INCOMPLET":
      return "L'ordre a changé entre-temps. Actualisez la page avant de recommencer.";
    case "INDISPONIBLE":
      return "Opération momentanément indisponible. Réessayez dans un instant.";
  }
}

export function GestionCategories({
  categories,
}: {
  categories: CategorieAffichee[];
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [nouveauNom, setNouveauNom] = useState("");
  /** Identifiant de la categorie en cours de renommage, ou null. */
  const [renommage, setRenommage] = useState<string | null>(null);
  const [nomEdite, setNomEdite] = useState("");

  /**
   * Enveloppe commune : vide les messages, lance l'action, affiche l'issue.
   *
   * LE MESSAGE DE SUCCES N'EST PAS OPTIMISTE. Il n'est pose qu'apres le retour
   * du serveur : afficher « enregistré » avant la reponse ferait mentir
   * l'interface sur une base injoignable, ce que les etats obligatoires de
   * `frontend-design.md` interdisent.
   */
  function lancer(action: () => Promise<ResultatAction>, messageSucces: string) {
    setErreur(null);
    setSucces(null);

    demarrer(async () => {
      const resultat = await action();
      const message = messageDe(resultat);

      if (message) {
        setErreur(message);
        return;
      }

      setSucces(messageSucces);
    });
  }

  function creer(evenement: React.FormEvent) {
    evenement.preventDefault();
    const nom = nouveauNom;

    lancer(async () => {
      const resultat = await creerCategorieAction(nom);
      if (resultat.statut === "SUCCES") {
        setNouveauNom("");
      }
      return resultat;
    }, "Catégorie créée.");
  }

  function renommer(evenement: React.FormEvent, id: string) {
    evenement.preventDefault();
    const nom = nomEdite;

    lancer(async () => {
      const resultat = await renommerCategorieAction(id, nom);
      if (resultat.statut === "SUCCES") {
        setRenommage(null);
      }
      return resultat;
    }, "Nom enregistré.");
  }

  /**
   * Deplace une categorie d'un rang, en envoyant l'ORDRE COMPLET.
   *
   * Le service attend la liste exhaustive et refuse un sous-ensemble : c'est ce
   * qui rend impossible un etat ou deux categories partagent un rang. La
   * permutation se calcule ici, mais l'ecriture des rangs 1..n reste au serveur.
   */
  function deplacer(index: number, direction: -1 | 1) {
    const cible = index + direction;
    if (cible < 0 || cible >= categories.length) {
      return;
    }

    const ordre = categories.map((c) => c.id);
    const [deplacee] = ordre.splice(index, 1);
    if (!deplacee) {
      return;
    }
    ordre.splice(cible, 0, deplacee);

    lancer(
      () => reordonnerCategoriesAction(ordre),
      "Ordre d'affichage enregistré.",
    );
  }

  function supprimer(categorie: CategorieAffichee) {
    lancer(
      () => supprimerCategorieAction(categorie.id),
      `Catégorie ${categorie.nom} supprimée.`,
    );
  }

  return (
    <div className={styles.gestion}>
      <form className={styles["formulaire-creation"]} onSubmit={creer}>
        <label className={styles.label} htmlFor="nouveau-nom">
          Nom de la nouvelle catégorie
        </label>
        <div className={styles["ligne-creation"]}>
          <input
            id="nouveau-nom"
            className={styles.champ}
            value={nouveauNom}
            onChange={(e) => setNouveauNom(e.target.value)}
            maxLength={120}
            autoComplete="off"
            required
          />
          <button
            type="submit"
            className={styles["bouton-principal"]}
            disabled={enCours || nouveauNom.trim().length === 0}
          >
            Ajouter
          </button>
        </div>
      </form>

      {/*
        `role="alert"` et `role="status"` et non une couleur seule : l'issue doit
        parvenir au lecteur d'ecran, regle d'accessibilite du projet.
      */}
      {erreur && (
        <p className={styles.erreur} role="alert">
          {erreur}
        </p>
      )}
      {succes && (
        <p className={styles.succes} role="status">
          {succes}
        </p>
      )}

      {categories.length === 0 ? (
        /* ETAT VIDE OBLIGATOIRE, jamais une liste vide sans explication. */
        <p className={styles.vide}>
          Aucune catégorie pour le moment. Créez la première ci-dessus, elle sera
          nécessaire pour ranger un produit.
        </p>
      ) : (
        <ol className={styles.liste}>
          {categories.map((categorie, index) => (
            <li key={categorie.id} className={styles.categorie}>
              {renommage === categorie.id ? (
                <form
                  className={styles["formulaire-renommage"]}
                  onSubmit={(e) => renommer(e, categorie.id)}
                >
                  <label
                    className={styles.label}
                    htmlFor={`nom-${categorie.id}`}
                  >
                    Nouveau nom
                  </label>
                  <input
                    id={`nom-${categorie.id}`}
                    className={styles.champ}
                    value={nomEdite}
                    onChange={(e) => setNomEdite(e.target.value)}
                    maxLength={120}
                    autoComplete="off"
                    required
                  />
                  {/*
                    L'ADRESSE NE CHANGE PAS AVEC LE NOM, et l'ecran le dit : sans
                    cette phrase, l'administratrice croirait l'adresse cassee ou
                    s'etonnerait qu'elle ne suive pas.
                  */}
                  <p className={styles.aide}>
                    L&apos;adresse de la page, /{categorie.slug}, ne change pas :
                    les liens déjà partagés restent valides.
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="submit"
                      className={styles["bouton-principal"]}
                      disabled={enCours || nomEdite.trim().length === 0}
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      className={styles.bouton}
                      onClick={() => setRenommage(null)}
                      disabled={enCours}
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className={styles.entete}>
                    <span className={styles.nom}>{categorie.nom}</span>
                    <span
                      className={styles.compte}
                      id={`compte-${categorie.id}`}
                    >
                      {categorie.nombreProduits === 0
                        ? "Aucun produit"
                        : `${categorie.nombreProduits} produit${
                            categorie.nombreProduits > 1 ? "s" : ""
                          }`}
                    </span>
                  </div>
                  <p className={styles.slug}>/{categorie.slug}</p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.bouton}
                      onClick={() => {
                        setRenommage(categorie.id);
                        setNomEdite(categorie.nom);
                        setErreur(null);
                        setSucces(null);
                      }}
                      disabled={enCours}
                    >
                      Renommer
                    </button>
                    <button
                      type="button"
                      className={styles.bouton}
                      onClick={() => deplacer(index, -1)}
                      disabled={enCours || index === 0}
                      // NOM ACCESSIBLE EXPLICITE : « Monter » seul ne dit pas
                      // quoi, un lecteur d'ecran annoncerait dix boutons
                      // identiques.
                      aria-label={`Monter ${categorie.nom}`}
                    >
                      Monter
                    </button>
                    <button
                      type="button"
                      className={styles.bouton}
                      onClick={() => deplacer(index, 1)}
                      disabled={enCours || index === categories.length - 1}
                      aria-label={`Descendre ${categorie.nom}`}
                    >
                      Descendre
                    </button>
                    <button
                      type="button"
                      className={styles["bouton-danger"]}
                      onClick={() => supprimer(categorie)}
                      /*
                        DESACTIVE QUAND LA CATEGORIE PORTE DES PRODUITS, C26.
                        L'ecran EXPLIQUE avant que le geste ne soit tente, ce que
                        le critere 2 demande. La protection reelle reste cote
                        serveur : ce `disabled` est une courtoisie, pas une garde.
                      */
                      disabled={enCours || categorie.nombreProduits > 0}
                      aria-label={`Supprimer ${categorie.nom}`}
                      /*
                        LA RAISON EST ANNONCEE, pas seulement survolable. Un
                        `title` seul ne parvient ni au toucher ni de facon fiable
                        au lecteur d'ecran : `aria-describedby` pointe le texte
                        deja visible qui porte le compte de produits, et la
                        personne entend « Supprimer Colliers, 3 produits ».
                      */
                      aria-describedby={
                        categorie.nombreProduits > 0
                          ? `compte-${categorie.id}`
                          : undefined
                      }
                      title={
                        categorie.nombreProduits > 0
                          ? "Cette catégorie porte des produits, elle ne peut pas être supprimée."
                          : undefined
                      }
                    >
                      Supprimer
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
