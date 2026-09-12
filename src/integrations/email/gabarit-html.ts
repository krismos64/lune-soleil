/**
 * Gabarit HTML des emails, LS-222.
 *
 * CE MODULE NE REDIGE AUCUN TEXTE. Il HABILLE ce que `modeles.ts` a rendu, et
 * c'est toute la decision de conception de cette story : le HTML est DERIVE du
 * texte, jamais ecrit a cote.
 *
 * POURQUOI DERIVER PLUTOT QU'ECRIRE DEUX FOIS. Le ticket posait la question et
 * la laissait ouverte. Quinze modeles ecrits en double font quinze occasions de
 * corriger une version et pas l'autre, et rien ne le signalerait : les deux
 * partent dans le meme message, le client n'en voit qu'une, et le defaut ne se
 * constate que dans une boite reelle. Les textes sont ceux que l'exploitante a
 * valides en LS-29 ; une seconde redaction HTML serait une seconde source, donc
 * une divergence en attente.
 *
 * LE TEXTE RESTE OBLIGATOIRE DANS CHAQUE ENVOI, critere 1. Un message sans
 * version texte est penalise par les filtres anti-indesirables, et certains
 * clients ne rendent que celle-la : livrer du HTML seul degraderait la
 * delivrabilite que LS-82 a mise en place.
 *
 * AUCUNE IMAGE DISTANTE, critere 3 et ADR-040. Le logo voyage EN PIECE JOINTE
 * integree, reference par `cid:`, ce qui n'emet aucune requete reseau : un
 * email ne trace donc pas son ouverture, et le logo s'affiche meme hors ligne.
 * Une image chargee depuis un serveur du projet serait un pixel espion, que la
 * mesure d'audience soit voulue ou non.
 *
 * LE CSS EST EN LIGNE, sur chaque balise. Gmail retire la balise `style` d'un
 * message, Outlook ignore une bonne part des selecteurs : une feuille, meme
 * embarquee, ne survit pas au trajet. C'est la raison de la verbosite de ce
 * fichier, et elle n'est pas negociable.
 */
import { NOM_BOUTIQUE } from "@/lib/seo";

/**
 * Identifiant de contenu du logo, partage entre le gabarit et l'envoi.
 *
 * IL EST EXPORTE PARCE QUE DEUX ENDROITS DOIVENT S'ACCORDER : le `src` de la
 * balise image ici, et le `cid` de la piece jointe dans `smtp.ts`. Ecrire la
 * valeur des deux cotes ferait qu'un renommage d'un seul casserait l'affichage
 * sans casser aucun test, le message partant parfaitement avec une image morte.
 */
export const CID_LOGO = "logo-lune-soleil";

/**
 * La palette, reprise d'ADR-022 et de `styles/tokens.css`.
 *
 * LES VALEURS SONT RECOPIEES ICI, ET C'EST ASSUME. Un email ne peut pas lire une
 * variable CSS : les clients de messagerie ne resolvent pas `var()`, et la
 * feuille du site n'y est pas chargee. La recopie est donc imposee par le
 * support, pas choisie.
 *
 * LES RAPPORTS DE CONTRASTE VIENNENT DE `tokens.css`, ou ils sont mesures :
 * `#3b2f2a` sur creme vaut 12,09:1, et `#8a6a22` 4,72:1, tous deux conformes.
 * `--ls-accent-gold` est DECORATIF et ne porte jamais de texte, 2,31:1.
 */
const PALETTE = {
  fond: "#f2eadf",
  surface: "#ffffff",
  bordure: "#d9cdba",
  texte: "#3b2f2a",
  texteDiscret: "#7a6a5d",
  primaire: "#5f4519",
  lien: "#8a6a22",
} as const;

/**
 * Echappe le texte destine au HTML.
 *
 * INDISPENSABLE, ET PAS THEORIQUE. Les variables des modeles portent des
 * donnees saisies ailleurs : un nom de client, un motif de remboursement ecrit
 * par l'exploitante. Un `<` non echappe casserait la mise en page, et une
 * chaine bien choisie injecterait du balisage dans un message signe du domaine
 * de la boutique.
 *
 * LES CINQ CARACTERES SONT TRAITES, guillemets compris : ils apparaissent dans
 * un attribut `href`, ou une apostrophe non echappee refermerait la valeur.
 */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Reconnait une ligne qui n'est qu'une URL.
 *
 * LES MODELES POSENT LEURS LIENS SUR UNE LIGNE SEULE, forme visible dans
 * `modeles.ts` : « Ouvrez ce lien pour choisir un nouveau mot de passe : »,
 * ligne vide, puis l'URL. C'est cette convention qui rend la derivation
 * possible sans marquer les textes.
 *
 * `https` SEULEMENT, ET LE REFUS EST UNE PROTECTION. Un lien `javascript:` ou
 * `data:` place dans une variable deviendrait cliquable dans un message signe
 * du domaine de la boutique. Une ligne non reconnue reste du texte, ce qui est
 * le repli sur : elle s'affiche, elle ne s'active pas.
 */
