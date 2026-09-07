"use client";

/**
 * Champ de mot de passe avec bascule de lisibilite, LS-179.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE COMPOSANT EXISTE.
 *
 * ADR-023 impose SEIZE caracteres minimum, contre l'usage courant de huit. Une
 * saisie de seize caracteres a l'aveugle, sur un clavier mobile qui masque
 * chaque frappe apres un instant, produit ce que le projet cherche a eviter :
 * quelqu'un qui renonce a l'inscription, ou qui raccourcit son mot de passe
 * jusqu'a la limite basse pour ne plus se tromper. Le commentaire d'ADR-021 le
 * dit deja pour l'administration : une contrainte trop lourde « pousse a des
 * mots de passe plus faibles et previsibles ».
 *
 * CINQ ECRANS L'EMPLOIENT, six champs : connexion, inscription, nouveau mot de
 * passe, reauthentification, et les DEUX champs du profil. Le profil ne
 * figurait pas dans la description du ticket, arbitrage de Christophe du
 * 7 septembre 2026 : c'est pourtant la que se saisit un mot de passe neuf de
 * seize caracteres, le cas d'usage le plus fort de la story.
 *
 * L'ADMINISTRATION EST HORS PERIMETRE, ADR-021 : son mot de passe est un
 * chemin de repli derriere la passkey, et LS-175 le porte.
 * ------------------------------------------------------------------
 */
import { useId, useRef, useState } from "react";

import styles from "./champ-mot-de-passe.module.css";

type Props = {
  /** `id` de l'input, cible du `htmlFor` du label pose par l'appelant. */
  id: string;
  name: string;
  /*
   * CONTROLE OU NON CONTROLE, LES DEUX SONT ACCEPTES, et ce n'est pas une
   * generalisation prematuree : les cinq ecrans se repartissent reellement sur
   * les deux formes. Les quatre du parcours d'authentification tiennent leur
   * valeur dans un `useState` ; l'ecran du PROFIL est non controle, il lit son
   * `FormData` a la soumission et vide ses champs par `formulaire.reset()`.
   *
   * FORCER LE PROFIL EN CONTROLE casserait ce `reset()`, qui ne remet pas a
   * zero un `useState` : les champs paraitraient vides tout en gardant leur
   * valeur dans l'etat React. Le mot de passe survivrait a un changement
   * reussi, sur un poste possiblement partage.
   */
  value?: string;
  onChange?: (valeur: string) => void;
  /**
   * `current-password` pour une saisie du mot de passe existant,
   * `new-password` pour une saisie neuve. LES DEUX SONT DISTINCTS et ce n'est
   * pas cosmetique : un gestionnaire de mots de passe propose l'existant sur le
   * premier et engendre une valeur neuve sur le second. Les confondre ferait
   * remplir les deux avec l'ancien.
   */
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
  maxLength?: number;
  "aria-describedby"?: string;
};

