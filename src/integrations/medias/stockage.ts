/**
 * Stockage des medias sur volume local, LS-102. ADR-007.
 *
 * DEUX DOSSIERS DONT UN SEUL EST PUBLIE, et c'est la decision structurante :
 *
 *   quarantaine/   televersement brut, aucun serveur ne le publie
 *   public/        uniquement apres traitement reussi
 *
 * LE DEPLACEMENT DE L'UN A L'AUTRE EST LE SEUL GESTE QUI PUBLIE. La regle C8
 * devient ainsi une propriete PHYSIQUE : un media non traite n'est pas a un
 * endroit servable, independamment du code. ADR-007 a explicitement ecarte le
 * dossier unique avec filtre applicatif, parce que la regle reposerait alors
 * sur le fait qu'aucune requete n'oublie `statutTraitement = 'TRAITE'`, motif
 * deja rencontre trois fois sur ce projet.
 *
 * CE MODULE N'ECRIT JAMAIS DANS `public/` DU PROJET. En sortie `standalone`, ce
 * dossier est copie dans l'image a la construction : un media televerse apres un
 * deploiement disparaitrait au suivant, sans que la construction ni le controle
 * de sante le signalent.
 *
 * L'ORIGINAL EST SUPPRIME apres traitement reussi. C'est le seul fichier qui
 * porte la position GPS du domicile : le conserver le ferait survivre dans les
 * sauvegardes.
 */
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";

/** Un chemin ou un identifiant sort du volume, ou porte un separateur. */
export class CheminInvalideError extends Error {
  constructor(readonly valeur: string) {
    super("Chemin de media invalide.");
    this.name = "CheminInvalideError";
  }
}

/** Une declinaison prete a ecrire, telle que le traitement la rend. */
export type FichierAEcrire = {
  nom: string;
  contenu: Buffer;
};

const QUARANTAINE = "quarantaine";
const PUBLIC = "public";

/**
 * Refuse tout segment de chemin qui n'est pas un nom simple.
 *
 * LA LISTE EST D'AUTORISES ET NON D'INTERDITS. Enumerer les formes de traversee,
 * `..`, `../`, `..\\`, l'encodage pourcent, revient toujours a en oublier une.
 * Exiger une forme connue ferme la question.
 *
 * LES IDENTIFIANTS SONT ENGENDRES PAR CE MODULE, donc le cas ne devrait pas se
 * produire. Cette garde existe parce qu'une valeur venue de la base ou d'un
 * parametre finit toujours par atteindre ce chemin, et que son cout est nul.
 */
function exigerSegmentSimple(valeur: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(valeur) || valeur.includes("..")) {
    throw new CheminInvalideError(valeur);
  }
  return valeur;
}

export class StockageMedias {
  constructor(private readonly racine: string) {}

  private get quarantaine(): string {
    return join(this.racine, QUARANTAINE);
  }

  private get publie(): string {
    return join(this.racine, PUBLIC);
  }

  /**
   * Cree les deux dossiers. IDEMPOTENTE, le conteneur pouvant redemarrer.
   *
   * Appelee au demarrage plutot qu'au premier televersement : un dossier absent
   * ferait echouer le premier depot, c'est-a-dire au pire moment.
   */
  async preparer(): Promise<void> {
    await mkdir(this.quarantaine, { recursive: true });
    await mkdir(this.publie, { recursive: true });
  }

  /**
   * Ecrit le fichier brut en quarantaine et rend son identifiant.
   *
   * L'IDENTIFIANT EST ENGENDRE, JAMAIS DERIVE DU NOM TELEVERSE. Un nom de
   * fichier fourni par l'appelant est une donnee non fiable : il peut porter des
   * separateurs, des caracteres de traversee, ou simplement reveler ce que la
   * photographie montre, ce qui n'a rien a faire dans une URL publique.
   */
  async deposerEnQuarantaine(octets: Buffer): Promise<string> {
    await mkdir(this.quarantaine, { recursive: true });
    const identifiant = randomUUID();
    await writeFile(join(this.quarantaine, identifiant), octets);
    return identifiant;
  }