function estLien(ligne: string): boolean {
  return /^https:\/\/[^\s]+$/.test(ligne.trim());
}

/**
 * Rend un paragraphe, ou un bouton si la ligne est un lien.
 *
 * LE BOUTON RESTE UN LIEN TEXTUEL EN DESSOUS, et ce doublon est voulu : un
 * client qui refuse le HTML voit la version texte, mais un client qui rend le
 * HTML en niant les fonds affiche un bouton invisible. L'URL ecrite en clair
 * sous le bouton est lisible dans tous les cas, critere 4.
 */
function rendreLigne(ligne: string, libelle: string): string {
  const propre = ligne.trim();

  if (estLien(propre)) {
    const url = echapper(propre);

    return [
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;">`,
      `<tr><td align="center" bgcolor="${PALETTE.primaire}" style="border-radius:4px;">`,
      `<a href="${url}" style="display:inline-block;padding:12px 24px;font-family:Georgia,'Times New Roman',serif;font-size:16px;color:#ffffff;text-decoration:none;">`,
      echapper(libelle),
      `</a></td></tr></table>`,
      `<p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.5;color:${PALETTE.texteDiscret};word-break:break-all;text-align:center;">`,
      `<a href="${url}" style="color:${PALETTE.lien};">${url}</a>`,
      `</p>`,
    ].join("");
  }

  return [
    `<p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:${PALETTE.texte};">`,
    echapper(propre),
    `</p>`,
  ].join("");
}

/**
 * Deduit le libelle d'un bouton de la phrase qui introduit son lien.
 *
 * LES MODELES ANNONCENT LEUR LIEN AVANT DE LE POSER, forme visible dans
 * `modeles.ts` : « Votre facture : », « Pour vous retracter : ». La phrase est
 * donc deja ecrite, validee par l'exploitante, et elle dit exactement ou mene
 * le lien.
 *
 * LE REPLI EST NEUTRE ET SUR. Une phrase absente, trop longue ou qui ne se
 * termine pas par deux-points rend « Ouvrir le lien » : un libelle fade vaut
 * mieux qu'un fragment de phrase tronque au milieu d'un mot.
 */
function libelleDepuisContexte(precedent: string | undefined): string {
  const REPLI = "Ouvrir le lien";

  if (precedent === undefined) {
    return REPLI;
  }

  const paragraphe = precedent.trim();

  /*
   * SEULE UNE PHRASE D'ANNONCE EST RETENUE, reconnue a son deux-points final.
   * Sans cette condition, un paragraphe ordinaire deviendrait un libelle de
   * bouton, ce qui est pire que le repli.
   */
  if (!paragraphe.endsWith(":")) {
    return REPLI;
  }

  /*
   * L'ANNONCE EST LA DERNIERE PHRASE DU PARAGRAPHE, JAMAIS LE PARAGRAPHE
   * ENTIER. La retractation le montre : « Vous disposez de 14 jours apres
   * reception pour changer d'avis, sans avoir a vous justifier. Pour vous
   * retracter : » fait 113 caracteres, dont seuls les trois derniers mots
   * annoncent le lien. Une premiere version bornait a 80 caracteres et
   * retombait sur le repli, ce qui redonnait deux boutons identiques.
   */
  const derniere = paragraphe.split(/(?<=\.)\s+/).at(-1) ?? paragraphe;
  const sansDeuxPoints = derniere.slice(0, -1).trim();

  /*
   * LE PLAFOND EST COURT, ET C'EST CE QUI DISTINGUE UN BOUTON D'UNE PHRASE.
   * Mesure sur les apercus du 12 septembre 2026 : « Si vous en etes a
   * l'origine, approuvez-la en ouvrant ce lien » remplissait la largeur du
   * message et cessait de ressembler a une action.
   *
   * LE REPLI EST PREFERE A UNE TRONCATURE. Couper au trentieme caractere
   * produirait « Si vous en etes a l'origine, a », qui est pire qu'un libelle
   * neutre : un bouton doit dire ce qu'il fait, ou rester sobre.
   */
  if (sansDeuxPoints.length === 0 || sansDeuxPoints.length > 30) {
    return REPLI;
  }

  return sansDeuxPoints;
}

