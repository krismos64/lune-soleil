/**
 * Champs de corps imposes par le hook `before`, LS-60 et LS-294.
 *
 * L'enregistrement d'une passkey ne peut pas s'exercer en integration : aucun
 * test du depot ne fabrique d'attestation WebAuthn valide, et une attestation
 * invalide echoue avant que `createSession` ne soit lu. Le hook est donc
 * appele ici comme une fonction, avec le contexte que Better Auth lui passe.
 * `revokeOtherSessions` garde en plus son test d'integration de LS-60, dans
 * `profil-client.sequential.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { hookRevocationSessions } from "@/lib/hook-revocation-sessions";

type ContexteRendu = { context: { body: Record<string, unknown> } } | undefined;

async function appeler(
  path: string,
  body: Record<string, unknown>,
): Promise<ContexteRendu> {
  const appel = hookRevocationSessions as unknown as (
    ctx: Record<string, unknown>,
  ) => Promise<ContexteRendu>;
  return appel({ path, body, headers: new Headers() });
}

describe("champs imposes par le hook before, LS-60 et LS-294", () => {
  it("ecrase createSession a l'enregistrement d'une passkey", async () => {
    const rendu = await appeler("/passkey/verify-registration", {
      response: { id: "x" },
      createSession: true,
    });

    expect(rendu?.context.body.createSession).toBe(false);
    // Le reste du corps passe intact.
    expect(rendu?.context.body.response).toEqual({ id: "x" });
  });

  it("pose createSession a false meme quand l'appelant l'omet", async () => {
    const rendu = await appeler("/passkey/verify-registration", {});

    expect(rendu?.context.body.createSession).toBe(false);
  });

  it("ecrase revokeOtherSessions au changement de mot de passe", async () => {
    const rendu = await appeler("/change-password", {
      revokeOtherSessions: false,
    });

    expect(rendu?.context.body.revokeOtherSessions).toBe(true);
    expect(rendu?.context.body).not.toHaveProperty("createSession");
  });

  it("ne touche a aucun autre chemin", async () => {
    expect(
      await appeler("/passkey/verify-authentication", { createSession: true }),
    ).toBeUndefined();
    expect(await appeler("/sign-in/email", {})).toBeUndefined();
    // Une cle heritee du prototype ne doit pas passer pour une entree.
    expect(await appeler("constructor", {})).toBeUndefined();
  });
});
