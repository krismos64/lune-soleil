"use client";

/**
 * Creation d'un produit, composant client. LS-99, parcours 3 etape 2.
 *
 * CE FORMULAIRE NE CREE QU'UN BROUILLON : un nom et une categorie. Les sections
 * editoriales viennent de LS-100, les variantes et le prix de LS-101, les medias
 * de LS-102, la publication de LS-103. Ajouter un champ ici anticiperait une
 * story non commencee, et le service refuserait la cle inconnue.
 */

import { useState, useTransition } from "react";

import {
  creerProduitAction,
  type ResultatAction,
} from "../../categories/actions";
import styles from "./nouveau-produit.module.css";

export type CategorieOption = {
  id: string;
  nom: string;
};

function messageDe(resultat: ResultatAction): string | null {
  switch (resultat.statut) {
    case "SUCCES":
      return null;
    case "SESSION_ABSENTE":
      return "Session expirée. Reconnectez-vous pour continuer.";
    case "INVALIDE":
      return resultat.message;
    case "SLUG_DEJA_PRIS":
      return "Un produit porte déjà une adresse identique. Choisissez un autre nom.";
    case "INTROUVABLE":
      return "Cette catégorie n'existe plus. Actualisez la page pour voir la liste à jour.";
    case "CATEGORIE_NON_VIDE":
    case "ORDRE_INCOMPLET":
      /*
       * Ces deux refus ne peuvent pas naitre de ce formulaire, qui ne supprime
       * ni ne reordonne rien. Le cas est traite plutot qu'ignore : un `switch`
       * exhaustif rougit a la compilation si le type gagne un membre, ce qu'un
       * `default` silencieux laisserait passer.
       */
      return "Opération inattendue. Actualisez la page.";
    case "INDISPONIBLE":
      return "Création momentanément indisponible. Réessayez dans un instant.";
  }
}

export function FormulaireProduit({
  categories,
}: {
  categories: CategorieOption[];
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [categorieId, setCategorieId] = useState("");

  /*
   * SANS CATEGORIE, AUCUN PRODUIT NE SE RANGE. L'ecran le dit et renvoie vers
   * l'endroit ou la creer, plutot que d'afficher une liste deroulante vide dont
   * l'administratrice ne saurait que faire.
   */
  if (categories.length === 0) {
    return (
      <p className={styles.vide}>
        Aucune catégorie n&apos;existe encore. Créez-en une avant d&apos;ajouter
        un produit :{" "}
        <a href="/administration/categories">gérer les catégories</a>.
      </p>
    );
  }

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    setSucces(null);

    demarrer(async () => {
      const resultat = await creerProduitAction(nom, categorieId);
      const message = messageDe(resultat);

      if (message) {
        setErreur(message);
        return;
      }

      // LE MESSAGE N'EST POSE QU'APRES LE RETOUR DU SERVEUR : un succes
      // optimiste ferait croire a une creation qu'une base injoignable n'a pas
      // faite.
      setSucces(`Produit ${nom} créé en brouillon.`);
      setNom("");
    });
  }

  return (
    <form className={styles.formulaire} onSubmit={soumettre}>
      <div className={styles.champ}>
        <label className={styles.label} htmlFor="nom-produit">
          Nom du produit
        </label>
        <input
          id="nom-produit"
          className={styles.saisie}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          maxLength={120}
          autoComplete="off"
          required
          aria-describedby="aide-nom"
        />
        <p className={styles.aide} id="aide-nom">
          Il servira à construire l&apos;adresse de la fiche, et ne changera
          plus ensuite.
        </p>
      </div>

      <div className={styles.champ}>
        <label className={styles.label} htmlFor="categorie-produit">
          Catégorie
        </label>
        <select
          id="categorie-produit"
          className={styles.saisie}
          value={categorieId}
          onChange={(e) => setCategorieId(e.target.value)}
          required
        >
          <option value="">Choisir une catégorie</option>
          {categories.map((categorie) => (
            <option key={categorie.id} value={categorie.id}>
              {categorie.nom}
            </option>
          ))}
        </select>
      </div>

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

      <button
        type="submit"
        className={styles.bouton}
        disabled={enCours || nom.trim().length === 0 || categorieId === ""}
      >
        {enCours ? "Création en cours..." : "Créer le brouillon"}
      </button>
    </form>
  );
}
