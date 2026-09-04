/**
 * Nom affichable et initiales, LS-180.
 *
 * DEUX FONCTIONS PURES, SANS AUCUNE DEPENDANCE, et c'est ce qui justifie leur
 * presence ici plutot que dans `services/espace-client.ts` ou elles ont vecu
 * quelques heures. Le test unitaire les a chassees : les importer depuis le
 * service tirait `lib/prisma`, donc exigeait une `DATABASE_URL` pour tester
 * deux fonctions qui ne touchent rien.
 *
 * C'EST LE MOTIF « fonction pure prisonniere de son module ». Le defaut ne se
 * voit pas a l'usage, le service fonctionnant parfaitement ; il se voit au
 * moment de TESTER, et il aurait pousse a monter une base pour verifier un
 * decoupage de chaine, ou pire, a ne pas le verifier du tout.
 */

/**
 * Les initiales de la pastille, deux lettres au plus.
 *
 * ELLE EST DISTINCTE DE CELLE DE L'ADMINISTRATION, ET CE N'EST PAS UNE
 * DUPLICATION QU'IL FAUDRAIT FACTORISER. Les deux recoivent des entrees de
 * NATURES DIFFERENTES : la barre d'administration recoit toujours la partie
 * locale d'une adresse, `stacy.menendez`, quand celle-ci recoit d'abord un vrai
 * nom saisi au profil, « Marie Dupont », et l'adresse seulement en repli.
 *
 * LA CONSEQUENCE EST DANS LE SEPARATEUR. Le commentaire de la fonction jumelle
 * dit que « le separateur n'est PAS l'espace » puisqu'une partie locale n'en
 * contient jamais ; ici l'espace est au contraire le separateur PRINCIPAL, et
 * c'est le cas le plus frequent. Les mettre en commun ferait porter a une seule
 * fonction deux justifications opposees, et la prochaine personne qui lirait
 * l'une des deux serait induite en erreur.
 *
 * Les trois autres separateurs restent couverts pour le cas de repli, une
 * adresse comme `marie.dupont` devant rendre « MD » et non « M ».
 */
export function initialesClient(nom: string): string {
  const mots = nom
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (mots.length === 0) {
    return "?";
  }

  return mots
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Le nom a afficher, avec son repli.
 *
 * LE REPLI N'EST PAS L'ADRESSE ENTIERE. Afficher `marie.dupont@example.com` en
 * tete de barre laterale la ferait deborder a 320 px, et surtout AFFICHERAIT
 * L'ADRESSE EMAIL EN PERMANENCE sur chaque ecran de l'espace client, y compris
 * par-dessus l'epaule dans un lieu public. La partie locale suffit a se
 * reconnaitre chez soi, et c'est le choix deja fait cote administration.
 */
export function nomAffichable(nom: string | null, email: string): string {
  const nomNettoye = nom?.trim() ?? "";

  /*
   * UN NOM DOIT PORTER AU MOINS UNE LETTRE OU UN CHIFFRE, ET `trim` NE SUFFIT
   * PAS A L'ETABLIR.
   *
   * LE CAS QUE LA REVUE D'INTERFACE A TROUVE : un nom valant `"..."`, `"---"`
   * ou `"_"` passe `trim` sans etre vide, donc s'affichait tel quel en tete de
   * barre. Pire, `initialesClient` le decoupe ensuite sur ces memes caracteres,
   * n'obtient aucun mot et rend `"?"` dans la pastille.
   *
   * CE N'ETAIT PAS SEULEMENT LAID, C'ETAIT UNE CONTRADICTION. Le layout ecrit
   * qu'il refuse d'afficher « un nom vide ou un `?` » parce que cela masquerait
   * une anomalie derriere un affichage plausible ; le code, lui, produisait
   * exactement cela. Des deux, c'est le commentaire qui avait raison.
   *
   * `\p{L}` ET `\p{N}` PLUTOT QU'UNE CLASSE ASCII : un nom francais porte des
   * accents, et « Élodie » commence justement par un caractere hors de
   * l'alphabet ASCII. Un `[a-z0-9]` ferait basculer ce nom sur le repli,
   * c'est-a-dire afficherait l'adresse email de quelqu'un qui a pourtant saisi
   * son nom.
   *
   * LE REPLI SUR L'ADRESSE COUVRE CE CAS, une partie locale portant toujours au
   * moins un caractere alphanumerique.
   */
  if (/[\p{L}\p{N}]/u.test(nomNettoye)) {
    return nomNettoye;
  }

  return email.split("@")[0] ?? email;
}
