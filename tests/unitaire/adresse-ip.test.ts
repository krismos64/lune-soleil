/**
 * Resolution de l'adresse client derriere le proxy. LS-91, ADR-027.
 *
 * CE QUE CETTE SUITE PROUVE, ET POURQUOI ELLE VISE `getIPFromHeader`.
 *
 * Le ticket demande un test negatif : « une adresse usurpee dans le saut de
 * gauche n'est pas retenue quand la chaine traverse le proxy de confiance ».
 * Ce test ne peut PAS passer par `getIp`, qui est pourtant la fonction que le
 * hook appelle : `getIp` termine par `if (isTest() || isDevelopment()) return
 * LOCALHOST_IP`, verifie dans le code installe. Sous Vitest, il rend donc
 * `127.0.0.1` quoi qu'il arrive, et un test ecrit contre lui serait vert pour
 * une raison qui n'a rien a voir avec ce qu'il pretend mesurer.
 *
 * C'est le motif deja rencontre plusieurs fois ici : un test qui passe sans
 * exercer la garantie. `getIPFromHeader` porte toute la decision et n'a aucun
 * repli, c'est donc lui qu'il faut interroger.
 *
 * CE QUE CETTE SUITE MESURE VRAIMENT : le comportement de la bibliotheque,
 * pas du code du projet. C'est assume et c'est le point. La conception de LS-91
 * repose entierement sur ces regles ; si une mise a jour de Better Auth les
 * change, la configuration d'`auth.ts` et la ligne `$remote_addr` de Nginx
 * deviennent fausses ensemble, en silence. Cette suite est le detecteur de ce
 * changement.
 */
import { getIPFromHeader } from "@better-auth/core/utils/ip";
import { describe, expect, it } from "vitest";

import { lireProxiesDeConfiance } from "@/lib/proxies-de-confiance";

/** L'adresse publique reelle du client, celle qui doit finir au journal. */
const CLIENT = "203.0.113.7";

/** Ce qu'un attaquant place a gauche pour se faire passer pour un autre. */
const USURPEE = "9.9.9.9";

/** L'adresse par laquelle Nginx joindrait le conteneur, si elle etait declaree. */
const PROXY = "172.18.0.1";

describe("chaine a un seul saut, le cas de la topologie retenue", () => {
  it("resout l'adresse SANS aucun proxy de confiance", () => {
    /**
     * LE RESULTAT QUI RENVERSE LA PREMISSE DU TICKET. LS-91 supposait qu'il
     * fallait declarer un proxy pour que l'adresse cesse d'etre nulle. C'est
     * faux quand la chaine ne porte qu'un saut : Better Auth la resout telle
     * quelle.
     *
     * C'est pourquoi la correction reelle vit dans `docker/nginx/lune-soleil.conf`,
     * qui ECRASE l'en-tete recu par `$remote_addr`, et non dans la
     * configuration de Better Auth.
     */
    expect(getIPFromHeader(CLIENT, {})).toBe(CLIENT);
    expect(getIPFromHeader(CLIENT, { trustedProxies: [] })).toBe(CLIENT);
  });
});

describe("chaine a plusieurs sauts, le defaut que LS-80 avait laisse", () => {
  it("rend null sans proxy de confiance, plutot qu'une adresse usurpable", () => {
    /**
     * L'ETAT AVANT CETTE STORY, et le motif du ticket. Better Auth prefere ne
     * rien dire plutot que de dire quelque chose de faux : le saut de gauche
     * etant choisi par le client, le retenir remplirait le journal d'adresses
     * fabriquees.
     *
     * Une valeur nulle ne se fait pas passer pour une preuve. C'est defendable,
     * et c'est aussi pourquoi le defaut etait SILENCIEUX : la colonne est
     * nullable et rien ne cassait.
     */
    expect(getIPFromHeader(`${USURPEE}, ${CLIENT}`, {})).toBeNull();
  });

  it("ne retient jamais le saut de gauche quand un proxy est declare", () => {
    /**
     * LE TEST NEGATIF EXIGE PAR LE CRITERE 3.
     *
     * La chaine est parcourue de DROITE a GAUCHE : le dernier saut est le
     * proxy de confiance, on le saute, le suivant est l'adresse reelle du
     * client et le parcours s'arrete la. L'adresse usurpee, plus a gauche
     * encore, n'est jamais atteinte.
     */
    expect(
      getIPFromHeader(`${USURPEE}, ${CLIENT}, ${PROXY}`, {
        trustedProxies: [PROXY],
      }),
    ).toBe(CLIENT);
  });

  it("ne se laisse pas tromper par une adresse de confiance injectee a gauche", () => {
    /**
     * L'ATTAQUE EVIDENTE : le client envoie lui-meme l'adresse du proxy pour
     * faire croire que sa propre valeur a traverse un saut de confiance. Le
     * parcours partant de la droite, cette injection ne deplace pas le point
     * d'arret.
     */
    expect(
      getIPFromHeader(`${USURPEE}, ${PROXY}, ${CLIENT}, ${PROXY}`, {
        trustedProxies: [PROXY],
      }),
    ).toBe(CLIENT);
  });
});

