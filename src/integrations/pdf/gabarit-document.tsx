/**
 * Gabarit du document comptable, facture ou avoir. LS-129, ADR-034.
 *
 * IL NE LIT QUE L'INSTANTANE LEGAL, jamais le catalogue ni le profil courant,
 * invariant 3. C'est la raison d'etre de l'instantane : une facture emise ne
 * doit pas changer parce qu'un prix ou une raison sociale a bouge depuis. Le
 * gabarit ne recoit donc AUCUN identifiant qui lui permettrait de relire quoi
 * que ce soit.
 *
 * CE FICHIER N'EST PAS UN COMPOSANT DE L'INTERFACE. Les elements viennent de
 * `@react-pdf/renderer` et n'ont rien de commun avec le DOM : `View` et `Text`
 * y sont des primitives de mise en page PDF. Il vit dans `integrations/` parce
 * qu'il encapsule une bibliotheque externe, `services/` decidant quoi rendre et
 * quand.
 */
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { InstantaneLegal } from "@/lib/validation";

/**
 * La police est EMBARQUEE, jamais celle par defaut, ADR-034.
 *
 * `@react-pdf/renderer` NE LEVE PAS sur un caractere qu'il ne sait pas rendre,
 * il le REMPLACE en silence : mesure du 1er septembre 2026, « Straẞe Łódź
 * Tōkyō » sortait « Straže Aódz TMkyM » avec la police par defaut. Sur un
 * document legal, un nom de client deforme est plus grave qu'une exception,
 * parce que rien ne le signale.
 *
 * Le nom et l'adresse du client sont des SAISIES LIBRES : un nom polonais ou
 * allemand est parfaitement plausible sur une boutique francaise.
 *
 * LE FICHIER EST DANS LE DEPOT, jamais charge par URL : `Font.register` sur une
 * adresse distante ferait dependre l'emission d'une facture de la disponibilite
 * d'un tiers.
 *
 * DejaVu Sans couvre le latin etendu, verifie en extrayant le texte du PDF
 * produit. Arial echouait sur `ẞ`, ce qui a impose de mesurer plutot que de se
 * fier au nom du sous-ensemble.
 */
/*
 * LE CHEMIN VIENT DE `import.meta.url`, JAMAIS DE `process.cwd()`.
 *
 * Deux raisons, et la seconde ne se voit qu'au deploiement.
 *
 * `process.cwd()` DEPEND DU REPERTOIRE DE LANCEMENT, pas de l'emplacement du
 * module : un serveur demarre ailleurs que dans la racine du projet ne
 * trouverait plus la police.
 *
 * ET SURTOUT, `next build` NE SAIT PAS TRACER UN CHEMIN CONSTRUIT A
 * L'EXECUTION. Mesure du 1er septembre 2026 : avec `process.cwd()`, la
 * construction avertissait « Encountered unexpected file in NFT list » et
 * TRACAIT TOUT LE PROJET, faute de pouvoir resoudre le chemin. Resolu depuis le
 * module, le tracage redevient precis.
 */
const RACINE_POLICES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "polices",
);

Font.register({
  family: "DejaVu Sans",
  fonts: [
    {
      src: path.join(RACINE_POLICES, "dejavu-sans-latin-400-normal.woff"),
      fontWeight: 400,
    },
    {
      src: path.join(RACINE_POLICES, "dejavu-sans-latin-700-normal.woff"),
      fontWeight: 700,
    },
  ],
});

/*
 * LA COUPURE DE MOT EST DESACTIVEE. Par defaut la bibliotheque coupe les mots
 * longs sans tiret, ce qui rend « Ariane » en « Aria / ne » sur une colonne
 * etroite. Une designation de bijou passe a la ligne entiere ou deborde
 * visiblement, ce qui se voit et se corrige, plutot que de se lire de travers.
 */
Font.registerHyphenationCallback((mot) => [mot]);

const COULEUR_TEXTE = "#3B2F2A";
const COULEUR_ATTENUEE = "#7A6A5D";
const COULEUR_FILET = "#D9CEC1";

const styles = StyleSheet.create({
  page: {
    fontFamily: "DejaVu Sans",
    fontSize: 9,
    color: COULEUR_TEXTE,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    lineHeight: 1.5,
  },
  entete: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  titre: { fontSize: 16, fontWeight: 700 },
  numero: { fontSize: 11, fontWeight: 700 },
  bloc: { marginBottom: 16 },
  blocTitre: {
    fontSize: 8,
    fontWeight: 700,
    color: COULEUR_ATTENUEE,
    marginBottom: 3,
  },
  parties: { flexDirection: "row", justifyContent: "space-between", gap: 24 },
  partie: { width: "48%" },
  ligneEntete: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COULEUR_TEXTE,
    paddingBottom: 4,
    marginBottom: 4,
    fontWeight: 700,
  },
  ligne: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COULEUR_FILET,
    paddingVertical: 4,
  },
  colDesignation: { width: "52%" },
  colQuantite: { width: "12%", textAlign: "right" },
  colPrix: { width: "18%", textAlign: "right" },
  colTotal: { width: "18%", textAlign: "right" },
  reference: { fontSize: 7, color: COULEUR_ATTENUEE },
  totaux: { marginTop: 12, alignItems: "flex-end" },
  ligneTotal: { flexDirection: "row", width: "45%", paddingVertical: 2 },
  libelleTotal: { width: "60%", textAlign: "right", paddingRight: 8 },
  valeurTotal: { width: "40%", textAlign: "right" },
  ligneTotalFort: {
    flexDirection: "row",
    width: "45%",
    paddingTop: 4,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: COULEUR_TEXTE,
    fontWeight: 700,
  },
  mentions: { marginTop: 24 },
  mention: { fontSize: 8, color: COULEUR_ATTENUEE },
  pied: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 7,
    color: COULEUR_ATTENUEE,
  },
});

