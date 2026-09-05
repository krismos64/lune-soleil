/**
 * Lectures et ecritures du compte utilisateur, LS-158.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service
 * appelant lui passe le client, et c'est lui qui juge. Ces requetes vivaient
 * dans `services/utilisateur.ts` et `services/suppression-compte.ts`, seuls
 * acces directs a Prisma hors des services de socle : rapatriees ici pour que
 * la frontiere des couches reste vraie, arbitrage de LS-158.
 *
 * AUCUNE FONCTION N'ECRIT `role`, regle E11 : ce champ ne se pose ni depuis un
 * formulaire ni depuis ce fichier, et `ecrireProfil` n'accepte que les
 * champs que son type enumere.
 */
import type { ClientBase } from "@/repositories/stock";

/**
 * Met a jour les champs de profil fournis, et eux seuls.
 *
 * Le type ferme la porte : ajouter un champ ici est un geste visible en revue,
 * quand un `data` libre laisserait passer `role` sans bruit.
 */
export async function ecrireProfil(
  client: ClientBase,
  utilisateurId: string,
  champs: { nom?: string },
): Promise<void> {
  await client.utilisateur.update({
    where: { id: utilisateurId },
    data: champs,
  });
}

/**
 * L'etat de verification de l'adresse, LS-54.
 *
 * LECTURE DEDIEE PLUTOT QU'UN CHAMP AJOUTE A `IdentiteAppelant`. Ce type est
 * volontairement reduit a ce dont une decision d'AUTORISATION a besoin, et son
 * fichier le dit : « une vue qui les veut les relit, ce qui evite qu'un champ
 * d'affichage se retrouve a fonder une autorisation ».
 *
 * Le distinguo compte ici plus qu'ailleurs : la verification d'adresse ne
 * conditionne AUCUN acces, arbitrage du 2 septembre 2026. La porter dans
 * l'identite inviterait tot ou tard a l'y employer.
 */
export async function lireEtatVerification(
  client: ClientBase,
  utilisateurId: string,
): Promise<boolean> {
  const utilisateur = await client.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { emailVerifie: true },
  });

  /*
   * DEFAUT « NON VERIFIE » quand le compte est introuvable. Le cas ne devrait
   * pas se produire, l'identite venant d'une session valide, mais le sens du
   * repli n'est pas neutre : « verifie » ferait disparaitre le rappel a
   * l'ecran, donc masquerait l'anomalie au lieu de la montrer.
   */
  return utilisateur?.emailVerifie ?? false;
}

/**
 * Ce que le GABARIT de l'espace client affiche en tete de barre, LS-180.
 *
 * UNE SEULE REQUETE POUR DEUX CHAMPS, ET C'EST LA RAISON D'ETRE DE CETTE
 * FONCTION. Le layout a besoin du nom, pour la pastille d'initiales et la
 * salutation, ET de l'etat de verification, pour la mention sous le nom.
 * Composer `lireEtatVerification` avec une seconde lecture ferait DEUX allers
 * vers la base a chaque rendu de page de l'espace client, sur toutes les
 * navigations, pour deux colonnes de la meme ligne.
 *
 * `lireEtatVerification` RESTE, ET N'EST PAS REMPLACEE : la page `/compte`
 * l'appelle pour son rappel de verification, et elle seule. Les deux fonctions
 * lisent la meme colonne sans se recouvrir, l'une pour une decision d'affichage
 * ponctuelle, l'autre pour l'en-tete permanent.
 *
 * LE NOM PEUT ETRE VIDE, et ce n'est pas une anomalie : `nom` est facultatif au
 * compte, l'inscription ne le demandant pas. L'appelant decide quoi montrer a
 * sa place, ce fichier ne tranche pas un affichage.
 */
export async function lireEnteteEspaceClient(
  client: ClientBase,
  utilisateurId: string,
): Promise<{ nom: string | null; emailVerifie: boolean } | null> {
  return client.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: { nom: true, emailVerifie: true },
  });
}

