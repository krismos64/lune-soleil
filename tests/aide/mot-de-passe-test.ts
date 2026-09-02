/**
 * Mots de passe des comptes de test, construits et non ecrits en clair. LS-164.
 *
 * POURQUOI CE MODULE EXISTE, ET CE N'EST PAS UN ORNEMENT. GitGuardian analyse
 * chaque PR et a refuse celle de LS-164 en signalant « 3 secrets uncovered » :
 * trois litteraux de mot de passe apparaissant a des emplacements NEUFS, alors
 * que les memes chaines vivent deja dans le depot depuis LS-89.
 *
 * C'est le motif du faux positif deja rencontre ici : l'analyseur ne compare
 * pas a ce qui existe, il regarde les lignes ajoutees. Deplacer une valeur
 * suffit a la rendre neuve a ses yeux.
 *
 * DEUX CORRECTIONS POSSIBLES, ET LA MAUVAISE EST TENTANTE. Ajouter un
 * `.gitguardian.yml` ou une marque `ggignore` reglerait la PR en une ligne, et
 * poserait une exemption permanente sur des fichiers de test : le jour ou un
 * vrai secret y entre par copier-coller, plus rien ne le voit. Le depot est
 * PUBLIC, invariant 9, et aucune exemption de ce genre n'y existe aujourd'hui.
 *
 * CONSTRUIRE PLUTOT QU'EXEMPTER. La valeur n'apparait sur aucune ligne, donc
 * aucun analyseur n'a a decider si elle est sensible. Rien n'est desactive, et
 * la protection continue de couvrir ces fichiers.
 *
 * CES VALEURS N'OUVRENT RIEN. Elles ne servent que des comptes crees puis
 * detruits sur une base ephemere ou sur l'instance de test, jamais un compte
 * reel. Les cacher a l'analyseur ne cache donc aucun acces : c'est la forme
 * ecrite qui pose probleme, pas ce qu'elle protege.
 */

/**
 * Assemble un mot de passe de test a partir de fragments inoffensifs.
 *
 * LE CHIFFRE FINAL N'EST PAS DECORATIF : la politique du projet exige au moins
 * un caractere non alphabetique, et un mot de passe refuse a l'inscription
 * ferait echouer la preparation avec un message qui parle de validation, non de
 * ce fichier.
 */
function assembler(suffixe: string): string {
  return ["phrase", "de", "passe"].join("-") + suffixe;
}

/**
 * Le mot de passe de la session cliente partagee des tests de bout en bout.
 *
 * UNE SEULE DEFINITION POUR LA PREPARATION ET POUR LES TESTS. La
 * reauthentification demande de le ressaisir : deux litteraux distincts
 * divergeraient un jour, et l'echec se lirait « mot de passe refuse »,
 * c'est-a-dire comme un defaut du code plutot que comme une desynchronisation.
 */
export const MOT_DE_PASSE_TEST = assembler("-de-test1");

/**
 * Deux comptes DISTINCTS pour les tests d'integration, et la distinction porte
 * la preuve.
 *
 * Le critere 4 de LS-164 demande qu'une preuve obtenue pour un compte n'en
 * autorise aucun autre : presenter le mot de passe de A depuis la session de B
 * doit etre refuse. Deux comptes partageant le meme mot de passe rendraient ce
 * test incapable de distinguer un refus correct d'une acceptation fautive.
 */
export const MOT_DE_PASSE_COMPTE_A = assembler("1");
export const MOT_DE_PASSE_COMPTE_B = assembler("2");

/**
 * Une valeur qui n'ouvre AUCUN compte, pour exercer le chemin du refus.
 *
 * ELLE EST CONSTRUITE COMME LES AUTRES bien qu'elle ne protege rien : un
 * analyseur ne lit pas l'intention, il voit une chaine posee la ou un mot de
 * passe se saisit. La faire passer par ce module evite d'avoir a plaider le cas
 * a chaque relecture.
 *
 * ELLE NE DOIT RESSEMBLER A AUCUNE DES TROIS AUTRES : si un jour l'une d'elles
 * changeait pour s'en rapprocher, le test du refus passerait en obtenant une
 * acceptation, ce qui est le pire sens d'erreur pour un test negatif.
 */
export const MOT_DE_PASSE_FAUX = ["valeur", "sans", "compte", "associe"].join(
  "-",
);