/**
 * Formate un montant en centimes vers l'euro affiche.
 *
 * LE CALCUL RESTE ENTIER, invariant 1 : la division par cent n'a lieu qu'ICI,
 * pour l'affichage, et aucun total n'est recalcule dans ce fichier. Les trois
 * montants viennent de l'instantane, qui les porte deja additionnes.
 */
function euros(centimes: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(centimes / 100);
}

/** Date au format francais, l'instantane portant une chaine ISO en UTC. */
function dateAffichee(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
}

export type EnTeteDocument = {
  /** « Facture » ou « Avoir », le gabarit servant les deux, invariant 4. */
  intitule: string;
  /** Numero deja attribue, JAMAIS calcule ici, ADR-031. */
  numero: string;
  /** Date d'emission du document, en ISO. */
  emisA: string;
};

/**
 * Le document complet, pret pour `renderToBuffer`.
 *
 * AUCUNE LIGNE DE TVA, franchise en base : ni colonne, ni taux, ni total hors
 * taxes. La mention de l'article 293 B vient de `instantane.mentions`, ecrite a
 * l'emission, et n'est pas recopiee ici : la reecrire ferait dire au document
 * autre chose que ce que la facture porte en base.
 */
export function GabaritDocument({
  enTete,
  instantane,
}: {
  enTete: EnTeteDocument;
  instantane: InstantaneLegal;
}) {
  const { emetteur, client, commande, lignes } = instantane;

  return (
    <Document
      title={`${enTete.intitule} ${enTete.numero}`}
      author={emetteur.raisonSociale}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.entete}>
          <View>
            <Text style={styles.titre}>{emetteur.raisonSociale}</Text>
            <Text>{emetteur.adresse}</Text>
            <Text>SIRET {emetteur.siret}</Text>
            <Text>{emetteur.emailContact}</Text>
          </View>

          <View>
            <Text style={styles.numero}>
              {enTete.intitule} {enTete.numero}
            </Text>
            <Text>Émis le {dateAffichee(enTete.emisA)}</Text>
            <Text>Commande {commande.numero}</Text>
            <Text>Passée le {dateAffichee(commande.passeeA)}</Text>
          </View>
        </View>

        <View style={[styles.bloc, styles.parties]}>
          <View style={styles.partie}>
            <Text style={styles.blocTitre}>ADRESSE DE FACTURATION</Text>
            <Text>{client.adresseFacturation.nom}</Text>
            <Text>{client.adresseFacturation.ligne1}</Text>
            {client.adresseFacturation.ligne2 !== undefined && (
              <Text>{client.adresseFacturation.ligne2}</Text>
            )}
            <Text>
              {client.adresseFacturation.codePostal}{" "}
              {client.adresseFacturation.ville}
            </Text>
          </View>

          <View style={styles.partie}>
            <Text style={styles.blocTitre}>CONTACT</Text>
            <Text>{client.nom}</Text>
            <Text>{client.email}</Text>
          </View>
        </View>

        <View style={styles.ligneEntete}>
          <Text style={styles.colDesignation}>Désignation</Text>
          <Text style={styles.colQuantite}>Qté</Text>
          <Text style={styles.colPrix}>Prix unitaire</Text>
          <Text style={styles.colTotal}>Total</Text>
        </View>

        {lignes.map((ligne) => (
          <View
            /*
             * LA REFERENCE FIGEE SERT DE CLE, et elle est unique par ligne de
             * commande. L'index de tableau conviendrait pour une liste jamais
             * reordonnee, mais la reference porte du sens et se relit dans le
             * document lui-meme.
             */
            key={ligne.referenceFigee}
            style={styles.ligne}
            wrap={false}
          >
            <View style={styles.colDesignation}>
              <Text>
                {ligne.libelleProduit}, {ligne.libelleVariante}
              </Text>
              <Text style={styles.reference}>{ligne.referenceFigee}</Text>
            </View>
            <Text style={styles.colQuantite}>{ligne.quantite}</Text>
            <Text style={styles.colPrix}>
              {euros(ligne.prixUnitaireCentimes)}
            </Text>
            <Text style={styles.colTotal}>
              {euros(ligne.prixUnitaireCentimes * ligne.quantite)}
            </Text>
          </View>
        ))}

        <View style={styles.totaux}>
          <View style={styles.ligneTotal}>
            <Text style={styles.libelleTotal}>Sous-total</Text>
            <Text style={styles.valeurTotal}>
              {euros(instantane.sousTotalCentimes)}
            </Text>
          </View>
          <View style={styles.ligneTotal}>
            <Text style={styles.libelleTotal}>Frais de livraison</Text>
            <Text style={styles.valeurTotal}>
              {euros(instantane.fraisPortCentimes)}
            </Text>
          </View>
          <View style={styles.ligneTotalFort}>
            <Text style={styles.libelleTotal}>Total</Text>
            <Text style={styles.valeurTotal}>
              {euros(instantane.totalCentimes)}
            </Text>
          </View>
        </View>

        <View style={styles.mentions}>
          {instantane.mentions.map((mention) => (
            <Text key={mention} style={styles.mention}>
              {mention}
            </Text>
          ))}
        </View>

        {/*
         * LA PAGINATION EST RENDUE PAR LA BIBLIOTHEQUE, `render` recevant le
         * numero de page. Un document d'une seule page l'affiche quand meme :
         * « 1 / 1 » atteste qu'aucune page ne manque, ce qu'une absence de
         * pagination ne dit pas.
         */}
        <Text
          style={styles.pied}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${enTete.intitule} ${enTete.numero} — page ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
