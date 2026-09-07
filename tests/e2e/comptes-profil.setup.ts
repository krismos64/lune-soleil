/**
 * Amorce les six comptes de `compte-profil.spec.ts`, LS-168.
 *
 * POURQUOI UNE PREPARATION ET NON UNE INSCRIPTION DANS LE FICHIER DE TEST.
 * `compte-profil` a besoin d'un compte PAR LARGEUR, et de deux : un pour les
 * six tests ordinaires, un dedie au test qui consomme le mot de passe. Six
 * comptes, donc six inscriptions au tout premier passage.
 *
 * LES TROIS LARGEURS TOURNENT EN PARALLELE, dans trois processus distincts :
 * inscrire depuis le fichier de test envoie les six appels dans la meme
 * seconde, et `/sign-up/email` en accepte TROIS par minute et par IP. Mesure du
 * 7 septembre 2026 sur base neuve : « Too many requests », trois echecs.
 *
 * ICI, LE PROJET `preparation` EST SEQUENTIEL ET UNIQUE. C'est le seul endroit
 * du dispositif ou six inscriptions peuvent etre espacees sans multiplier
 * l'attente par trois.
 *
 * ------------------------------------------------------------------
 * L'ATTENTE N'A LIEU QUE SUR UNE BASE NEUVE, et c'est ce qui la distingue du
 * reessai espace que LS-168 supprime par ailleurs.
 *
 * Un reessai attend APRES avoir echoue, a chaque execution, sans jamais
 * supprimer la cause. Celle-ci attend AVANT de depasser, une seule fois dans la
 * vie de la base : des que les six comptes existent, les paliers de connexion
 * prennent le relais et plus aucune inscription n'a lieu.
 *
 * EN REGIME ETABLI CE FICHIER NE FAIT RIEN, ni inscription ni attente : il
 * constate que les six comptes repondent et rend la main en quelques secondes.
 * ------------------------------------------------------------------
 *
 * IL N'OUVRE AUCUNE SESSION ET N'ECRIT AUCUN ETAT. `compte-profil` ouvre la
 * sienne dans son `beforeAll`, ayant besoin des cookies EN MEMOIRE pour les
 * rejouer test par test. Ce fichier ne fait qu'une chose : garantir que les
 * comptes existent.
 */
import "dotenv/config";

import { expect, test as preparation } from "@playwright/test";

import {
  MOT_DE_PASSE_PROFIL,
  PROJETS_LARGEUR,
  adresseMotDePasseProfil,
  adresseProfil,
} from "./chemin-session";

/**
 * L'attente entre deux inscriptions, quand il faut inscrire.
 *
 * LA FENETRE DU PLAFOND DURE SOIXANTE SECONDES pour trois appels. Vingt-et-une
 * secondes entre deux inscriptions tiennent donc sous la limite avec une marge,
 * sans jamais l'atteindre.
 */
const ESPACEMENT_MS = 21_000;

/*
 * SIX INSCRIPTIONS ESPACEES FONT DEUX MINUTES DANS LE PIRE CAS, celui de la
 * base neuve. Le delai par defaut de trente secondes ne les couvrirait pas.
 */
preparation.setTimeout(300_000);

preparation("amorcer les comptes du profil", async ({ page }) => {
  const adresses = PROJETS_LARGEUR.flatMap((projet) => [
    adresseProfil(projet),
    adresseMotDePasseProfil(projet),
  ]);

  let inscriptions = 0;

  for (const email of adresses) {
    /*
     * PALIER 1 : LE COMPTE REPOND-IL DEJA ?
     *
     * `/sign-in/email` accepte CINQ appels par minute, et compte separement des
     * trois de l'inscription : six connexions depassent ce plafond, d'ou le
     * `sleep` du cas d'echec plus bas. En regime etabli elles reussissent
     * toutes, et la boucle ne fait que constater.
     */
    const connexion = await page.request.post("/api/auth/sign-in/email", {
      data: { email, password: MOT_DE_PASSE_PROFIL },
    });

    if (connexion.ok()) {
      continue;
    }

    /*
     * PALIER 2 : L'INSCRIRE, EN ESPACANT A PARTIR DE LA DEUXIEME.
     *
     * L'ATTENTE EST POSEE AVANT ET NON APRES : attendre apres la derniere
     * inscription ferait perdre vingt-et-une secondes pour rien, la suite
     * n'ayant plus rien a inscrire.
     */
    if (inscriptions > 0) {
      await page.waitForTimeout(ESPACEMENT_MS);
    }

    const inscription = await page.request.post("/api/auth/sign-up/email", {
      data: { email, password: MOT_DE_PASSE_PROFIL, name: "Client profil" },
    });

    // ECHOUER ICI PLUTOT QUE DANS CHAQUE TEST : la vraie cause arrive en tete
    // de rapport, au lieu de « le formulaire est introuvable » a chaque largeur.
    expect(inscription.ok(), await inscription.text()).toBe(true);

    inscriptions += 1;
  }
});
