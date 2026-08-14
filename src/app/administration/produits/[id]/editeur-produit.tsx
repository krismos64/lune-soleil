"use client";

/**
 * Editeur de fiche produit, composant client. LS-100 et LS-87.
 *
 * CE QUE CET ECRAN NE FAIT PAS : ni variante ni prix, LS-101 ; ni photographie,
 * LS-102 ; ni publication, LS-103. Ajouter un champ ici anticiperait une story
 * non commencee, et le service refuserait la cle inconnue.
 *
 * LE CONTENU D'UNE SECTION N'EST JAMAIS RENDU EN HTML, C23.
 * `dangerouslySetInnerHTML` et tout equivalent sont interdits sur ce chemin, et
 * un controle textuel le verifie. React echappe le texte par defaut : le risque
 * naitrait du rendu, jamais du stockage.
 *
 * DEUX GESTES DISTINCTS SUR UNE SECTION, et l'ecran doit les separer
 * visiblement. Masquer conserve le contenu et le retire de la fiche publique,
 * c'est reversible. Supprimer efface la ligne, contenu compris, et l'ecran
 * avertit avant en proposant le masquage comme solution de rechange.
 */

import { useState, useTransition } from "react";

import {
  ajouterSectionAction,
  basculerVisibiliteAction,
  enregistrerInformationsAction,
  modifierSectionAction,
  reordonnerSectionsAction,
  supprimerSectionAction,
  type ResultatSection,
} from "./actions";
import styles from "./editeur.module.css";

export type SectionAffichee = {
  id: string;
  titre: string;
  contenu: string;
  ordre: number;
  visible: boolean;
};

/**
 * Traduit le resultat d'une action en message affichable.
 *
 * `switch` EXHAUSTIF ET SANS `default`. Il rougit a la compilation si le type
 * gagne un membre, ce qu'un `default` silencieux laisserait passer.
 */
function messageDe(resultat: ResultatSection): string | null {
  switch (resultat.statut) {
    case "SUCCES":
      return null;
    case "SESSION_ABSENTE":
      return "Session expirée. Reconnectez-vous pour continuer.";
    case "INVALIDE":
      return resultat.message;
    case "INTROUVABLE":
      return "Cette section n'existe plus. Actualisez la page pour voir la fiche à jour.";
    case "ORDRE_INCOMPLET":
      return "La fiche a changé entre-temps. Actualisez la page avant de réordonner.";
    case "INDISPONIBLE":
      return "Enregistrement momentanément indisponible. Réessayez dans un instant.";
  }
}

