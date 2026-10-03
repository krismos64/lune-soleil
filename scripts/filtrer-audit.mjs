#!/usr/bin/env node
/**
 * Décide si un rapport `npm audit --json` ne contient que des avis exemptés,
 * LS-258.
 *
 * POURQUOI UNE EXEMPTION. L'avis GHSA-vfj7-8cjw-p6xm vise toutes les versions
 * de `braces`, sans version corrigée publiée, et n'atteint le dépôt que par la
 * chaîne de lint. Arbitrage de Christophe, 3 octobre 2026 : l'exempter par son
 * identifiant, avec une date limite courte, plutôt que `--omit=dev`, qui
 * masquerait aussi les prochains avis sur les outils de développement.
 *
 * LE RELÂCHEMENT DOIT RESTER ÉTROIT, même dissymétrie que LS-176 : laisser
 * passer un avis non exempté est le pire sens d'erreur. D'où quatre règles, que
 * `verifier-filtre-audit.sh` éprouve et dont `verifier-filtre-audit-mutation.sh`
 * prouve qu'il les voit :
 *
 * 1. une exemption désigne UN avis, par son URL exacte ET son paquet ;
 * 2. un paquet n'est couvert que si TOUT ce qui le rend vulnérable l'est :
 *    ses avis propres, et chaque dépendance qu'il cite, de proche en proche ;
 * 3. une exemption échue fait échouer, et sa durée est bornée à HORIZON_JOURS ;
 * 4. tout ce qui ne se lit pas, rapport ou fichier d'exemptions, fait échouer.
 *
 * Usage :
 *   npm audit --json | node scripts/filtrer-audit.mjs scripts/audit-exemptions.json
 *
 * `AUJOURDHUI=AAAA-MM-JJ` fixe la date du jour, pour les tests ; sinon la date
 * UTC courante.
 *
 * Sorties : 0 tout est exempté et en cours de validité ; 1 un avis n'est pas
 * exempté, ou une exemption est échue ; 2 entrée illisible ; 3 erreur interne.
 */
import { readFileSync } from "node:fs";

const HORIZON_JOURS = 31;

// Une exception imprévue sort en 3, distinct du refus : un plantage qui
// rendrait 1 passerait pour un verdict, et masquerait un défaut du filtre.
process.on("uncaughtException", (erreur) => {
  console.log(`ERREUR INTERNE ${erreur.stack}`);
  process.exit(3);
});
const FORME_AVIS = /^GHSA(-[a-z0-9]{4}){3}$/;
const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;
const JOUR_MS = 24 * 60 * 60 * 1000;

function illisible(message) {
  console.log(`ILLISIBLE ${message}`);
  process.exit(2);
}

function lireDate(valeur, champ, avis) {
  if (typeof valeur !== "string" || !FORME_DATE.test(valeur)) {
    illisible(`exemption ${avis} : « ${champ} » n'est pas une date AAAA-MM-JJ`);
  }
  const date = new Date(`${valeur}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== valeur
  ) {
    illisible(`exemption ${avis} : « ${champ} » n'est pas une date réelle`);
  }
  return date;
}

function lireExemptions(chemin) {
  let liste;
  try {
    liste = JSON.parse(readFileSync(chemin, "utf8"));
  } catch (erreur) {
    illisible(`fichier d'exemptions ${chemin} : ${erreur.message}`);
  }
  if (!Array.isArray(liste))
    illisible("le fichier d'exemptions n'est pas une liste");

  return liste.map((e) => {
    const avis = e?.avis;
    if (typeof avis !== "string" || !FORME_AVIS.test(avis)) {
      illisible(
        `exemption sans identifiant GHSA valide : ${JSON.stringify(avis)}`,
      );
    }
    for (const champ of ["paquet", "motif"]) {
      if (typeof e[champ] !== "string" || e[champ].trim() === "") {
        illisible(`exemption ${avis} : « ${champ} » manque`);
      }
    }
    if (typeof e.ticket !== "string" || !/^LS-\d+$/.test(e.ticket)) {
      illisible(`exemption ${avis} : « ticket » doit être une clé LS-nn`);
    }
    const debut = lireDate(e.ajoute_le, "ajoute_le", avis);
    const fin = lireDate(e.jusqu_au, "jusqu_au", avis);
    const duree = (fin - debut) / JOUR_MS;
    if (duree < 0)
      illisible(`exemption ${avis} : « jusqu_au » précède « ajoute_le »`);
    if (duree > HORIZON_JOURS) {
      illisible(
        `exemption ${avis} : ${duree} jours, au-delà de ${HORIZON_JOURS}. ` +
          "Une exemption se renouvelle en la relisant, elle ne s'allonge pas.",
      );
    }
    return { ...e, url: `https://github.com/advisories/${avis}`, fin };
  });
}

