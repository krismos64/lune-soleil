/**
 * Carnet d'adresses du client. LS-59, parcours 8, etape 1.
 *
 * COMPOSANT SERVEUR, `exigerSession` appele AVANT tout rendu. Pas de
 * middleware : celui de Next.js s'execute sur la peripherie et ne peut pas
 * relire la session en base, il ne verrait que la presence d'un cookie.
 *
 * LE CARNET EST UN CONFORT, JAMAIS UN PREALABLE. Aucune etape du parcours 1
 * n'en depend : l'achat sans compte reste le mode par defaut, et un carnet vide
 * est l'etat normal d'un compte neuf.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { exigerSession } from "@/services/autorisation";
import { listerMesAdresses } from "@/services/carnet-adresses";

import { FormulaireAdresse } from "./formulaire-adresse";
import { ListeAdresses, type AdresseAffichee } from "./liste-adresses";
import styles from "./adresses.module.css";
import stylesCompte from "../compte.module.css";

export const metadata = {
  title: "Mon carnet d'adresses",
  robots: { index: false, follow: false },
};

/**
 * La page lit la session a chaque affichage. Sans cela, Next.js pourrait servir
 * un rendu mis en cache, donc le carnet d'une personne a une autre.
 */
export const dynamic = "force-dynamic";

export default async function PageCarnetAdresses() {
  const identite = await exigerSession(await headers());

  if (!identite) {
    redirect("/compte/connexion");
  }

  const adresses = await listerMesAdresses(identite.utilisateurId);

  /*
   * LA PROJECTION VERS L'INTERFACE EST EXPLICITE, champ par champ. Passer
   * l'objet du repository ferait entrer `utilisateurId` et `creeA` dans un
   * composant client, donc dans la charge envoyee au navigateur : ni l'un ni
   * l'autre n'y a d'usage.
   */
  const affichees: AdresseAffichee[] = adresses.map((adresse) => ({
    id: adresse.id,
    libelle: adresse.libelle,
    nomComplet: adresse.nomComplet,
    ligne1: adresse.ligne1,
    ligne2: adresse.ligne2,
    codePostal: adresse.codePostal,
    ville: adresse.ville,
    pays: adresse.pays,
    telephone: adresse.telephone,
    estParDefaut: adresse.estParDefaut,
  }));

  return (
    <main id="contenu" tabIndex={-1} className={stylesCompte.page}>
      {/*
       * LE SUR-TITRE DE RUBRIQUE, forme du prototype, LS-180. Il n'est PAS un
       * titre au sens du document : c'est un `p` qui precede le `h1`, et le
       * passer en `h2` ferait ouvrir la page sur un niveau 2.
       *
       * `aria-hidden` LE RETIRE DE L'ARBRE D'ACCESSIBILITE : lu a voix haute,
       * il redirait ce que le `h1` juste dessous porte deja.
       */}
      <p className={stylesCompte.surTitre} aria-hidden="true">
        Carnet
      </p>
      <h1 className={stylesCompte.titre}>Mon carnet d&apos;adresses</h1>

      <p className={stylesCompte.texte}>
        <Link href="/compte" className={stylesCompte.lien}>
          Retour à mon compte
        </Link>
      </p>

      <p className={stylesCompte.texte}>
        Les adresses enregistrées ici vous sont proposées lors de vos commandes.
        Les modifier ne change aucune commande déjà passée.
      </p>

      <section
        className={stylesCompte.section}
        aria-labelledby="titre-mes-adresses"
      >
        <h2 id="titre-mes-adresses">Mes adresses</h2>
        <ListeAdresses adresses={affichees} />
      </section>

      <section className={stylesCompte.section} aria-labelledby="titre-ajout">
        <h2 id="titre-ajout">Ajouter une adresse</h2>
        <div className={styles.encadre}>
          <FormulaireAdresse />
        </div>
      </section>
    </main>
  );
}
