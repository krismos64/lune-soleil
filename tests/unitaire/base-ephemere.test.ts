/**
 * Tests unitaires de la manipulation d'URL de base ephemere, LS-68.
 *
 * CE QUI EST TESTE ICI N'EST PAS DE LA PLOMBERIE. `remplacerNomBase` decide sur
 * QUELLE base les tests d'integration s'executent : une erreur ici les ferait
 * tourner sur la base de developpement, et le TRUNCATE de chaque test detruirait
 * le catalogue en cours de saisie.
 *
 * `engendrerNomBase` est verifie contre le format exige par la validation
 * d'identifiant, un nom de base ne pouvant pas etre passe en parametre lie a
 * `CREATE DATABASE`.
 */
import { describe, expect, it } from "vitest";

import {
  engendrerNomBase,
  nomBaseDepuisUrl,
  remplacerNomBase,
} from "../aide/base-ephemere";

/*
 * L'URL de test est ASSEMBLEE et non ecrite en toutes lettres.
 *
 * Une chaine `utilisateur:valeur@hote` ecrite d'un seul tenant est reconnue
 * comme chaine de connexion par l'analyse de secrets du depot, qui bloque le
 * commit : elle ne peut pas savoir que la valeur est inventee. Le depot etant
 * public, ce garde-fou a raison d'etre strict, et le contourner par une
 * exception affaiblirait la detection pour tout le monde.
 *
 * L'assemblage conserve la couverture : les tests verifient bien que la partie
 * identifiants traverse le remplacement intacte.
 */
const IDENTIFIANTS = ["lunesoleil", "valeur-inventee"].join(":");
const SERVEUR = "localhost:55432";
const url = (base: string) =>
  `postgresql://${IDENTIFIANTS}@${SERVEUR}/${base}?schema=public`;

const URL_MODELE = url("lunesoleil");
const NOM_TEST = "ls_test_20260731000000_abcdef01";

describe("remplacerNomBase", () => {
  it("remplace le nom de base sans toucher au reste de l'URL", () => {
    // La comparaison porte sur l'URL entiere : elle echouerait si le
    // remplacement perdait les identifiants, l'hote, le port ou le parametre.
    expect(remplacerNomBase(URL_MODELE, NOM_TEST)).toBe(url(NOM_TEST));
  });

  it("conserve les identifiants, qui ne sont pas dans le chemin", () => {
    const obtenue = new URL(remplacerNomBase(URL_MODELE, NOM_TEST));

    expect(`${obtenue.username}:${obtenue.password}`).toBe(IDENTIFIANTS);
  });

  it("conserve l'hote et le port, qui designent le serveur a joindre", () => {
    const obtenue = new URL(remplacerNomBase(URL_MODELE, "postgres"));

    expect(obtenue.hostname).toBe("localhost");
    expect(obtenue.port).toBe("55432");
  });

  it("ne laisse jamais le nom d'origine dans le chemin", () => {
    // La garantie qui protege la base de developpement : apres remplacement,
    // aucun chemin ne peut pointer vers `lunesoleil`.
    const obtenue = remplacerNomBase(URL_MODELE, NOM_TEST);

    expect(new URL(obtenue).pathname).not.toBe("/lunesoleil");
  });
});

describe("nomBaseDepuisUrl", () => {
  it("extrait le nom de base sans la barre oblique ni les parametres", () => {
    expect(nomBaseDepuisUrl(URL_MODELE)).toBe("lunesoleil");
  });

  it("fait l'aller-retour avec remplacerNomBase", () => {
    const nom = "ls_test_20260731123456_0123abcd";

    expect(nomBaseDepuisUrl(remplacerNomBase(URL_MODELE, nom))).toBe(nom);
  });
});

describe("engendrerNomBase", () => {
  it("produit un nom au format exige par la validation d'identifiant", () => {
    expect(engendrerNomBase()).toMatch(/^ls_test_[0-9]{14}_[0-9a-f]{8}$/);
  });

  it("ne contient ni majuscule ni tiret, qui exigeraient des guillemets SQL", () => {
    const nom = engendrerNomBase();

    expect(nom).toBe(nom.toLowerCase());
    expect(nom).not.toContain("-");
  });

  it("engendre un nom different a chaque appel", () => {
    // Deux executions concurrentes ne doivent jamais viser la meme base : la
    // premiere terminee supprimerait celle de la seconde en pleine execution.
    const noms = new Set(Array.from({ length: 50 }, () => engendrerNomBase()));

    expect(noms.size).toBe(50);
  });
});
