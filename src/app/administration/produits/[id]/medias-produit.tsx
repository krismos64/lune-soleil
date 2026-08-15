"use client";

/**
 * Photographies d'un produit, composant client. LS-102, ADR-007.
 *
 * TROIS PROPRIETES QUE CET ECRAN DOIT RENDRE VISIBLES :
 *
 * 1. UNE PHOTOGRAPHIE NON TRAITEE N'EST JAMAIS SERVIE, C8. Un media en echec
 *    reste affiche ici, avec son etat, plutot que d'etre masque : le masquer
 *    ferait croire le televersement sans effet, et la publication du produit
 *    serait refusee plus tard sans que rien n'explique pourquoi.
 * 2. LE PREMIER MEDIA EST LE MEDIA PRINCIPAL, C9, celui que la boutique montre
 *    en vignette. L'ordre n'est donc pas cosmetique, et l'ecran le dit.
 * 3. LE TEXTE ALTERNATIF SERA EXIGE A LA PUBLICATION, C7, exigence WCAG 2.2 AA.
 *    Il reste facultatif ici, et l'ecran signale ce qui manquera.
 *
 * CE COMPOSANT NE LIT AUCUN FICHIER. Il transmet les octets tels quels a la
 * Server Action : ni le nom, ni le type MIME annonce par le navigateur ne sont
 * une donnee fiable, invariant 7. Aucune verification cote client ne remplace
 * celle du serveur, et il n'y en a donc pas ici qui pretende proteger.
 */

import { useEffect, useRef, useState, useTransition } from "react";

import {
  ecrireTexteAlternatifAction,
  reordonnerMediasAction,
  supprimerMediaAction,
  televerserPhotographieAction,
  type ResultatMedia,
} from "./actions-medias";
import styles from "./editeur.module.css";

/** Statut de traitement, tel que le rend le service. C8. */
export type StatutMediaAffiche = "EN_ATTENTE" | "TRAITE" | "ECHOUE";

export type MediaAffiche = {
  id: string;
  chemin: string;
  texteAlternatif: string | null;
  ordre: number;
  statutTraitement: StatutMediaAffiche;
  /**
   * URL de la vignette, ou `null` si le media n'a aucun fichier servable.
   *
   * CALCULEE PAR LA PAGE ET NON ICI, ADR-007 : `Media.chemin` porte un chemin
   * relatif au dossier `public/` du volume, et le prefixe de service appartient
   * a la configuration de Nginx, pas aux donnees. Un composant client qui
   * fabriquerait cette URL lui-meme figerait ce prefixe dans le paquet envoye
   * au navigateur.
   */
  vignette: string | null;
};

/**
 * Ce que l'ecran dit de chaque statut, UNE ENTREE PAR VALEUR DE L'ENUM.
 *
 * MEME FORME QUE `ETAT_AFFICHE` DE LS-100, et pour le meme motif : sous un
 * `Record` exhaustif, ajouter une valeur a `StatutTraitementMedia` CASSE LA
 * COMPILATION. Ecrit en ternaires, l'ajout passerait inapercu et la nouvelle
 * valeur tomberait silencieusement dans la branche par defaut. Le piege a deja
 * ete rencontre deux fois ici, sur un index partiel puis dans du JSX.
 */
const STATUT_AFFICHE: Record<
  StatutMediaAffiche,
  { libelle: string; explication: string }
> = {
  EN_ATTENTE: {
    libelle: "Traitement en cours",
    explication:
      "Cette photo n'est pas encore prête. Rechargez la page dans quelques instants.",
  },
  TRAITE: {
    libelle: "Prête",
    explication: "Cette photo est traitée et pourra être publiée.",
  },
  ECHOUE: {
    libelle: "Échec du traitement",
    explication:
      "Cette photo n'a pas pu être traitée : elle ne sera pas publiée. Supprimez-la et téléversez-la à nouveau.",
  },
};

