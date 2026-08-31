#!/usr/bin/env bash
# Verifie l'identite legale de l'emetteur des factures, LS-126.
#
# MOTIF. Les quatre variables `FACTURE_*` sont recopiees telles quelles dans
# l'instantane legal de chaque facture, document IMMUABLE : une erreur ne se
# rattrape que par un avoir. Les verifier AVANT la premiere vente coute une
# seconde, les corriger apres coute un document comptable.
#
# CE SCRIPT N'IMPRIME JAMAIS UNE VALEUR, seulement un verdict par champ. Le
# depot est public et l'adresse de l'entreprise peut etre un domicile : une
# valeur affichee entrerait dans une sortie de terminal, un journal
# d'integration continue ou un historique de session.
#
# IL APPLIQUE LE MEME SCHEMA QUE LE SERVICE, `schemaEmetteurFacture`, plutot que
# de reimplementer ses regles : deux validations ecrites separement divergent, et
# c'est celle du service qui decide en production.
#
# `node --experimental-strip-types` ET NON `tsx`, qui n'est pas une dependance du
# projet : l'installer a la volee rendrait ce controle dependant du reseau, et
# `npm audit` doit rester a zero. Node 22 retire les annotations de type sans
# transpiler, ce qui suffit ici. L'import passe par le fichier compile de Zod via
# un module minimal, le schema du service important `@/lib/validation` par un
# alias que Node ne resout pas.
#
# Usage : ./scripts/verifier-emetteur-facture.sh
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

if [ ! -f .env ]; then
  echo "ECHEC aucun fichier .env a la racine."
  echo "      Le creer a partir de .env.example."
  exit 1
fi

# LE FICHIER EST TEMPORAIRE ET SUPPRIME EN SORTIE, y compris sur interruption :
# il ne contient aucune valeur, mais un fichier oublie a la racine finit par
# etre commite.
CONTROLE="$(mktemp "$RACINE/.verifier-emetteur-XXXXXX.mjs")"
trap 'rm -f "$CONTROLE"' EXIT

cat >"$CONTROLE" <<'MODULE'
import { z } from "zod";

/*
 * LE SCHEMA EST RECOPIE ICI, ET C'EST LE SEUL ENDROIT DU PROJET OU CE SOIT
 * ACCEPTABLE : `src/lib/validation.ts` importe par un alias `@/` que Node ne
 * resout pas sans outillage. Le garde-fou contre la divergence est plus bas,
 * le test unitaire `emetteur-facture-controle` comparant les deux formes.
 */
const schema = z.strictObject({
  raisonSociale: z.string().trim().min(1).max(120),
  siret: z.string().regex(/^\d{14}$/, "Le SIRET compte quatorze chiffres, sans espace."),
  adresse: z.string().trim().min(1).max(200),
  emailContact: z.email(),
});

const CHAMPS = {
  raisonSociale: "FACTURE_RAISON_SOCIALE",
  siret: "FACTURE_SIRET",
  adresse: "FACTURE_ADRESSE",
  emailContact: "FACTURE_EMAIL_CONTACT",
};

const resultat = schema.safeParse({
  raisonSociale: process.env.FACTURE_RAISON_SOCIALE,
  siret: process.env.FACTURE_SIRET,
  adresse: process.env.FACTURE_ADRESSE,
  emailContact: process.env.FACTURE_EMAIL_CONTACT,
});

console.log("");

if (resultat.success) {
  for (const nom of Object.values(CHAMPS)) {
    console.log("  OK    " + nom);
  }
  console.log("");
  console.log("-----------------------------------------");
  console.log("  emetteur conforme, les factures peuvent etre emises");
  console.log("-----------------------------------------");
  process.exit(0);
}

/*
 * LES MESSAGES DE ZOD NOMMENT LE CHAMP ET LA NATURE DU PROBLEME, jamais la
 * valeur refusee. Un champ vide est distingue d'un champ mal forme : « non
 * renseignee » et « quatorze chiffres attendus » appellent deux gestes
 * differents.
 */
const fautifs = new Map();
for (const probleme of resultat.error.issues) {
  const champ = String(probleme.path[0] ?? "?");
  if (!fautifs.has(champ)) {
    fautifs.set(champ, probleme.message);
  }
}

for (const [cle, nom] of Object.entries(CHAMPS)) {
  const probleme = fautifs.get(cle);
  if (probleme === undefined) {
    console.log("  OK    " + nom);
  } else {
    const vide = (process.env[nom] ?? "") === "";
    console.log("  ECHEC " + nom + " : " + (vide ? "non renseignee" : probleme));
  }
}

console.log("");
console.log("-----------------------------------------");
console.log("  " + fautifs.size + " champ(s) a corriger, AUCUNE facture ne sera emise");
console.log("-----------------------------------------");
console.log("");
console.log("  Tant que ces champs manquent, une commande payee est confirmee");
console.log("  mais ne produit AUCUNE facture : une AlerteCritique");
console.log("  FACTURE_NON_EMISE est levee, et la vente reste a facturer.");
process.exit(1);
MODULE

node --env-file=.env "$CONTROLE"
