/**
 * Mise en forme d'une commande, LS-121. Partage par l'administration et la
 * boutique.
 *
 * CE MODULE NE DECIDE RIEN ET NE LIT RIEN : il traduit des valeurs en texte
 * lisible. Il vit a part parce qu'une page Next.js ne doit exporter que ses
 * conventions, `metadata`, `dynamic` et son composant : y ajouter des fonctions
 * utilitaires les rend inatteignables depuis le detail et brouille le contrat
 * du fichier de route.
 *
 * DEPLACE DE `app/administration/commandes/` VERS `lib/` PAR LS-57, et ce
 * deplacement est ce qui evite une source seconde. L'espace client affiche les
 * MEMES statuts et les MEMES modes de livraison : les recopier aurait produit
 * deux tables a garder d'accord, dont la divergence se serait vue le jour ou un
 * statut est ajoute, cote client seulement. Quatre fichiers d'administration
 * l'importaient deja par des chemins relatifs remontants, `../commandes/
 * affichage`, ce qui signalait qu'il n'etait plus a sa place.
 *
 * UN ENUM AJOUTE FAIT ECHOUER LE `type-check` sur `LIBELLES_STATUT`,
 * `LIBELLES_LIVRAISON` ET `LIBELLES_ORIGINE`, tous trois exhaustifs : c'est ce
 * qui empeche un statut, un mode ou une origine d'apparaitre vide ou faux a
 * l'ecran, piege deja rencontre trois fois sur ce projet.
 *
 * `LIBELLES_LIVRAISON` ne l'etait PAS jusqu'a la revue frontend de LS-57, et
 * `formaterOrigine` etait un `switch` a `default` jusqu'a LS-143. Cette phrase
 * les annonçait deja tous : un commentaire qui promet plus que le code est ce
 * qui a laisse les deux asymetries passer, la seconde pendant onze jours de
 * plus que la premiere.
 *
 * `LIBELLES_PAIEMENT` reste volontairement faible, voir son propre commentaire.
 */
import type {
  ModeLivraison,
  OrigineEcriture,
  StatutCommande,
  StatutPaiement,
} from "@/generated/prisma/enums";

/** Libelle affichable d'un statut, jamais la valeur brute de l'enum. */
export const LIBELLES_STATUT: Record<StatutCommande, string> = {
  EN_ATTENTE_PAIEMENT: "En attente de paiement",
  CONFIRMEE: "Confirmée",
  EN_PREPARATION: "En préparation",
  EXPEDIEE: "Expédiée",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};

/**
 * Libelle d'un statut de paiement, axe distinct du statut de commande.
 *
 * `Record<StatutPaiement, string>` DEPUIS LS-143, et cette table etait le
 * JUMEAU EXACT de `formaterOrigine` : un `Record<string, string>` indexe par
 * une valeur d'enum que le service elargissait en `string`. Un sixieme statut
 * de paiement s'affichait en majuscules brutes a l'exploitante, `REMBOURSE_
 * PARTIELLEMENT` au milieu d'un ecran accentue, sans qu'aucun type ni aucun
 * test ne rougisse.
 *
 * Son commentaire annonçait deja la correction, « le jour ou un ecran client
 * l'emploiera, ce type devra devenir exhaustif comme les autres ». Attendre cet
 * ecran etait une erreur de raisonnement : c'est l'ELARGISSEMENT au service qui
 * ouvrait le trou, pas l'identite de l'appelant.
 *
 * LE REPLI `?? paiement.statut` DE L'APPELANT DEVIENT INATTEIGNABLE et doit le
 * rester : le type garantit desormais la presence de la cle.
 */
export const LIBELLES_PAIEMENT: Record<StatutPaiement, string> = {
  EN_ATTENTE: "En attente",
  REUSSI: "Réussi",
  ECHOUE: "Échoué",
  PARTIELLEMENT_REMBOURSE: "Partiellement remboursé",
  REMBOURSE: "Remboursé",
};

/**
 * Libelle d'un mode de livraison, ADR-025.
 *
 * `Record<ModeLivraison, string>` ET NON `Record<string, string>`, corrige par
 * la revue frontend de LS-57. Le typage faible laissait passer un mode ajoute a
 * l'enum : `LIBELLES_LIVRAISON[mode]` rendait `undefined`, que React affiche en
 * chaine vide, et le champ « Livraison » de l'ecran client apparaissait VIDE
 * sans qu'aucun controle n'ait rougi.
 *
 * Mutation faite pour le prouver : ajouter `CONSIGNE` a `ModeLivraison` ne
 * faisait echouer que le tunnel, jamais ce fichier. Avec le type exhaustif, il
 * echoue ici aussi, et c'est ce qui empeche un mode d'apparaitre vide.
 *
 * L'en-tete de ce fichier annonçait cette protection pour `LIBELLES_STATUT`
 * seul : un commentaire qui couvre un cas et laisse croire qu'il les couvre
 * tous est ce qui a permis a l'asymetrie de passer.
 */
export const LIBELLES_LIVRAISON: Record<ModeLivraison, string> = {
  DOMICILE: "À domicile",
  POINT_RELAIS: "Point relais",
  LOCKER: "Locker",
};

/**
 * Date lisible, convertie a l'affichage seulement, invariant 8.
 *
 * `Europe/Paris` EST EXPLICITE et non deduit du serveur : un conteneur en UTC
 * afficherait sinon des heures decalees d'une ou deux selon la saison, et une
 * commande passee a 00h30 apparaitrait la veille.
 */