/**
 * Le compte pour l'export RGPD : identite et nombres de moyens de connexion.
 *
 * LES VALEURS NE SORTENT PAS, seul leur nombre : `_count` compte les comptes
 * et les passkeys sans jamais charger l'empreinte ni la cle publique.
 */
export async function lireCompteExport(
  client: ClientBase,
  utilisateurId: string,
) {
  return client.utilisateur.findUnique({
    where: { id: utilisateurId },
    select: {
      email: true,
      nom: true,
      emailVerifie: true,
      creeA: true,
      _count: { select: { comptes: true, passkeys: true } },
    },
  });
}

/**
 * Les quatre volets de l'export RGPD d'une personne.
 *
 * L'INSTANTANE LEGAL DE LA COMMANDE EST INCLUS : c'est bien une donnee
 * personnelle de la personne, adresses figees comprises, et elle a le droit
 * d'en recevoir copie meme si le document ne s'efface pas.
 */
export async function lireDonneesExport(
  client: ClientBase,
  utilisateurId: string,
) {
  const [adresses, commandes, avis, connexions] = await Promise.all([
    client.adresseCarnet.findMany({ where: { utilisateurId } }),
    client.commande.findMany({
      where: { utilisateurId },
      include: { lignes: true },
    }),
    client.avis.findMany({ where: { utilisateurId } }),
    client.journalConnexion.findMany({
      where: { utilisateurId },
      orderBy: { creeA: "desc" },
    }),
  ]);

  return { adresses, commandes, avis, connexions };
}

/**
 * Un client dans la liste de l'administration, LS-185.
 *
 * CE QUE CHAQUE CHAMP FAIT ICI, ET AU NOM DE QUELLE FINALITE. L'arbitrage du
 * 5 septembre 2026 en retient trois, et le registre les porte en T11 :
 *
 *   nom, email, date d'inscription   repondre a une demande RGPD, et retrouver
 *                                    un acheteur qui contacte la boutique
 *   nombre et montant des commandes  suivre l'activite commerciale, interet
 *                                    legitime et non execution du contrat
 *   derniere connexion reussie       retrouver un acheteur, et constater qu'un
 *                                    compte est inactif
 *   nombre d'adresses                savoir si le carnet est renseigne, sans
 *                                    lire son contenu
 *
 * LE TELEPHONE ET LE CONTENU DES ADRESSES N'EN SONT PAS, et la premiere version
 * de ce commentaire les annonçait tous deux alors que rien ne les lit. Le
 * registre les declarait aussi, corrige le 5 septembre 2026 : un registre qui
 * sur-declare est aussi faux qu'un registre qui sous-declare. Les ajouter un
 * jour demande d'ecrire leur finalite d'abord, dans T11.
 *
 * AUCUN CHAMP N'EST LA « PARCE QU'IL EST EN BASE ». La minimisation, article
 * 5.1.c, veut qu'une donnee affichee serve une finalite nommee : le mot de
 * passe, l'empreinte de passkey et l'adresse IP des connexions ne sortent
 * jamais d'ici, et rien ne les demande.
 */
export type ClientEnListe = {
  id: string;
  email: string;
  nom: string | null;
  emailVerifie: boolean;
  creeA: Date;
  /** Nombre de commandes rattachees au compte, T11 finalite 3. */
  nombreCommandes: number;
  /** Somme des commandes rattachees, en centimes entiers, T11 finalite 3. */
  totalCentimes: number;
  /** Nombre d'adresses au carnet, sans leur contenu : la liste ne l'affiche pas. */
  nombreAdresses: number;
  /** Derniere connexion REUSSIE, nulle si le compte ne s'est jamais connecte. */
  derniereConnexion: Date | null;
};

