/**
 * Content-Security-Policy avec un nonce par requete, ADR-038, LS-139.
 *
 * ------------------------------------------------------------------
 * POURQUOI UN NONCE ET NON `unsafe-inline`.
 *
 * `unsafe-inline` sur `script-src` ANNULE l'essentiel de la protection : c'est
 * precisement l'injection de script inline que la CSP existe pour bloquer. Le
 * poser reviendrait a ecrire l'en-tete pour la forme, et a croire le site
 * protege alors qu'il ne l'est pas.
 *
 * Le hash de chaque script inline a ete ecarte : les scripts d'hydratation de
 * Next.js changent a chaque build et dependent de la page rendue. Il faudrait
 * les recalculer a chaque deploiement, et une page oubliee casserait en
 * silence, c'est-a-dire de la pire facon.
 *
 * LE COUT EST MESURE ET NON SUPPOSE. Le nonce impose le rendu dynamique, la
 * valeur devant etre unique par requete. Le build du 9 septembre 2026 rend
 * SEPT routes dynamiques et UNE seule statique, le manifeste : cette boutique
 * ne perd donc rien. La decision serait autre sur un site majoritairement
 * statique, et c'est pour cela qu'ADR-038 l'ecrit.
 * ------------------------------------------------------------------
 */
import { NextResponse, type NextRequest } from "next/server";

/**
 * Les directives, et ce que chacune ferme.
 *
 * LA PAGE NE CHARGE AUCUNE RESSOURCE EXTERNE, verifie sur le rendu reel du
 * 9 septembre 2026 : aucun `src` ni `href` vers un autre domaine, aucune balise
 * `<style>`, aucune police distante. La politique peut donc etre stricte sans
 * negocier avec un tiers, ce qui est une chance a ne pas gaspiller.
 *
 * `strict-dynamic` LAISSE UN SCRIPT PORTANT LE NONCE en charger d'autres, ce
 * dont Next.js a besoin pour ses fragments. Sans lui, l'hydratation casse.
 *
 * `style-src 'self'` ET NON `'nonce-...'` : les styles arrivent en fichiers
 * `<link rel="stylesheet">` servis depuis le domaine, mesure faite. Exiger un
 * nonce sur `style-src` refuserait ces fichiers, la directive s'appliquant aux
 * feuilles comme aux balises. `'unsafe-inline'` y est ajoute pour les attributs
 * `style=` que React pose lui-meme, `style="color:transparent"` sur les images :
 * il ne porte QUE sur les styles, jamais sur les scripts, et un attribut de
 * style n'execute rien.
 *
 * `frame-ancestors 'none'` remplace `X-Frame-Options`, qu'il rend inutile : la
 * boutique n'a aucune raison d'etre encadree par un autre site, et c'est la
 * defense contre le clickjacking.
 *
 * `object-src 'none'` ferme `<object>` et `<embed>`, qui n'ont aucun usage ici
 * et restent un vecteur d'execution.
 *
 * `base-uri 'self'` empeche qu'un `<base>` injecte detourne toutes les URL
 * relatives de la page vers un domaine hostile.
 *
 * `form-action 'self'` empeche qu'un formulaire injecte poste les identifiants
 * ailleurs.
 */
function politique(nonce: string, developpement: boolean): string {
  /*
   * `unsafe-eval` EN DEVELOPPEMENT SEULEMENT. React l'emploie pour reconstruire
   * les piles d'erreur serveur dans le navigateur ; ni React ni Next.js ne
   * l'emploient en production. La condition porte sur NODE_ENV plutot que sur
   * une variable a nous, qui pourrait etre mal posee au deploiement.
   */
  const evaluation = developpement ? " 'unsafe-eval'" : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${evaluation}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  /*
   * `crypto.randomUUID` PLUTOT QU'UN COMPTEUR OU UN HORODATAGE : le nonce doit
   * etre IMPREVISIBLE. Un attaquant qui peut deviner la valeur contourne la
   * politique entiere, et une valeur derivee du temps se devine.
   */
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const valeur = politique(nonce, process.env.NODE_ENV === "development");

  /*
   * LE NONCE VOYAGE PAR UN EN-TETE DE REQUETE, seul moyen pour un composant
   * serveur de le lire : `headers()` le rend, et le composant le pose sur son
   * `<script>`. Une variable de module ne marcherait pas, plusieurs requetes
   * etant traitees en parallele.
   */
  const enTetes = new Headers(request.headers);
  enTetes.set("x-nonce", nonce);
  enTetes.set("content-security-policy", valeur);

  const reponse = NextResponse.next({ request: { headers: enTetes } });

  /*
   * L'EN-TETE EST POSE SUR LA REPONSE AUSSI, et non seulement sur la requete :
   * le premier gouverne ce que Next.js voit, le second ce que le NAVIGATEUR
   * applique. N'en poser qu'un laisse la politique sans effet chez le client,
   * ce qui est le defaut le plus facile a ne pas voir : la page fonctionne, et
   * rien ne protege.
   */
  reponse.headers.set("content-security-policy", valeur);

  return reponse;
}

/**
 * Ce que le proxy ne traite pas, et pourquoi.
 *
 * Les ressources statiques de `_next/static` sont servies telles quelles et ne
 * portent aucun script inline : leur faire traverser le proxy couterait un
 * nonce par fichier sans rien fermer. Meme raison pour les images et le
 * favicon.
 *
 * LES QUATRE AUTRES EN-TETES SONT CHEZ NGINX, ADR-038 : ils ne dependent
 * d'aucune donnee de requete, et Nginx les sert MEME QUAND L'APPLICATION EST
 * TOMBEE. Une page 502 partirait sinon sans `X-Content-Type-Options`,
 * c'est-a-dire au moment ou le client est le plus expose.
 */
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