/**
 * Traduit un refus de la Server Action en message pour l'exploitante.
 *
 * REND `null` SUR SUCCES, ce qui permet a l'appelant de tester la valeur plutot
 * que le statut. Meme convention qu'en LS-100 et LS-101.
 *
 * LE `Record` EST EXHAUSTIF ICI AUSSI : un statut ajoute a `ResultatMedia` sans
 * message casse la compilation, au lieu de rendre une chaine vide a l'ecran.
 */
function messageDe(resultat: ResultatMedia): string | null {
  switch (resultat.statut) {
    case "SUCCES":
      return null;
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous pour continuer.";
    case "INVALIDE":
      return resultat.message;
    case "INTROUVABLE":
      return "Cette photo n'existe plus. Rechargez la page.";
    case "FICHIER_REFUSE":
      return "Ce fichier n'est pas une photographie exploitable. Formats acceptés : JPEG, PNG, HEIC, WebP, AVIF.";
    case "TROP_VOLUMINEUX":
      return `Ce fichier dépasse ${Math.round(resultat.tailleMaxOctets / 1024 / 1024)} Mo. Réduisez sa taille avant de le téléverser.`;
    case "TRAITEMENT_ECHOUE":
      return "Le traitement de cette photo a échoué : elle ne sera pas publiée. Supprimez-la et réessayez.";
    case "ORDRE_INCOMPLET":
      return "L'ordre des photos a changé entre-temps. Rechargez la page.";
    case "INDISPONIBLE":
      return "Le service est momentanément indisponible. Réessayez dans un instant.";
  }
}