describe("les deux facons de tout perdre en silence", () => {
  it("rend null quand TOUS les sauts sont de confiance, cas d'une plage trop large", () => {
    /**
     * LE PIEGE D'UNE PLAGE LARGE, et la raison pour laquelle `.env.example`
     * insiste pour que la variable reste vide.
     *
     * Declarer `172.16.0.0/12` « pour couvrir Docker » parait prudent. Le
     * parcours saute alors TOUS les sauts et sort en `null` : l'adresse IP
     * redevient nulle au journal, c'est-a-dire exactement le defaut que la
     * story corrige, mais cette fois avec une configuration qui a l'air
     * d'avoir ete faite.
     */
    expect(
      getIPFromHeader(PROXY, { trustedProxies: ["172.16.0.0/12"] }),
    ).toBeNull();
  });

  it("rend null si un jeton n'est pas analysable, deni de journalisation", () => {
    /**
     * LA RAISON POUR LAQUELLE NGINX DOIT ECRASER ET NON CONCATENER.
     *
     * Avec `proxy_add_x_forwarded_for`, le client controle la partie gauche.
     * Il ne peut pas FORGER l'adresse retenue, le parcours partant de la
     * droite, mais il peut envoyer n'importe quoi : `getIPFromHeader` sort en
     * `null` des qu'un jeton n'est pas une adresse valide.
     *
     * L'attaquant CHOISIT alors de ne pas etre journalise, et se soustrait au
     * comptage par adresse IP d'ADR-027. C'est pire que le defaut d'origine,
     * qui au moins n'etait pas pilotable de l'exterieur.
     */
    expect(
      getIPFromHeader(`pasuneip, ${PROXY}`, { trustedProxies: [PROXY] }),
    ).toBeNull();
  });
});

describe("lecture de la variable d'environnement", () => {
  it("rend undefined quand la variable est absente ou vide", () => {
    /**
     * `undefined` ET NON UN TABLEAU VIDE : c'est ce que Better Auth attend par
     * defaut, et cela dit « non configure » plutot que « configure a rien ».
     * La valeur juste en production est precisement celle-ci.
     */
    expect(lireProxiesDeConfiance(undefined)).toBeUndefined();
    expect(lireProxiesDeConfiance("")).toBeUndefined();
    expect(lireProxiesDeConfiance("   ")).toBeUndefined();
    expect(lireProxiesDeConfiance(",, ,")).toBeUndefined();
  });

  it("decoupe sur la virgule et retire les espaces", () => {
    expect(lireProxiesDeConfiance("192.0.2.10")).toEqual(["192.0.2.10"]);
    expect(lireProxiesDeConfiance(" 192.0.2.10 , 10.0.0.0/24 ")).toEqual([
      "192.0.2.10",
      "10.0.0.0/24",
    ]);
  });

  it("la valeur lue est effectivement celle que Better Auth appliquerait", () => {
    /**
     * LE CHAINON ENTRE LES DEUX MOITIES DE CETTE SUITE. Les tests precedents
     * mesurent la bibliotheque, celui-ci verifie que ce que le projet lit dans
     * l'environnement est bien ce qui lui est transmis. Sans lui, un decoupage
     * fautif rendrait la configuration inoperante alors que tous les autres
     * tests resteraient verts.
     */
    const proxies = lireProxiesDeConfiance(` ${PROXY} `);

    expect(
      getIPFromHeader(`${USURPEE}, ${CLIENT}, ${PROXY}`, {
        ...(proxies ? { trustedProxies: proxies } : {}),
      }),
    ).toBe(CLIENT);
  });
});