export function ChampMotDePasse({
  id,
  name,
  value,
  onChange,
  autoComplete,
  required,
  disabled,
  minLength,
  maxLength,
  "aria-describedby": aideId,
}: Props) {
  /*
   * L'ETAT PAR DEFAUT EST MASQUE, ET IL NE SE MEMORISE PAS.
   *
   * L'etat vit dans ce composant, donc il meurt avec lui : passer d'un ecran a
   * l'autre remonte un composant neuf, masque. C'est voulu. Un mot de passe
   * affiche par surprise sur l'ecran suivant, parce qu'un `localStorage` aurait
   * retenu le choix, est pire que pas de bouton du tout.
   */
  const [visible, setVisible] = useState(false);
  const saisie = useRef<HTMLInputElement>(null);
  const etatId = useId();

  const basculer = () => {
    /*
     * LA POSITION DU CURSEUR SURVIT A LA BASCULE, critere 4.
     *
     * Changer `type` sur un input monte remet le curseur a la fin sur plusieurs
     * navigateurs, WebKit en tete : la valeur est reinterpretee et la selection
     * perdue. On releve donc la selection AVANT le rendu et on la repose apres.
     *
     * L'ELEMENT N'EST PAS REMONTE : c'est le meme `input` dont l'attribut
     * `type` change, jamais deux inputs echanges par un ternaire. Deux inputs
     * feraient perdre la valeur, le focus, et casseraient le remplissage
     * automatique du gestionnaire de mots de passe.
     */
    const champ = saisie.current;
    const debut = champ?.selectionStart ?? null;
    const fin = champ?.selectionEnd ?? null;

    setVisible((etat) => !etat);

    if (champ && debut !== null && fin !== null) {
      /*
       * APRES LE RENDU, sinon la selection est reposee sur l'ancien `type` puis
       * ecrasee. `requestAnimationFrame` et non `setTimeout(0)` : le premier
       * est cale sur la peinture, le second court avant elle par intermittence.
       */
      requestAnimationFrame(() => {
        champ.focus();
        champ.setSelectionRange(debut, fin);
      });
    }
  };

  /*
   * LE NOM ACCESSIBLE DIT L'ETAT, critere 2. « Afficher » quand c'est masque,
   * « Masquer » quand c'est visible : le nom decrit l'action que le bouton
   * declenche, convention des boutons de bascule.
   *
   * PAS DE `aria-pressed` EN PLUS. Le couple des deux ferait annoncer « Masquer
   * le mot de passe, bouton bascule, active », ou l'etat est dit deux fois et
   * dans deux sens qui se contredisent a l'oreille.
   */
  const nomAccessible = visible
    ? "Masquer le mot de passe"
    : "Afficher le mot de passe";

  return (
    <div className={styles.enveloppe}>
      <input
        ref={saisie}
        id={id}
        name={name}
        /*
         * `text` ET NON UN AUTRE TYPE quand c'est visible. `type="text"` porte
         * le meme comportement de saisie, et `autoComplete` reste lu par les
         * gestionnaires de mots de passe, critere 6.
         */
        type={visible ? "text" : "password"}
        className={styles.saisie}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        minLength={minLength}
        maxLength={maxLength}
        /*
         * `value` N'EST POSE QUE S'IL EST FOURNI. Passer `value={undefined}`
         * suffirait a laisser l'input non controle, mais passer `onChange` sans
         * `value` ferait avertir React ; les deux vont donc ensemble.
         */
        {...(value !== undefined
          ? {
              value,
              onChange: (evenement: React.ChangeEvent<HTMLInputElement>) =>
                onChange?.(evenement.target.value),
            }
          : {})}
        aria-describedby={
          /*
           * L'ANNONCE D'ETAT S'AJOUTE A L'AIDE DE L'APPELANT sans la remplacer.
           * Ecraser `aria-describedby` ferait perdre « seize caracteres
           * minimum » au moment ou il sert, motif de LS-161.
           */
          aideId ? `${aideId} ${etatId}` : etatId
        }
      />

      <button
        type="button"
        className={styles.bascule}
        onClick={basculer}
        disabled={disabled}
        aria-label={nomAccessible}
        /*
         * `aria-controls` RATTACHE LE BOUTON A SON CHAMP. Sans lui, un bouton
         * nomme « Afficher le mot de passe » ne dit pas lequel sur le profil,
         * qui en porte deux.
         */
        aria-controls={id}
      >
        {/*
         * UN LIBELLE TEXTUEL ET NON UNE ICONE. Le ticket l'impose, et une icone
         * seule laisse sans rien les lecteurs d'ecran comme les personnes qui
         * ne reconnaissent pas l'oeil barre. `aria-hidden` : le nom du bouton
         * vient de `aria-label`, ce texte le repeterait.
         */}
        <span aria-hidden="true">{visible ? "Masquer" : "Afficher"}</span>
      </button>

      {/*
       * LE CHANGEMENT EST ANNONCE, critere 2.
       *
       * `role="status"`, donc `aria-live="polite"` : l'annonce attend une pause
       * dans la lecture plutot que de couper la saisie en cours. Le texte est
       * hors flux visuel, l'etat se voyant a l'ecran.
       *
       * AUCUNE VALEUR DE MOT DE PASSE ICI, invariant 9 et critere 7 : le texte
       * dit l'etat du champ, jamais son contenu.
       */}
      <span id={etatId} role="status" className={styles.annonce}>
        {visible ? "Mot de passe visible" : "Mot de passe masqué"}
      </span>
    </div>
  );
}