export function MediasProduit({
  produitId,
  medias,
}: {
  produitId: string;
  medias: MediaAffiche[];
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [aSupprimer, setASupprimer] = useState<string | null>(null);
  const [textes, setTextes] = useState<Record<string, string>>({});

  const champFichier = useRef<HTMLInputElement | null>(null);

  /*
   * LE FOCUS ENTRE DANS LE PANNEAU A SON OUVERTURE, et revient au bouton qui
   * l'a ouvert a sa fermeture. Defaut corrige en LS-101, repris ici a
   * l'identique : sans cela, la plupart des lecteurs d'ecran n'annoncent pas
   * l'`alertdialog`, et Echap ne sert a rien puisque son gestionnaire ne recoit
   * jamais l'evenement.
   */
  const panneau = useRef<HTMLDivElement | null>(null);
  const declencheur = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (aSupprimer !== null) {
      panneau.current?.focus();
    } else {
      declencheur.current?.focus();
      declencheur.current = null;
    }
  }, [aSupprimer]);

  /** Ouvre la confirmation en retenant le bouton d'ou elle vient. */
  function demanderSuppression(
    id: string,
    bouton: HTMLButtonElement | null,
  ): void {
    declencheur.current = bouton;
    setASupprimer(id);
  }

  /** Efface le succès dès que la saisie reprend, LS-100. */
  function oublierSucces() {
    setSucces((precedent) => (precedent === null ? precedent : null));
  }

  function jouer(
    action: () => Promise<ResultatMedia>,
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

  /**
   * Televerse le fichier choisi.
   *
   * LE CHAMP EST VIDE APRES COUP, y compris en cas d'echec. Sans cela, choisir
   * deux fois le meme fichier ne declencherait aucun evenement `change`, et
   * l'exploitante croirait l'interface bloquee apres une premiere tentative
   * refusee.
   */
  function televerser(fichier: File) {
    const donnees = new FormData();
    donnees.set("fichier", fichier);

    jouer(
      () => televerserPhotographieAction(produitId, donnees),
      "Photo téléversée et traitée.",
      () => {
        if (champFichier.current) {
          champFichier.current.value = "";
        }
      },
    );
  }

  /**
   * Deplace un media d'un rang, et transmet L'ORDRE COMPLET.
   *
   * LE SERVICE EXIGE LA LISTE EXHAUSTIVE, C9 : il en tire les rangs 1..n, ce
   * qui rend impossible un etat ou deux medias partagent un rang. Transmettre
   * seulement les deux medias echanges serait refuse.
   */
  function deplacer(index: number, sens: -1 | 1) {
    const cible = index + sens;
    if (cible < 0 || cible >= medias.length) {
      return;
    }

    /*
     * L'ECHANGE PASSE PAR `map` ET NON PAR UNE DESTRUCTURATION INDEXEE.
     * `noUncheckedIndexedAccess` rend `ids[index]` de type `string | undefined`,
     * et la forme `[a[i], a[j]] = [a[j], a[i]]` ne compile donc pas. La borne a
     * deja ete verifiee juste au-dessus, mais le type ne le sait pas.
     */
    const ids = medias.map((media, rang) => {
      if (rang === index) {
        return medias[cible]!.id;
      }
      if (rang === cible) {
        return medias[index]!.id;
      }
      return media.id;
    });

    jouer(
      () => reordonnerMediasAction(produitId, ids),
      "Ordre des photos enregistré.",
    );
  }

  return (
    <section className={styles.editeur} aria-labelledby="titre-medias">
      <h2 className={styles.sousTitre} id="titre-medias">
        Photos de la fiche
      </h2>

      {/*
       * L'AVERTISSEMENT SUR LES METADONNEES EST DIT A L'EXPLOITANTE, et ce
       * n'est pas de la decoration : c'est la raison d'etre du traitement,
       * `PARCOURS.md`. Elle doit savoir que ses photos de telephone sont
       * nettoyees, sans quoi elle pourrait chercher a le faire elle-meme, ou
       * s'inquieter de publier des originaux.
       */}
      <p className={styles.aide}>
        Chaque photo est traitée avant publication : ses métadonnées sont
        retirées, dont la position GPS enregistrée par les téléphones. La
        première photo de la liste est celle qui apparaît dans la boutique.
      </p>

      <div className={styles.carte}>
        <div className={styles.champ}>
          <label className={styles.label} htmlFor="fichier-media">
            Ajouter une photo
          </label>
          <input
            id="fichier-media"
            ref={champFichier}
            className={styles.saisie}
            type="file"
            /*
             * `accept` EST UN CONFORT DE SELECTION, PAS UN CONTROLE. Il filtre
             * ce que propose le selecteur du systeme, et un fichier choisi
             * autrement le traverse sans effort. Le refus reel se fait cote
             * serveur sur la signature du fichier, invariant 7.
             */
            accept="image/*"
            /*
             * L'AIDE EST LIEE AU CHAMP, comme sur les champs de prix et de
             * reference des variantes. Sans ce lien, qui navigue au lecteur
             * d'ecran entend « Ajouter une photo, selecteur de fichier » sans
             * jamais les formats ni la limite, et se le voit refuser APRES avoir
             * choisi un fichier de 40 Mo.
             */
            aria-describedby="aide-fichier-media"
            disabled={enCours}
            onChange={(evenement) => {
              const fichier = evenement.target.files?.[0];
              oublierSucces();
              if (fichier) {
                televerser(fichier);
              }
            }}
          />
          <p className={styles.aide} id="aide-fichier-media">
            JPEG, PNG, HEIC, WebP ou AVIF, 25 Mo au maximum. Le traitement prend
            quelques secondes.
          </p>
        </div>

        {/*
         * LA REGION D'ANNONCE EST MONTEE EN PERMANENCE, VIDE, LS-85. Un element
         * `role="status"` insere APRES COUP n'est pas toujours annonce : le
         * lecteur d'ecran surveille une region qui existe deja. Le rendre sous
         * `{enCours && ...}` etait donc le defaut precis que cette annonce
         * existe pour eviter, et sur le pire endroit : deux secondes d'attente,
         * mesurees a ADR-007, sans aucun retour.
         *
         * `.aide:empty` la fait disparaitre visuellement quand elle est vide,
         * comme `.erreur` et `.succes` juste en dessous.
         */}
        <p className={styles.aide} role="status" aria-live="polite">
          {enCours ? "Traitement en cours…" : ""}
        </p>
      </div>

      <p className={styles.erreur} role="alert">
        {erreur ?? ""}
      </p>
      <p className={styles.succes} role="status">
        {succes ?? ""}
      </p>

      {medias.length === 0 ? (
        <p className={styles.vide}>
          Aucune photo pour l&apos;instant. La publication de la fiche en
          demandera au moins une.
        </p>
      ) : (
        <ul className={styles.liste}>
          {medias.map((media, index) => {
            const statut = STATUT_AFFICHE[media.statutTraitement];
            const texte = textes[media.id] ?? media.texteAlternatif ?? "";

            return (
              <li key={media.id} className={styles.carte}>
                <div className={styles.enTeteVariante}>
                  {/*
                   * UN `h3` ET NON UN `span`, comme la carte de variante. Cette
                   * liste est la plus longue de l'ecran, quatre boutons et un
                   * champ par photo : sans titre, aller de la troisieme a la
                   * septieme au lecteur d'ecran oblige a traverser tout le
                   * contenu intermediaire.
                   */}
                  <h3 className={styles.referenceVariante}>
                    {index === 0 ? "Photo principale" : `Photo ${index + 1}`}
                  </h3>
                  <span className={styles.marqueur}>{statut.libelle}</span>
                  {/*
                   * LE MANQUE DE DESCRIPTION SE VOIT ICI, ET NON A LA
                   * PUBLICATION. C7 l'exigera au moment de publier, LS-103, sur
                   * un AUTRE ecran : sans ce marqueur, l'exploitante qui a
                   * televerse cinq photos et en a decrit deux decouvrirait le
                   * refus sans savoir lesquelles reprendre.
                   *
                   * IL LIT `media.texteAlternatif` ET NON LA SAISIE EN COURS :
                   * ce qui compte est ce qui est ENREGISTRE. Le marqueur
                   * disparait donc a l'enregistrement, pas a la frappe.
                   */}
                  {media.texteAlternatif === null && (
                    <span className={styles.marqueurManquant}>
                      Description à écrire
                    </span>
                  )}
                </div>

                <p className={styles.aide}>{statut.explication}</p>

                {/*
                 * LA VIGNETTE N'APPARAIT QUE POUR UN MEDIA TRAITE, et c'est une
                 * consequence physique plutot qu'un filtre : un media en attente
                 * ou en echec n'a AUCUN fichier sous `public/`, C8 et ADR-007.
                 * Il n'y a donc rien a montrer, et rien a masquer.
                 *
                 * `<img>` ET NON `next/image`. Ces fichiers sont servis par
                 * Nginx depuis un volume, hors de la portee de l'optimiseur de
                 * Next.js : lui passer cette URL le ferait retelecharger et
                 * reencoder une image DEJA declinee en onze variantes, pour
                 * l'ecran d'administration seulement.
                 *
                 * L'ATTRIBUT `alt` PORTE LE TEXTE ENREGISTRE, jamais celui en
                 * cours de saisie : ce qui est affiche doit refleter la base.
                 * Vide tant qu'aucun texte n'existe, l'image etant alors
                 * decorative pour un lecteur d'ecran, l'information utile
                 * etant deja dans le libelle de la carte.
                 *
                 * AUCUN `width` NI `height`, ET C'EST DELIBERE. Une premiere
                 * version declarait 320 par 320, faux dans les DEUX dimensions :
                 * le fichier servi est la declinaison 640, et le traitement ne
                 * contraint QUE la largeur, `resize({ width })`, la hauteur
                 * suivant le ratio de la source. Le ratio reel n'est donc pas
                 * connu de ce composant, et le declarer faux produit un decalage
                 * de mise en page au chargement de chaque vignette, sur un ecran
                 * qui en empile plusieurs.
                 *
                 * La place est reservee par le CSS : `.vignette` borne la
                 * hauteur a 12 rem, ce qui suffit a stabiliser la carte sans
                 * affirmer un ratio que le fichier ne respecte pas.
                 */}
                {media.statutTraitement === "TRAITE" && media.vignette && (
                  // eslint-disable-next-line @next/next/no-img-element -- fichiers servis par Nginx depuis un volume, hors de la portee de l'optimiseur de Next.js, voir le commentaire ci-dessus
                  <img
                    className={styles.vignette}
                    src={media.vignette}
                    alt={media.texteAlternatif ?? ""}
                    loading="lazy"
                  />
                )}

                <div className={styles.champ}>
                  <label
                    className={styles.label}
                    htmlFor={`texte-${media.id}`}
                  >
                    Description de la photo
                  </label>
                  <input
                    id={`texte-${media.id}`}
                    className={styles.saisie}
                    type="text"
                    maxLength={200}
                    value={texte}
                    aria-describedby={`aide-texte-${media.id}`}
                    disabled={enCours}
                    onChange={(evenement) => {
                      oublierSucces();
                      setTextes((precedents) => ({
                        ...precedents,
                        [media.id]: evenement.target.value,
                      }));
                    }}
                  />
                  <p className={styles.aide} id={`aide-texte-${media.id}`}>
                    Décrit la photo à qui ne la voit pas. Exigée avant de
                    publier la fiche.
                  </p>
                </div>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.boutonSecondaire}
                    disabled={enCours}
                    onClick={() =>
                      jouer(
                        () =>
                          ecrireTexteAlternatifAction(
                            produitId,
                            media.id,
                            texte,
                          ),
                        "Description enregistrée.",
                      )
                    }
                  >
                    Enregistrer la description
                  </button>

                  {/*
                   * LES DEUX BOUTONS D'ORDRE PORTENT UN LIBELLE EXPLICITE, et
                   * non une fleche seule : « Monter » sur la deuxieme photo
                   * signifie « devenir la photo principale », ce qu'aucune
                   * icone ne dit. Le premier et le dernier voient le leur
                   * desactive plutot que masque, pour que la position des
                   * commandes ne bouge pas d'une carte a l'autre.
                   */}
                  <button
                    type="button"
                    className={styles.boutonSecondaire}
                    disabled={enCours || index === 0}
                    onClick={() => {
                      oublierSucces();
                      deplacer(index, -1);
                    }}
                  >
                    Monter
                  </button>
                  <button
                    type="button"
                    className={styles.boutonSecondaire}
                    disabled={enCours || index === medias.length - 1}
                    onClick={() => {
                      oublierSucces();
                      deplacer(index, 1);
                    }}
                  >
                    Descendre
                  </button>

                  <button
                    type="button"
                    className={styles.boutonDanger}
                    disabled={enCours}
                    onClick={(evenement) =>
                      demanderSuppression(media.id, evenement.currentTarget)
                    }
                  >
                    Supprimer
                  </button>
                </div>

                {aSupprimer === media.id && (
                  <div
                    className={styles.confirmation}
                    role="alertdialog"
                    aria-labelledby={`confirmation-titre-${media.id}`}
                    aria-describedby={`confirmation-texte-${media.id}`}
                    ref={panneau}
                    tabIndex={-1}
                    onKeyDown={(evenement) => {
                      if (evenement.key === "Escape") {
                        setASupprimer(null);
                      }
                    }}
                  >
                    <p
                      className={styles.confirmationTitre}
                      id={`confirmation-titre-${media.id}`}
                    >
                      Supprimer cette photo ?
                    </p>
                    <p
                      className={styles.confirmationTexte}
                      id={`confirmation-texte-${media.id}`}
                    >
                      {index === 0 && medias.length > 1
                        ? "C'est la photo principale : la suivante prendra sa place dans la boutique. Le fichier est supprimé définitivement."
                        : "Le fichier est supprimé définitivement. Il faudra le téléverser à nouveau pour le retrouver."}
                    </p>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.boutonDanger}
                        disabled={enCours}
                        onClick={() =>
                          jouer(
                            () => supprimerMediaAction(produitId, media.id),
                            "Photo supprimée.",
                            () => setASupprimer(null),
                          )
                        }
                      >
                        Supprimer la photo
                      </button>
                      <button
                        type="button"
                        className={styles.boutonSecondaire}
                        disabled={enCours}
                        onClick={() => setASupprimer(null)}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