function lireRapport() {
  let rapport;
  try {
    rapport = JSON.parse(readFileSync(0, "utf8"));
  } catch (erreur) {
    illisible(`rapport d'audit : ${erreur.message}`);
  }
  if (
    rapport?.auditReportVersion !== 2 ||
    typeof rapport.vulnerabilities !== "object"
  ) {
    illisible(
      "rapport d'audit de forme inconnue, auditReportVersion 2 attendu",
    );
  }
  return rapport.vulnerabilities;
}

const cheminExemptions = process.argv[2];
if (!cheminExemptions)
  illisible("usage : filtrer-audit.mjs <fichier d'exemptions>");

const aujourdhuiTexte =
  process.env.AUJOURDHUI ?? new Date().toISOString().slice(0, 10);
const aujourdhui = lireDate(aujourdhuiTexte, "AUJOURDHUI", "du jour");
const exemptions = lireExemptions(cheminExemptions);
const vulnerabilites = lireRapport();

let echec = false;

const valides = exemptions.filter((e) => {
  if (aujourdhui > e.fin) {
    console.log(
      `ECHUE ${e.avis} (${e.paquet}), exemption terminée le ${e.jusqu_au}, ${e.ticket}. ` +
        "Mettre à jour la dépendance, ou relire et renouveler l'exemption.",
    );
    echec = true;
    return false;
  }
  return true;
});

function exempte(via) {
  return valides.find((e) => e.url === via.url && e.paquet === via.name);
}

// Point fixe : un paquet est couvert quand chacune de ses causes l'est. Un
// cycle reste non couvert, donc bloque, défaut fermé.
const couverts = new Set();
const utilisees = new Set();
let progres = true;
while (progres) {
  progres = false;
  for (const [paquet, fiche] of Object.entries(vulnerabilites)) {
    if (couverts.has(paquet)) continue;
    const causes = Array.isArray(fiche?.via) ? fiche.via : [];
    if (causes.length === 0) continue;
    const toutes = causes.every((cause) =>
      typeof cause === "string"
        ? couverts.has(cause)
        : exempte(cause) !== undefined,
    );
    if (toutes) {
      couverts.add(paquet);
      progres = true;
      for (const cause of causes) {
        const exemption =
          typeof cause === "string" ? undefined : exempte(cause);
        if (exemption) utilisees.add(exemption.avis);
      }
    }
  }
}

for (const [paquet, fiche] of Object.entries(vulnerabilites)) {
  if (couverts.has(paquet)) continue;
  echec = true;
  const propres = (fiche?.via ?? []).filter(
    (cause) => typeof cause !== "string" && !exempte(cause),
  );
  if (propres.length === 0) {
    console.log(
      `NON EXEMPTE ${paquet} (${fiche?.severity}), par une dépendance non couverte`,
    );
  }
  for (const avis of propres) {
    console.log(
      `NON EXEMPTE ${paquet} (${avis.severity}) : ${avis.title} ${avis.url}`,
    );
  }
}

for (const e of valides) {
  if (utilisees.has(e.avis)) {
    console.log(
      `EXEMPTE ${e.avis} (${e.paquet}) jusqu'au ${e.jusqu_au}, ${e.ticket} : ${e.motif}`,
    );
  } else {
    console.log(
      `INUTILE ${e.avis} (${e.paquet}) n'apparaît plus dans l'audit : retirer l'exemption, ${e.ticket}.`,
    );
  }
}

const total = Object.keys(vulnerabilites).length;
console.log(
  `Paquets signalés : ${total}, couverts par une exemption : ${couverts.size}`,
);
process.exit(echec ? 1 : 0);