export function EditeurProduit({
  produitId,
  nom: nomInitial,
  descriptionCourte: presentationInitiale,
  sections: sectionsInitiales,
}: {
  produitId: string;
  nom: string;
  descriptionCourte: string;
  sections: SectionAffichee[];
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);

  const [nom, setNom] = useState(nomInitial);
  const [presentation, setPresentation] = useState(presentationInitiale);
  const [sections, setSections] = useState(sectionsInitiales);
  const [titreAjout, setTitreAjout] = useState("");

  /**
   * Efface le message de succes des que la saisie reprend.
   *
   * SANS CELA, « Section supprimee » RESTE AFFICHE indefiniment, y compris
   * pendant que l'administratrice redige la section suivante. La regle du
   * projet interdit le succes optimiste, ce qui porte sur le MOMENT ou le
   * message est pose ; sa DUREE DE VIE est une seconde question, et un message
   * qui survit longtemps au geste qu'il decrit finit par ne plus rien dire.
   *
   * L'ERREUR N'EST PAS EFFACEE DE LA MEME FACON. Elle nomme souvent ce qu'il
   * faut corriger, « le titre ne peut pas etre vide » : la retirer a la
   * premiere frappe la ferait disparaitre avant d'avoir ete lue. Le prochain
   * envoi la remplace.
   */
  function oublierSucces() {
    setSucces((precedent) => (precedent === null ? precedent : null));
  }
  const [aSupprimer, setASupprimer] = useState<string | null>(null);

  /**
   * Joue une action et pose son message. LE SUCCES N'EST POSE QU'APRES LE
   * RETOUR DU SERVEUR : un succes optimiste ferait croire a un enregistrement
   * qu'une base injoignable n'a pas fait.
   */
  function jouer(
    action: () => Promise<ResultatSection>,
    messageSucces: string,
    apres?: () => void,
  ) {
    setErreur(null);
    setSucces(null);

    demarrer(async () => {
      const message = messageDe(await action());

      if (message) {
        setErreur(message);
        return;
      }

      setSucces(messageSucces);
      apres?.();
    });
  }

  function enregistrerInformations(evenement: React.FormEvent) {
    evenement.preventDefault();
    jouer(
      () => enregistrerInformationsAction(produitId, nom, presentation),
      "Informations enregistrées.",
    );
  }

  function enregistrerSection(section: SectionAffichee) {
    jouer(
      () =>
        modifierSectionAction(
          produitId,
          section.id,
          section.titre,
          section.contenu,
        ),
      `Section « ${section.titre} » enregistrée.`,
    );
  }

  function basculer(section: SectionAffichee) {
    const visible = !section.visible;
    jouer(
      () => basculerVisibiliteAction(produitId, section.id, visible),
      visible
        ? `Section « ${section.titre} » affichée sur la fiche.`
        : `Section « ${section.titre} » masquée, son contenu est conservé.`,
      () =>
        setSections((liste) =>
          liste.map((s) => (s.id === section.id ? { ...s, visible } : s)),
        ),
    );
  }

  function supprimer(section: SectionAffichee) {
    jouer(
      () => supprimerSectionAction(produitId, section.id),
      `Section « ${section.titre} » supprimée.`,
      () => {
        setSections((liste) => liste.filter((s) => s.id !== section.id));
        setASupprimer(null);
      },
    );
  }

  /**
   * Deplace une section d'un rang, et envoie L'ORDRE COMPLET.
   *
   * PAS DE GLISSER-DEPOSER : deux boutons par ligne fonctionnent au clavier, au
   * lecteur d'ecran et au doigt sur un ecran de 320 px, ce qu'un glisser-deposer
   * ne fait qu'au prix d'une implementation accessible bien plus lourde. La
   * fiche compte quatre a six sections, le gain d'un glisser serait mince.
   *
   * L'ORDRE ENVOYE EST EXHAUSTIF, et le service en tire les rangs 1..n : cela
   * rend impossible l'etat intermediaire ou un rang manque ou se repete.
   */
  function deplacer(index: number, direction: -1 | 1) {
    const cible = index + direction;
    if (cible < 0 || cible >= sections.length) {
      return;
    }

    const reordonnees = [...sections];
    const [deplacee] = reordonnees.splice(index, 1);
    if (!deplacee) {
      return;
    }
    reordonnees.splice(cible, 0, deplacee);

    jouer(
      () =>
        reordonnerSectionsAction(
          produitId,
          reordonnees.map((s) => s.id),
        ),
      `Section « ${deplacee.titre} » déplacée.`,
      () => setSections(reordonnees),
    );
  }

  function ajouter(evenement: React.FormEvent) {
    evenement.preventDefault();
    const titre = titreAjout.trim();
    jouer(
      () => ajouterSectionAction(produitId, titre),
      `Section « ${titre} » ajoutée.`,
      () => setTitreAjout(""),
    );
  }

  return (
    <div className={styles.editeur}>
      {/*
       * LES DEUX REGIONS D'ANNONCE SONT MONTEES EN PERMANENCE, LS-85. Un
       * element `role="status"` insere apres coup n'est pas toujours annonce :
       * le lecteur d'ecran surveille une region qui existe deja.
       */}
      <p className={styles.erreur} role="alert">
        {erreur}
      </p>
      <p className={styles.succes} role="status">
        {succes}
      </p>

      <section aria-labelledby="titre-informations">
        <h2 className={styles.sousTitre} id="titre-informations">
          Informations générales
        </h2>

        <form className={styles.carte} onSubmit={enregistrerInformations}>
          <div className={styles.champ}>
            <label className={styles.label} htmlFor="nom-produit">
              Nom du bijou
            </label>
            <input
              id="nom-produit"
              className={styles.saisie}
              value={nom}
              readOnly={enCours}
              onChange={(e) => {
                oublierSucces();
                setNom(e.target.value);
              }}
              maxLength={120}
              required
            />
            <p className={styles.aide}>
              L&apos;adresse de la fiche ne change pas, même si le nom est
              corrigé.
            </p>
          </div>

          <div className={styles.champ}>
            <label className={styles.label} htmlFor="presentation-produit">
              Présentation courte
            </label>
            <textarea
              id="presentation-produit"
              className={styles.zoneTexte}
              value={presentation}
              readOnly={enCours}
              onChange={(e) => {
                oublierSucces();
                setPresentation(e.target.value);
              }}
              maxLength={300}
              rows={3}
              aria-describedby="aide-presentation"
            />
            <p className={styles.aide} id="aide-presentation">
              Une ou deux phrases, reprises sur les cartes du catalogue.{" "}
              {presentation.length} caractères sur 300.
            </p>
          </div>

          <button type="submit" className={styles.bouton} disabled={enCours}>
            {enCours ? "Enregistrement..." : "Enregistrer les informations"}
          </button>
        </form>
      </section>

      <section aria-labelledby="titre-sections">
        <h2 className={styles.sousTitre} id="titre-sections">
          Sections de la fiche
        </h2>
        <p className={styles.aide}>
          Chaque section est facultative : elle se renomme, se déplace, se
          masque ou se supprime. Une section masquée ou vide n&apos;apparaît pas
          sur la fiche publique.
        </p>
        <p className={styles.aide}>
          Les dimensions ne se saisissent pas ici : elles appartiennent à chaque
          variante, un collier existant en 42 et 45 cm.
        </p>

        {sections.length === 0 && (
          <p className={styles.vide}>
            Cette fiche ne porte plus aucune section. Ajoutez-en une ci-dessous
            si vous souhaitez décrire le bijou.
          </p>
        )}

        <ol className={styles.liste}>
          {sections.map((section, index) => (
            <li className={styles.carte} key={section.id}>
              <div className={styles.champ}>
                <label className={styles.label} htmlFor={`titre-${section.id}`}>
                  Titre de la section
                </label>
                {/*
                 * `readOnly` PENDANT L'ENVOI, ET NON `disabled`, sur tous les
                 * champs de cet ecran. Le service a capture la valeur AU MOMENT
                 * DE L'APPEL : une frappe faite pendant l'aller-retour serait
                 * perdue en silence, et l'ecran annoncerait « section
                 * enregistree » en montrant un texte qui n'est pas en base.
                 * Une divergence entre l'affichage et la verite est plus
                 * trompeuse qu'une erreur franche.
                 *
                 * `disabled` sortirait le champ de l'ordre de tabulation et
                 * ferait perdre le focus en pleine saisie ; `readOnly` le garde
                 * lisible, focusable et annonce par le lecteur d'ecran.
                 */}
                <input
                  id={`titre-${section.id}`}
                  className={styles.saisie}
                  value={section.titre}
                  readOnly={enCours}
                  maxLength={80}
                  onChange={(e) => {
                    oublierSucces();
                    setSections((liste) =>
                      liste.map((s) =>
                        s.id === section.id
                          ? { ...s, titre: e.target.value }
                          : s,
                      ),
                    );
                  }}
                />
              </div>

              <div className={styles.champ}>
                <label
                  className={styles.label}
                  htmlFor={`contenu-${section.id}`}
                >
                  Texte affiché
                </label>
                <textarea
                  id={`contenu-${section.id}`}
                  className={styles.zoneTexte}
                  value={section.contenu}
                  readOnly={enCours}
                  maxLength={5000}
                  rows={5}
                  onChange={(e) => {
                    oublierSucces();
                    setSections((liste) =>
                      liste.map((s) =>
                        s.id === section.id
                          ? { ...s, contenu: e.target.value }
                          : s,
                      ),
                    );
                  }}
                />
              </div>

              {!section.visible && (
                <p className={styles.marqueur}>
                  Masquée : ce texte est conservé mais n&apos;apparaît pas sur
                  la fiche.
                </p>
              )}

              <div className={styles.actions}>
                {/*
                 * CHAQUE BOUTON NOMME SA SECTION, LS-85. Sans `aria-label`,
                 * la liste des boutons de la page s'entend « Enregistrer,
                 * Masquer, Supprimer, Enregistrer, Masquer, Supprimer... »
                 * sans jamais dire de quelle section il s'agit. La regle
                 * valait deja pour Monter et Descendre : l'appliquer a deux
                 * boutons sur cinq etait l'incoherence.
                 */}
                <button
                  type="button"
                  className={styles.bouton}
                  onClick={() => enregistrerSection(section)}
                  disabled={enCours}
                  aria-label={`Enregistrer la section ${section.titre}`}
                >
                  Enregistrer
                </button>
                <button
                  type="button"
                  className={styles.boutonSecondaire}
                  onClick={() => basculer(section)}
                  disabled={enCours}
                  aria-label={
                    section.visible
                      ? `Masquer la section ${section.titre}`
                      : `Afficher la section ${section.titre}`
                  }
                >
                  {section.visible ? "Masquer" : "Afficher"}
                </button>
                <button
                  type="button"
                  className={styles.boutonSecondaire}
                  onClick={() => deplacer(index, -1)}
                  disabled={enCours || index === 0}
                  aria-label={`Monter la section ${section.titre}`}
                >
                  Monter
                </button>
                <button
                  type="button"
                  className={styles.boutonSecondaire}
                  onClick={() => deplacer(index, 1)}
                  disabled={enCours || index === sections.length - 1}
                  aria-label={`Descendre la section ${section.titre}`}
                >
                  Descendre
                </button>
                <button
                  type="button"
                  className={styles.boutonDanger}
                  onClick={() => setASupprimer(section.id)}
                  disabled={enCours}
                  aria-label={`Supprimer la section ${section.titre}`}
                >
                  Supprimer
                </button>
              </div>

              {/*
               * L'AVERTISSEMENT DIT CE QUI SE PERD ET PROPOSE LE MASQUAGE,
               * ADR-026 decision 5. Une confirmation qui se contenterait de
               * demander « confirmer ? » ne dit pas que le texte part avec la
               * ligne, sans conservation.
               */}
              {aSupprimer === section.id && (
                /*
                 * `alertdialog` PORTE SON CONTRAT COMPLET, sinon il vaut moins
                 * qu'un `div` : le lecteur d'ecran annonce « dialogue » puis
                 * ne trouve ni nom ni description. Trois attributs sont donc
                 * obligatoires ensemble, et `Escape` ferme le panneau, un
                 * dialogue sans sortie au clavier piegeant l'utilisateur.
                 */
                <div
                  className={styles.confirmation}
                  role="alertdialog"
                  aria-labelledby={`confirmation-titre-${section.id}`}
                  aria-describedby={`confirmation-texte-${section.id}`}
                  onKeyDown={(evenement) => {
                    if (evenement.key === "Escape") {
                      setASupprimer(null);
                    }
                  }}
                >
                  <h3
                    className={styles.confirmationTitre}
                    id={`confirmation-titre-${section.id}`}
                  >
                    Supprimer cette section ?
                  </h3>
                  <p
                    className={styles.confirmationTexte}
                    id={`confirmation-texte-${section.id}`}
                  >
                    Le texte de « {section.titre} » sera perdu, sans possibilité
                    de le retrouver. Pour seulement le retirer de la fiche,
                    utilisez Masquer.
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.boutonDanger}
                      onClick={() => supprimer(section)}
                      disabled={enCours}
                    >
                      Supprimer définitivement
                    </button>
                    <button
                      type="button"
                      className={styles.boutonSecondaire}
                      onClick={() => setASupprimer(null)}
                      disabled={enCours}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>

        <form className={styles.carte} onSubmit={ajouter}>
          <div className={styles.champ}>
            <label className={styles.label} htmlFor="titre-nouvelle-section">
              Ajouter une section
            </label>
            <input
              id="titre-nouvelle-section"
              className={styles.saisie}
              value={titreAjout}
              readOnly={enCours}
              onChange={(e) => {
                oublierSucces();
                setTitreAjout(e.target.value);
              }}
              maxLength={80}
              placeholder="Guide des tailles"
              required
            />
          </div>
          <button
            type="submit"
            className={styles.bouton}
            disabled={enCours || titreAjout.trim().length === 0}
          >
            Ajouter la section
          </button>
        </form>
      </section>
    </div>
  );
}
