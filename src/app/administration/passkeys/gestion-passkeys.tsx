"use client";

/**
 * Enregistrement et retrait des passkeys, LS-175, ADR-021.
 *
 * COMPOSANT CLIENT PAR NECESSITE, jamais par confort : `addPasskey` passe par
 * `navigator.credentials`, l'API WebAuthn du navigateur, qui n'existe pas cote
 * serveur. C'est la meme raison qui rend clients l'ecran de connexion et celui
 * de reauthentification.
 *
 * LE CLIENT ET LE SERVEUR NE NOMMENT PAS LA MEME CHOSE PAREIL, piege mesure le
 * 10 septembre 2026 : le client expose `listUserPasskeys`, quand l'endpoint
 * serveur du meme paquet s'appelle `listPasskeys` sur
 * `/passkey/list-user-passkeys`. Lire les types SERVEUR pour ecrire du code
 * CLIENT a produit `listPasskeys`, que `tsc` a rejete.
 *
 * La lecon n'est pas « lire les types plutot que la doc », les deux disaient
 * vrai de leur cote : c'est verifier les types DU COTE ou l'appel est ecrit.
 *
 * CE COMPOSANT N'ACCORDE AUCUN DROIT. La page serveur a deja exige le role
 * avant de le rendre, et chaque appel est verifie cote serveur contre la
 * session : un composant client ne protege rien, invariant 2.
 */
import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import type { PasskeyAffichable } from "@/services/passkeys";

import styles from "./passkeys.module.css";

type Etat = "repos" | "en-cours" | "erreur";

/**
 * Un nom par defaut tire de l'appareil, jamais vide.
 *
 * ADR-021 veut « MacBook » ou « iPhone » pour que l'exploitante reconnaisse ses
 * appareils dans la liste. Sans nom, Better Auth retombe sur l'email, ce qui
 * rend deux passkeys du meme compte INDISCERNABLES : retirer celle du telephone
 * perdu deviendrait un tirage au sort.
 */
function nomParDefaut(): string {
  if (typeof navigator === "undefined") return "Cet appareil";
  const agent = navigator.userAgent;
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent)) return "iPad";
  if (/Macintosh/.test(agent)) return "Mac";
  if (/Android/.test(agent)) return "Téléphone Android";
  if (/Windows/.test(agent)) return "Ordinateur Windows";
  return "Cet appareil";
}

