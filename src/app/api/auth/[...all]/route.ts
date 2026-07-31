/**
 * Point de montage des routes de Better Auth, LS-70.
 *
 * Ce fichier est un ADAPTATEUR D'ENTREE, au sens de l'architecture du projet :
 * il branche la bibliotheque sur le routeur de Next.js et ne porte aucune
 * decision. Toute la configuration vit dans `src/lib/auth.ts`.
 *
 * Le chemin `/api/auth/[...all]` est celui que Better Auth attend par defaut.
 * Le changer imposerait de le declarer aussi dans `baseURL` et dans le client :
 * trois endroits a tenir en phase pour aucun gain.
 */
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { POST, GET } = toNextJsHandler(auth);
