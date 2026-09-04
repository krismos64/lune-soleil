/**
 * Gabarit de l'espace client, LS-180.
 *
 * IL EXISTE POUR PORTER LA BARRE LATERALE, absente jusqu'ici : les stories
 * LS-54 a LS-62 ont livre les ecrans un par un, chacun se suffisant, et
 * `/compte` etait devenue un SOMMAIRE de six sections renvoyant chacune vers
 * son ecran. Circuler des commandes vers les adresses demandait donc deux
 * navigations en repassant par le sommaire.
 *
 * IL N'AUTORISE RIEN, ET C'EST DELIBERE. Chaque page appelle deja
 * `exigerSession` avant de rendre quoi que ce soit, et c'est LA protection : un
 * layout ne doit surtout pas devenir le seul endroit ou elle vit. Deux raisons,
 * et la seconde est la vraie.
 *
 * D'abord, un layout ne se re-rend pas a chaque navigation, verifie via
 * Context7 sur la documentation de l'App Router : y placer une garde la ferait
 * s'executer moins souvent que les pages qu'elle pretend proteger.
 *
 * Ensuite et surtout, une Server Action n'est PAS rendue par un layout. Une
 * garde qui vivrait ici laisserait toutes les actions du carnet d'adresses et
 * du profil ouvertes a un appel HTTP direct, alors que l'ecran paraitrait
 * protege.
 *
 * CE QU'IL FAIT DE LA SESSION, IL NE S'EN SERT QUE POUR AFFICHER.
 * `lireIdentite` ne leve pas et rend `null` sans session : la barre disparait
 * alors. C'est ce qui laisse intacts les QUATRE ECRANS QUI S'OUVRENT SANS
 * SESSION, `/compte/connexion`, `/compte/inscription`,
 * `/compte/mot-de-passe-oublie` et `/compte/nouveau-mot-de-passe` : ils vivent
 * sous ce chemin, mais on n'y est justement pas connecte, et leur proposer cinq
 * liens vers des ecrans proteges n'aurait aucun sens.
 *
 * LE COMPTE A ETE VERIFIE ROUTE PAR ROUTE, pas ecrit de memoire. Une premiere
 * version annonçait « les SEPT ECRANS D'AUTHENTIFICATION » puis en enumerait
 * six, dont `/compte/verification` qui appelle au contraire `exigerSession` et
 * porte donc la barre. Motif « un compte recopie n'est pas une mesure », et il
 * ne coute rien ici puisque le layout ne decide de rien : c'est la SESSION qui
 * tranche, ecran par ecran, et non cette liste.
 *
 * `/compte/reauthentification` EST LE CAS QUI SE LIT MAL. Son nom le range avec
 * l'authentification, mais on y arrive AVEC une session, pour prouver son
 * identite avant un geste sensible : la barre y est donc presente, et c'est
 * juste.
 *
 * POURQUOI PAS UN GROUPE DE ROUTES POUR LES EXCLURE. C'est la voie que la
 * documentation de Next.js decrit pour « opting specific segments into a
 * layout », et elle serait juste sur un depot neuf. Ici elle deplacerait
 * DIX-NEUF fichiers et changerait les chemins de sept ecrans cites nommement
 * dans les tests, les emails de Better Auth et les redirections : un
 * remaniement de cette taille pour une story de RENDU, qui « ne change aucun
 * comportement » selon sa propre description. La session dit deja exactement ce
 * qu'il faut savoir, et `/compte/reauthentification` le montre : on y arrive
 * AVEC une session, la barre y est donc legitime.
 *
 * PAS DE ROLE EXIGE ICI, a la difference de `/administration`. Cet espace sert
 * les CLIENTS, et l'administratrice est aussi titulaire d'un compte : les deux
 * populations y accedent, chacune ne voyant que ses propres donnees.
 */
import { headers } from "next/headers";

import { NavigationEspaceClient } from "@/components/navigation-espace-client";
import { lireIdentite } from "@/services/autorisation";
import { lireEntete } from "@/services/espace-client";

import { BoutonDeconnexion } from "./bouton-deconnexion";
import styles from "./layout.module.css";

export default async function LayoutEspaceClient({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const identite = await lireIdentite(await headers());

  if (!identite) {
    return <>{children}</>;
  }

  const entete = await lireEntete(identite.utilisateurId, identite.email);

  /*
   * COMPTE INTROUVABLE : LE GABARIT S'EFFACE PLUTOT QUE D'INVENTER UN NOM.
   *
   * Le cas ne devrait pas se produire, l'identite venant d'une session valide,
   * mais le SENS du repli compte. Rendre la barre avec un nom vide ou un « ? »
   * masquerait l'anomalie derriere un affichage plausible ; sans barre, l'ecran
   * ressemble a ce qu'il etait avant cette story, ce qui reste utilisable et se
   * remarque.
   */
  if (!entete) {
    return <>{children}</>;
  }

  return (
    <div className={styles.gabarit}>
      <NavigationEspaceClient
        nomAffiche={entete.nomAffiche}
        initiales={entete.initiales}
        emailVerifie={entete.emailVerifie}
        deconnexion={<BoutonDeconnexion />}
      />

      {/*
       * LA COLONNE DE CONTENU N'EST PAS UN `main`, ET C'EST IMPORTANT.
       *
       * Chaque page porte deja son propre `<main id="contenu" tabIndex={-1}>`,
       * qui est LA CIBLE DU LIEN D'EVITEMENT de l'en-tete de boutique. En poser
       * un second ici donnerait deux reperes `main` au document : un lecteur
       * d'ecran les annoncerait tous les deux, et le lien d'evitement
       * deviendrait ambigu. Le motif est en fiche sur ce depot, « cible du lien
       * d'evitement ».
       *
       * C'est aussi ce qui protege les tests ancres sur `getByRole("main")`.
       */}
      <div className={styles.colonne}>{children}</div>
    </div>
  );
}
