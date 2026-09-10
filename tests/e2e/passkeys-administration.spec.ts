/**
 * Ecran de gestion des passkeys, de bout en bout. LS-175.
 *
 * POURQUOI CE FICHIER EXISTE, ET CE QU'IL FERME.
 *
 * La revue d'interface du 10 septembre 2026 a trouve un defaut de contraste que
 * les DEUX gardes du projet laissaient passer, chacune pour une raison propre :
 *
 *   - `verifier-contraste.sh` ne mesure que les paires COLOCALISEES dans un
 *     meme selecteur. Le bouton « Annuler » heritait son fond d'un parent, donc
 *     le controle ne pouvait pas voir sur quoi il etait pose
 *   - `axe-core` mesure le rendu REEL, mais aucun test n'ouvrait la
 *     confirmation de retrait : la branche n'etait jamais rendue, donc jamais
 *     mesuree
 *
 * Le trou etait ouvert des deux cotes, et c'est la combinaison qui l'a laisse
 * passer : un contrôle textuel aveugle au fond herite, plus un test qui
 * n'atteignait pas l'ecran. Ce fichier rend les branches que personne ne
 * rendait.
 *
 * LA PASSKEY EST INSEREE EN BASE, jamais creee par WebAuthn : `addPasskey` passe
 * par `navigator.credentials`, qui exige un authentificateur virtuel pilote par
 * CDP. Ce qui est teste ici est le RENDU de la liste et de ses branches, pas la
 * negociation avec l'authentificateur, qui releve de la recette avec
 * l'exploitante, ADR-021.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { FICHIER_SESSION_ADMINISTRATION } from "./chemin-session";
import {
  TOLERANCE_DEBORDEMENT_PX,
  debordementHorizontal,
} from "./mesure-rendu";

test.use({ storageState: FICHIER_SESSION_ADMINISTRATION });

const NOM_PASSKEY = "iPhone de controle";
const CREDENTIAL = "credential-de-controle-e2e";

async function connexion(): Promise<Client> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL absente : la passkey de controle ne peut pas etre posee.",
    );
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

/**
 * LA PASSKEY EST POSEE SUR L'ADMINISTRATRICE, lue par son ROLE et non par une
 * adresse ecrite en dur : la fixture qui la cree pourrait changer d'adresse sans
 * que ce fichier le sache, et l'insertion echouerait alors sur une cle etrangere
 * plutot que de dire ce qui a bouge.
 */
test.beforeEach(async () => {
  const client = await connexion();
  try {
    await client.query("DELETE FROM passkey WHERE credential_id = $1", [
      CREDENTIAL,
    ]);
    await client.query(
      `INSERT INTO passkey
         (id, name, public_key, user_id, credential_id, counter,
          device_type, backed_up, created_at)
       SELECT gen_random_uuid()::text, $1, 'cle-publique-de-controle', id, $2, 0,
              'singleDevice', false, now()
         FROM utilisateur WHERE role = 'ADMINISTRATRICE' LIMIT 1`,
      [NOM_PASSKEY, CREDENTIAL],
    );
  } finally {
    await client.end();
  }
});

test.afterEach(async () => {
  const client = await connexion();
  try {
    await client.query("DELETE FROM passkey WHERE credential_id = $1", [
      CREDENTIAL,
    ]);
  } finally {
    await client.end();
  }
});

test("la liste peuplee ne porte aucune violation d'accessibilite", async ({
  page,
}) => {
  await page.goto("/administration/passkeys");
  await expect(page.getByText(NOM_PASSKEY)).toBeVisible();

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/**
 * LA BRANCHE QUI PORTAIT LE DEFAUT. Le bouton « Annuler » ne vit qu'ici, sur le
 * fond sable de la confirmation : c'est la seule facon de le faire mesurer par
 * `axe-core`, qui voit le fond herite la ou le controle textuel ne le voit pas.
 */
test("la confirmation de retrait ne porte aucune violation d'accessibilite", async ({
  page,
}) => {
  await page.goto("/administration/passkeys");
  await page.getByRole("button", { name: "Retirer", exact: true }).click();

  await expect(
    page.getByRole("button", { name: "Confirmer le retrait" }),
  ).toBeVisible();

  const resultat = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(resultat.violations).toEqual([]);
});

/**
 * LE FOCUS SUIT L'ELEMENT QUI APPARAIT, et revient quand il disparait.
 *
 * Ouvrir la confirmation DEMONTE le bouton « Retirer » qui portait le focus :
 * sans deplacement explicite, le focus retombe sur `body` et la tabulation
 * suivante repart du haut de la page. Motif « focus sur un element detache ».
 */
test("le focus entre dans la confirmation, puis revient au bouton", async ({
  page,
}) => {
  await page.goto("/administration/passkeys");

  const retirer = page.getByRole("button", { name: "Retirer", exact: true });
  await retirer.click();

  /*
   * LE SELECTEUR VISE LA CONFIRMATION PAR SON CONTENU, jamais par `role=alert`
   * seul : DEUX elements de cet ecran portent ce role, la confirmation et le
   * message d'erreur, et Playwright a refuse le selecteur ambigu. C'est utile
   * plutot que genant, un test qui viserait « le premier alert » changerait de
   * cible le jour ou un message d'erreur s'affiche en meme temps.
   *
   * LE POINT DECISIF : le focus est DANS la confirmation, pas sur `body`.
   * Comparer a `body` ne suffirait pas, un focus tombe ailleurs dans la page
   * passerait aussi.
   */
  await expect(
    page.locator("[role='alert']").filter({ hasText: "Retirer" }),
  ).toBeFocused();

  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(retirer).toBeFocused();
});

test("l'ecran ne deborde pas horizontalement, confirmation ouverte", async ({
  page,
}) => {
  await page.goto("/administration/passkeys");

  // MESURE CONFIRMATION OUVERTE, l'etat le plus large : deux boutons et une
  // question s'ajoutent a la ligne du nom d'appareil. A 320 px, c'est la que le
  // debordement apparaitrait.
  await page.getByRole("button", { name: "Retirer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirmer le retrait" }),
  ).toBeVisible();

  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(
    TOLERANCE_DEBORDEMENT_PX,
  );
});