/**
 * Habille un texte de modele en HTML complet.
 *
 * LE DECOUPAGE SE FAIT SUR LA LIGNE VIDE, qui separe deja les paragraphes dans
 * les textes de `modeles.ts`. Les retours simples a l'interieur d'un paragraphe
 * y servent l'enveloppement a 80 colonnes du fichier source, jamais le sens :
 * les rendre en `<br>` recopierait une contrainte d'edition dans le message du
 * client, dont la fenetre n'a pas cette largeur.
 *
 * LA TABLE DE MISE EN PAGE PORTE `role="presentation"`, critere 4 du ticket :
 * sans lui, un lecteur d'ecran annonce « tableau de trois lignes » avant de lire
 * un message qui n'a aucune donnee tabulaire.
 *
 * `lang="fr"` EST POSE SUR LA RACINE. Un document sans langue declaree est lu
 * avec la prononciation par defaut du lecteur d'ecran, defaut que le cas 12 du
 * script de mutation garde deja sur le site.
 */
export function habillerEnHtml(parametres: {
  objet: string;
  texte: string;
}): string {
  const { objet, texte } = parametres;

  const corps = texte
    .split(/\n\s*\n/)
    .map((paragraphe) => paragraphe.replace(/\n/g, " ").trim())
    .filter((paragraphe) => paragraphe.length > 0)
    .map((paragraphe, rang, tous) =>
      /*
       * LE LIBELLE DU BOUTON EST DERIVE DE LA PHRASE QUI LE PRECEDE, et ce
       * n'est pas cosmetique. La confirmation de commande porte DEUX liens, la
       * facture et la retractation : deux boutons nommes « Ouvrir le lien »
       * sont, pour un lecteur d'ecran, deux liens identiques menant a des
       * endroits differents. Constate a l'oeil sur l'apercu du 12 septembre
       * 2026, et invisible dans le texte, ou chaque URL suit sa phrase.
       */
      rendreLigne(paragraphe, libelleDepuisContexte(tous[rang - 1])),
    )
    .join("\n");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(objet)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PALETTE.fond};">
<!--
  LE TEXTE DE PREVISUALISATION EST MASQUE, et il est la pour une raison
  precise : sans lui, la liste de messages affiche les premiers mots du corps,
  « Bonjour, » sur tous les emails de la boutique. L'objet y est repris, ce qui
  rend la liste lisible.
-->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${echapper(objet)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${PALETTE.fond};">
<tr><td align="center" style="padding:24px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background-color:${PALETTE.surface};border:1px solid ${PALETTE.bordure};border-radius:8px;">

<tr><td align="center" style="padding:32px 24px 8px;">
<!--
  LE LOGO EST UNE PIECE JOINTE INTEGREE, cid:, JAMAIS UNE URL, critere 3 et
  ADR-040 : aucune requete reseau, donc aucune ouverture tracee.

  L'ATTRIBUT alt PORTE LE NOM DE LA BOUTIQUE. La plupart des clients bloquent
  les images par defaut : sans lui, l'en-tete serait vide chez une bonne part
  des destinataires, et le message ne dirait plus de qui il vient.
-->
<img src="cid:${CID_LOGO}" alt="${echapper(NOM_BOUTIQUE)}" width="96" height="96" style="display:block;width:96px;height:96px;border:0;">
</td></tr>

<tr><td align="center" style="padding:0 24px 24px;">
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:2px;text-transform:uppercase;color:${PALETTE.texteDiscret};">Bijoux faits main</p>
</td></tr>

<tr><td style="padding:0 32px 24px;">
${corps}
</td></tr>

</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">
<tr><td align="center" style="padding:16px 24px 0;">
<!--
  LE PIED NE PORTE AUCUN LIEN DE DESABONNEMENT, et c'est correct : ces messages
  sont TRANSACTIONNELS, chacun repondant a un acte du destinataire. Aucun n'est
  une prospection au sens de l'article L34-5, qui seul impose ce lien. En poser
  un laisserait croire qu'on peut refuser sa propre confirmation de commande.
-->
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:12px;line-height:1.5;color:${PALETTE.texteDiscret};">
Ce message vous est adressé à la suite d'une action sur ${echapper(NOM_BOUTIQUE)}.
</p>
</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}