export function formaterDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

/**
 * Libelle d'une origine d'ecriture, regle S9.
 *
 * `Record<OrigineEcriture, string>` ET NON un `switch` a `default`, corrige par
 * LS-143. Le `switch` precedent rendait « Système » pour tout ce qu'il ne
 * connaissait pas : une quatrieme valeur ajoutee a l'enum se serait affichee
 * comme une ecriture systeme, donc FAUSSEMENT, sans qu'aucun type ni aucun test
 * ne rougisse. Une origine erronee dans l'historique est plus trompeuse qu'un
 * champ vide, puisqu'elle affirme quelque chose.
 *
 * C'est la troisieme forme du meme piege sur ce depot, apres le predicat
 * d'index partiel et `LIBELLES_LIVRAISON` : l'ajout d'une valeur d'enum doit
 * casser le `type-check`, jamais dependre d'une vigilance a la relecture.
 */
export const LIBELLES_ORIGINE: Record<OrigineEcriture, string> = {
  SYSTEME: "Système",
  ADMIN: "Administration",
  RECONCILIATION: "Réconciliation automatique",
};

/**
 * Qui a decide une transition, en clair.
 *
 * LA DISTINCTION EST LE POINT DE L'HISTORIQUE, regle S9 : savoir si une commande
 * a ete avancee par une personne ou par une tache est precisement ce qu'on vient
 * y chercher six mois plus tard.
 *
 * LE PARAMETRE EST TYPE `OrigineEcriture` ET NON `string`, et c'est ce qui porte
 * la protection : la colonne `origine` est un enum au schema, a la difference
 * des colonnes d'historique de `traduireStatut` qui sont bien des `string`. Un
 * `string` en entree rouvrirait le trou que la table exhaustive vient de
 * fermer, en rendant `undefined` pour une valeur inconnue.
 */
export function formaterOrigine(origine: OrigineEcriture): string {
  return LIBELLES_ORIGINE[origine];
}

/**
 * Traduit un statut recu en `string`, avec repli sur la valeur brute.
 *
 * LES COLONNES D'HISTORIQUE SONT TYPEES `string` ET NON `StatutCommande`, parce
 * qu'elles conservent ce qui a ete ecrit, y compris un statut qui n'existerait
 * plus. Le repli est donc deliberé : un statut sans libelle s'affiche tel quel
 * plutot que de disparaitre, ce qui rendrait une ligne d'historique muette.
 */
export function traduireStatut(valeur: string): string {
  return LIBELLES_STATUT[valeur as keyof typeof LIBELLES_STATUT] ?? valeur;
}

/**
 * Seuil au-dela duquel un suivi est signale comme bloque, LS-58 et LS-216.
 *
 * VINGT-QUATRE HEURES, ET LE CHIFFRE SE DEDUIT DU CYCLE. La tache
 * `suivi-livraison` tourne toutes les heures, donc un suivi sain est
 * re-synchronise au pire une heure apres le precedent. Vingt-quatre laisse
 * passer vingt-trois cycles rates avant d'alerter : assez large pour qu'une
 * panne breve du transporteur ne fasse pas clignoter l'ecran, assez court pour
 * qu'un colis vraiment bloque se voie le lendemain.
 *
 * IL BORNE L'AGE DE `synchroniseA`, JAMAIS CELUI DE L'EXPEDITION. Une
 * expedition partie il y a trois jours dont le suivi a ete lu il y a dix
 * minutes est a jour : ce qui est mesure est la fraicheur de la LECTURE, pas
 * l'anciennete du colis.
 */
export const SEUIL_SUIVI_BLOQUE_MS = 24 * 60 * 60 * 1000;

/**
 * Etat de fraicheur du suivi d'une expedition, LS-58 critere 4, LS-216 critere 4.
 *
 * TROIS ETATS ET NON DEUX, et le troisieme est celui qui compte. `jamais` dit
 * qu'aucun statut n'a jamais ete lu, ce qui arrive normalement le jour ou le
 * colis est remis au transporteur, et anormalement quand le numero de suivi est
 * faux. `bloque` dit qu'une lecture a eu lieu puis s'est arretee. Les confondre
 * ferait alerter sur toute expedition du jour meme.
 */
export type FraicheurSuivi = "jamais" | "bloque" | "frais";

/**
 * Depuis quand le suivi de cette expedition n'a-t-il pas ete lu ?
 *
 * `livreA` REND TOUJOURS `frais`, ET C'EST LA REGLE QUI EVITE UNE FAUSSE
 * ALERTE. `listerASuivre` exclut les expeditions livrees : leur `synchroniseA`
 * cesse donc d'avancer par construction, et sans cette garde toute commande
 * livree serait signalee « bloquee » vingt-quatre heures plus tard. Le suivi
 * d'un colis remis n'a plus rien a apprendre, invariant du repository.
 *
 * `maintenant` EST INJECTABLE pour que le test fixe l'instant plutot que de
 * dormir : une comparaison de dates se prouve sur des valeurs choisies.
 */
export function fraicheurSuivi(
  expedition: { livreA: Date | null; synchroniseA: Date | null },
  maintenant: Date = new Date(),
): FraicheurSuivi {
  if (expedition.livreA !== null) {
    return "frais";
  }

  if (expedition.synchroniseA === null) {
    return "jamais";
  }

  const age = maintenant.getTime() - expedition.synchroniseA.getTime();

  return age > SEUIL_SUIVI_BLOQUE_MS ? "bloque" : "frais";
}