  /**
   * Publie les declinaisons et supprime l'original. LE SEUL GESTE QUI PUBLIE.
   *
   * L'ORDRE EST IMPOSE : ecrire les declinaisons, PUIS retirer l'original. Un
   * original supprime en premier laisserait, en cas d'echec d'ecriture, un media
   * sans aucun fichier et sans moyen de reessayer.
   *
   * Rend le chemin RELATIF au dossier `public/`, valeur que porte `Media.chemin`
   * en base. Jamais un chemin absolu ni une URL : le prefixe de service
   * appartient a la configuration de Nginx, pas aux donnees, et un chemin absolu
   * casserait au premier changement de point de montage.
   */
  async publier(
    identifiant: string,
    declinaisons: FichierAEcrire[],
  ): Promise<string> {
    const sur = exigerSegmentSimple(identifiant);
    for (const declinaison of declinaisons) {
      exigerSegmentSimple(declinaison.nom);
    }

    const source = join(this.quarantaine, sur);
    // L'ABSENCE DE L'ORIGINAL EST UNE ERREUR ET NON UN CAS NOMINAL : publier un
    // media dont la source a disparu ecrirait des declinaisons orphelines.
    await stat(source);

    const destination = join(this.publie, sur);
    await mkdir(destination, { recursive: true });

    for (const declinaison of declinaisons) {
      await writeFile(join(destination, declinaison.nom), declinaison.contenu);
    }

    await unlink(source);
    return sur;
  }

  /**
   * Supprime les declinaisons publiees d'un media.
   *
   * NE LEVE PAS SUR UN CHEMIN DEJA ABSENT : la tache de nettoyage peut rejouer,
   * et un media supprime deux fois n'est pas une anomalie.
   */
  async supprimerPublies(chemin: string): Promise<void> {
    const sur = exigerSegmentSimple(chemin);
    const cible = join(this.publie, sur);

    // CEINTURE ET BRETELLES : meme apres `exigerSegmentSimple`, on verifie que
    // le chemin resolu reste sous la racine publiee. Une suppression recursive
    // est le geste ou une erreur coute le plus cher.
    if (!resolve(cible).startsWith(resolve(this.publie) + sep)) {
      throw new CheminInvalideError(chemin);
    }

    await rm(cible, { recursive: true, force: true });
  }

  /**
   * Purge les fichiers de quarantaine plus vieux que l'age donne.
   *
   * L'AGE MINIMAL EST CE QUI REND LA PURGE SURE. Purger tout ce qui traine
   * emporterait un fichier en cours de traitement : l'encodage d'une
   * photographie lourde prend environ deux secondes, mesure a ADR-007.
   *
   * NE TOUCHE JAMAIS AU DOSSIER PUBLIE, qui porte les medias servis.
   */
  async purgerQuarantaine(ageMinimalMs: number): Promise<number> {
    let purges = 0;
    const limite = Date.now() - ageMinimalMs;

    let entrees: string[];
    try {
      entrees = await readdir(this.quarantaine);
    } catch {
      // Quarantaine absente : rien a purger, ce n'est pas une erreur.
      return 0;
    }

    for (const entree of entrees) {
      const chemin = join(this.quarantaine, entree);
      const infos = await stat(chemin);

      if (infos.mtimeMs <= limite) {
        await rm(chemin, { recursive: true, force: true });
        purges += 1;
      }
    }

    return purges;
  }

  /**
   * Deplace un fichier de quarantaine vers un autre nom de quarantaine.
   *
   * Sert la reprise d'un televersement interrompu, parcours 3. Distinct de
   * `publier` : rien ne sort de la quarantaine ici.
   */
  async renommerEnQuarantaine(source: string, cible: string): Promise<void> {
    const un = exigerSegmentSimple(source);
    const deux = exigerSegmentSimple(cible);
    await rename(join(this.quarantaine, un), join(this.quarantaine, deux));
  }
}