export function GestionPasskeys({
  passkeys,
}: {
  passkeys: PasskeyAffichable[];
}) {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>("repos");
  const [message, setMessage] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  /*
   * LA CONFIRMATION EST EN LIGNE ET NON UN `window.confirm`.
   *
   * Une boite modale du navigateur bloque tous les evenements de la page le
   * temps qu'elle est ouverte, ce qui la rend intestable par Playwright sans
   * traitement special et fige la page si rien ne la ferme. Une confirmation
   * rendue dans le DOM se teste comme le reste de l'ecran et s'annonce aux
   * lecteurs d'ecran.
   */
  const [aRetirer, setARetirer] = useState<PasskeyAffichable | null>(null);

  /*
   * LE FOCUS SE DEPLACE A LA MAIN, parce que les elements qui le portaient sont
   * DEMONTES par le ternaire de la liste.
   *
   * Ouvrir la confirmation retire le bouton « Retirer » du DOM : le focus
   * retombe alors sur `body` et la tabulation suivante repart du HAUT de la
   * page. L'annuler fait l'inverse. C'est le motif « focus sur un element
   * detache » deja rencontre ici, declenche cette fois par un ternaire et non
   * par `revalidatePath`.
   *
   * `role="alert"` NE SUFFIT PAS : un noeud insere en portant deja ce role est
   * annonce de facon inegale selon les moteurs, une region live devant exister
   * AVANT que son contenu change. Deplacer le focus rend l'annonce fiable et
   * remet la personne au clavier devant le choix qu'elle vient d'ouvrir.
   */
  const confirmationRef = useRef<HTMLDivElement | null>(null);
  const boutonsRetraitRef = useRef(new Map<string, HTMLButtonElement>());
  const retourAuRetrait = useRef<string | null>(null);

  useEffect(() => {
    if (aRetirer) {
      confirmationRef.current?.focus();
      return;
    }
    /*
     * AU RETOUR, LE FOCUS REVIENT SUR LE BOUTON D'ORIGINE, et seulement si
     * l'annulation vient de la personne : apres un retrait REUSSI ce bouton
     * n'existe plus, la ligne entiere ayant disparu.
     */
    const cible = retourAuRetrait.current;
    retourAuRetrait.current = null;
    if (cible) boutonsRetraitRef.current.get(cible)?.focus();
  }, [aRetirer]);

  const enregistrer = async () => {
    setEtat("en-cours");
    setMessage(null);

    const resultat = await authClient.passkey.addPasskey({
      name: nom.trim() || nomParDefaut(),
    });

    /*
     * UN SEUL MESSAGE POUR TOUTES LES CAUSES, et le message INVITE A REESSAYER.
     *
     * Le type d'erreur de Better Auth ne porte pas `name` : distinguer une
     * annulation WebAuthn (`NotAllowedError`, la feuille Face ID fermee) d'une
     * panne reseau demanderait de lire un champ qui n'existe pas, ce que `tsc` a
     * refuse. Le distinguo n'est de toute facon PAS souhaitable ici : l'ecran de
     * connexion tient un message unique pour ne rien confirmer a un attaquant,
     * et le meme raisonnement vaut sur une route d'administration.
     *
     * Le libelle est donc ecrit pour le cas LE PLUS FREQUENT, qui est
     * l'annulation : dire « échec » a quelqu'un qui a simplement change d'avis
     * ferait croire l'appareil incompatible et decouragerait un second essai.
     */
    if (resultat?.error) {
      setEtat("erreur");
      setMessage(
        "L'enregistrement n'a pas abouti. Si vous avez fermé la demande de votre appareil, vous pouvez recommencer.",
      );
      return;
    }

    setNom("");
    setEtat("repos");
    setMessage(
      "Passkey enregistrée. Testez-la en vous déconnectant puis en vous reconnectant.",
    );
    router.refresh();
  };

  const retirer = async (id: string) => {
    setEtat("en-cours");
    setMessage(null);

    const { error } = await authClient.passkey.deletePasskey({ id });
    setARetirer(null);

    if (error) {
      setEtat("erreur");
      setMessage("Cette passkey n'a pas pu être retirée.");
      return;
    }

    setEtat("repos");
    setMessage("Passkey retirée.");
    router.refresh();
  };

  const formaterDate = (valeur: Date) => {
    /*
     * `Europe/Paris` EXPLICITE, jamais l'heure du serveur ni celle du
     * navigateur laissee au hasard : les horodatages sont persistes en UTC et
     * convertis a l'affichage seulement, invariant 8.
     */
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeZone: "Europe/Paris",
    }).format(new Date(valeur));
  };

  return (
    <div className={styles.conteneur}>
      <section className={styles.section}>
        <h2 className={styles.titreSection}>Enregistrer une passkey</h2>

        <div className={styles.champ}>
          <label htmlFor="nom-passkey">Nom de l&apos;appareil</label>
          <input
            id="nom-passkey"
            type="text"
            className={styles.saisie}
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
            placeholder={nomParDefaut()}
            maxLength={60}
            autoComplete="off"
          />
          <p className={styles.aide}>
            Pour reconnaître cet appareil dans la liste. Laissé vide, il sera
            nommé «&nbsp;{nomParDefaut()}&nbsp;».
          </p>
        </div>

        <button
          type="button"
          className={styles.boutonPrincipal}
          onClick={enregistrer}
          disabled={etat === "en-cours"}
        >
          {etat === "en-cours"
            ? "Enregistrement en cours…"
            : "Enregistrer cet appareil"}
        </button>
      </section>

      {/*
       * `role="status"` ET NON un simple paragraphe : un lecteur d'ecran doit
       * annoncer le resultat, qui apparait loin du bouton actionne.
       */}
      {message ? (
        <p
          className={etat === "erreur" ? styles.erreur : styles.succes}
          role={etat === "erreur" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}

      <section className={styles.section}>
        <h2 className={styles.titreSection}>Vos passkeys enregistrées</h2>

        {passkeys.length === 0 ? (
          <p className={styles.aide}>
            Aucune passkey enregistrée. Vous vous connectez par mot de passe
            tant qu&apos;aucune n&apos;est en place.
          </p>
        ) : (
          <ul className={styles.liste}>
            {passkeys.map((passkey) => {
              const libelle = passkey.nom?.trim() || "Appareil sans nom";
              const date = formaterDate(passkey.creeA);
              const enConfirmation = aRetirer?.id === passkey.id;

              return (
                <li key={passkey.id} className={styles.element}>
                  <div className={styles.description}>
                    <span className={styles.nom}>{libelle}</span>
                    {date ? (
                      <span className={styles.date}>Ajoutée le {date}</span>
                    ) : null}
                  </div>

                  {enConfirmation ? (
                    /*
                     * RETIRER LA DERNIERE PASSKEY EST PERMIS, et prevenu plutot
                     * que bloque. Le mot de passe reste le chemin de secours
                     * d'ADR-021, donc l'acces n'est pas perdu. Interdire le
                     * retrait enfermerait l'exploitante avec la passkey d'un
                     * appareil vole, ce qui serait pire.
                     */
                    <div
                      ref={confirmationRef}
                      className={styles.confirmation}
                      role="alert"
                      tabIndex={-1}
                    >
                      <p className={styles.questionRetrait}>
                        {passkeys.length === 1
                          ? "Retirer votre dernière passkey ? Vous devrez vous connecter par mot de passe."
                          : `Retirer « ${libelle} » ?`}
                      </p>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.boutonRetrait}
                          onClick={() => retirer(passkey.id)}
                          disabled={etat === "en-cours"}
                        >
                          Confirmer le retrait
                        </button>
                        <button
                          type="button"
                          className={styles.boutonSecondaire}
                          onClick={() => {
                            retourAuRetrait.current = passkey.id;
                            setARetirer(null);
                          }}
                          disabled={etat === "en-cours"}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      ref={(element) => {
                        if (element) {
                          boutonsRetraitRef.current.set(passkey.id, element);
                        } else {
                          boutonsRetraitRef.current.delete(passkey.id);
                        }
                      }}
                      className={styles.boutonRetrait}
                      onClick={() => setARetirer(passkey)}
                      disabled={etat === "en-cours"}
                    >
                      Retirer
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