/**
 * Les clients, avec leur activite, LS-185.
 *
 * LA RECHERCHE EST LIBRE SUR LE NOM ET L'ADRESSE, ET C'EST UN ECART ASSUME A
 * ADR-027, arbitrage explicite de Christophe du 5 septembre 2026. La decision et
 * ses consequences sont ecrites dans `.claude/familles-sans-action.txt` et dans
 * le traitement T11 du registre : ne pas la « corriger » en croyant reparer un
 * oubli, revenir dessus est une decision qui lui appartient.
 *
 * `mode: "insensitive"` PARCE QU'UNE RECHERCHE SENSIBLE A LA CASSE NE SERT
 * RIEN. Personne ne saisit « Dupont » avec la bonne majuscule quand il cherche
 * un client au telephone.
 *
 * LE TERME EST UN FILTRE, PAS UNE AUTORISATION, invariant 2 : il restreint ce
 * que la requete rend, il ne decide jamais qui a le droit de la lancer. La garde
 * de role vit dans la page, avant tout rendu.
 *
 * LES MONTANTS SONT AGREGES PAR LA BASE, jamais en JavaScript sur des lignes
 * chargees. Deux raisons : l'invariant 1 veut des centimes entiers, et charger
 * toutes les commandes de tous les clients pour en faire la somme mettrait en
 * memoire l'historique complet de la boutique pour afficher un nombre.
 */
export async function listerClients(
  client: ClientBase,
  options: { terme?: string; limite: number },
): Promise<{ clients: ClientEnListe[]; limiteAtteinte: boolean }> {
  const { terme, limite } = options;

  /*
   * LE TERME VIDE NE FILTRE RIEN, et il ne doit surtout pas produire
   * `contains: ""`, qui matche tout et couterait une comparaison par ligne pour
   * le meme resultat. Le spread conditionnel garde la clause absente.
   */
  const recherche = terme?.trim();

  const where =
    recherche && recherche.length > 0
      ? {
          OR: [
            { email: { contains: recherche, mode: "insensitive" as const } },
            { nom: { contains: recherche, mode: "insensitive" as const } },
          ],
        }
      : {};

  const lignes = await client.utilisateur.findMany({
    where,
    /*
     * LES PLUS RECEMMENT INSCRITS D'ABORD. Un tri par nom paraitrait naturel et
     * serait moins utile : ce qui interesse a l'ouverture de l'ecran est qui
     * vient d'arriver, la recherche servant a retrouver quelqu'un de precis.
     */
    orderBy: { creeA: "desc" },
    take: limite + 1,
    select: {
      id: true,
      email: true,
      nom: true,
      emailVerifie: true,
      creeA: true,
      _count: { select: { adresses: true, commandes: true } },
      /*
       * LA SOMME DES COMMANDES, agregee par la base.
       *
       * ELLE PORTE SUR TOUTES LES COMMANDES RATTACHEES, y compris celles qui ne
       * sont pas payees : c'est une mesure d'ACTIVITE et non de chiffre
       * d'affaires. Le chiffre d'affaires a ses propres regles de calcul, dans
       * `STATISTIQUES.md`, et LS-64 le portera ; les confondre ici donnerait
       * deux chiffres differents pour un meme mot.
       */
      commandes: { select: { totalCentimes: true } },
      /*
       * LA DERNIERE CONNEXION REUSSIE, et `REUSSITE` seule.
       *
       * Un echec ou un refus par limitation de debit ne dit pas que la personne
       * s'est connectee : les compter ferait apparaitre comme actif un compte
       * dont quelqu'un essaie justement de forcer l'acces.
       */
      journauxConnexion: {
        where: { issue: "REUSSITE" },
        orderBy: { creeA: "desc" },
        take: 1,
        select: { creeA: true },
      },
    },
  });

  const limiteAtteinte = lignes.length > limite;

  return {
    clients: lignes.slice(0, limite).map((ligne) => ({
      id: ligne.id,
      email: ligne.email,
      nom: ligne.nom,
      emailVerifie: ligne.emailVerifie,
      creeA: ligne.creeA,
      nombreCommandes: ligne._count.commandes,
      nombreAdresses: ligne._count.adresses,
      totalCentimes: ligne.commandes.reduce(
        (somme, commande) => somme + commande.totalCentimes,
        0,
      ),
      derniereConnexion: ligne.journauxConnexion[0]?.creeA ?? null,
    })),
    limiteAtteinte,
  };
}
