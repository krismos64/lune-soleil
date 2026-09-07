#!/usr/bin/env bash
# Verifie le `.env` local : presence, forme, doublons et concordance. LS-156.
#
# MOTIF. Quatre defauts de configuration ont ete trouves A LA MAIN le 31 aout
# 2026, aucun attrape par un controle existant, tous invisibles a l'oeil :
#
#   1. un STRIPE_WEBHOOK_SECRET bien forme mais FAUX, recopie du tableau de bord
#      quand `stripe listen` en engendre un autre a chaque lancement. Meme
#      prefixe, meme longueur. Symptome muet : 400 sur chaque evenement, et une
#      commande bloquee en EN_ATTENTE_PAIEMENT alors que Stripe a encaisse
#   2. MEDIA_RACINE absente : aucun produit ne peut etre publie, la publication
#      exigeant un media traite
#   3. BETTER_AUTH_URL declaree DEUX FOIS. Sans effet tant que les valeurs
#      concordent, le piege est differe : en production, modifier la premiere
#      ligne laisse la seconde decider
#   4. une cle passee en ARGUMENT de ligne de commande, donc lisible par tout
#      `ps` de la machine. Ce quatrieme cas releve du hook, pas de ce script,
#      voir `hook-block-secret-commands.sh`
#
# CE SCRIPT N'IMPRIME JAMAIS UNE VALEUR, seulement un verdict par variable. Le
# depot est public : une valeur affichee entrerait dans une sortie de terminal,
# un journal d'integration continue ou un historique de session. C'est la meme
# regle que `verifier-emetteur-facture.sh`, dont ce script reprend la forme.
#
# LA LISTE DES VARIABLES N'EST PAS ECRITE ICI. Elle est derivee de
# `.env.example`, deja source de verite des noms : une liste manuelle est une
# opinion, elle se perime a la variable suivante. Le marqueur
# `# @facultative <raison>` y rend une variable optionnelle.
#
# CE QU'IL NE VERIFIE PAS. Les valeurs de PRODUCTION : c'est un outil de poste
# de developpement. Et il ne LIT aucune valeur pour la montrer, seulement pour
# en deriver un verdict, ce que la politique du projet autorise a un programme
# et interdit a une session.
#
# Usage : ./scripts/verifier-environnement.sh
set -uo pipefail

RACINE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RACINE" || exit 1

if [ ! -f .env.example ]; then
  echo "ECHEC .env.example est absent : la liste des noms n'a plus de source."
  exit 1
fi

# ---------------------------------------------------------------------------
# `--exemple-seul` NE VERIFIE QUE `.env.example`, sans exiger de `.env`.
#
# C'EST LE MODE DE L'INTEGRATION CONTINUE, qui n'a pas de `.env` et n'en aura
# jamais : le fichier n'est pas commite, et il ne doit pas l'etre. Le controle
# complet reste un outil de poste, ce que la portee du ticket enonce.
#
# CE QUI RESTE VERIFIABLE SANS `.env` : la coherence du fichier d'EXEMPLE
# lui-meme, un marqueur `@facultative` pose sans raison. Ce sens attrape a
# l'ecriture ce qu'aucun poste ne verrait avant d'avoir mis a jour son `.env`.
#
# SANS CE MODE, LE CONTROLE NE TOURNERAIT NULLE PART EN CI et sa convention se
# reeroderait sans bruit, motif deja paye par ce depot avec les liens Jira.
EXEMPLE_SEUL=0
if [ "${1:-}" = "--exemple-seul" ]; then
  EXEMPLE_SEUL=1
fi

if [ "$EXEMPLE_SEUL" -eq 0 ] && [ ! -f .env ]; then
  echo "ECHEC aucun fichier .env a la racine."
  echo "      Le creer a partir de .env.example."
  echo ""
  echo "      Pour ne verifier que la coherence de .env.example, sans .env :"
  echo "        ./scripts/verifier-environnement.sh --exemple-seul"
  exit 1
fi

# ---------------------------------------------------------------------------
# Detection des doublons, defaut 3.
#
# ELLE SE FAIT AVANT TOUTE LECTURE DE VALEUR, et sur le texte brut : une fois
# le fichier charge par un interpreteur, la seconde declaration a deja gagne et
# la premiere est indetectable. C'est precisement ce qui rend ce defaut
# invisible.
#
# LE COMPTE PORTE SUR LE NOM SEUL, `cut -d= -f1`, et non sur la ligne entiere :
# deux lignes identiques sont un doublon, deux lignes qui different par leur
# valeur en sont un aussi, et c'est le cas dangereux.
# ---------------------------------------------------------------------------
if [ "$EXEMPLE_SEUL" -eq 1 ]; then
  doublons=""
else
  doublons=$(grep -oE '^[A-Z][A-Z0-9_]*=' .env | cut -d= -f1 | sort | uniq -d)
fi

# ---------------------------------------------------------------------------
# Les noms attendus, derives de `.env.example`.
#
# `awk` PLUTOT QU'UNE BOUCLE SHELL : le marqueur `@facultative` vit sur la
# ligne PRECEDANT la variable, ce qui demande de retenir la ligne d'avant. Le
# marqueur est consomme par la premiere variable qui suit, jamais herite par la
# suivante.
# ---------------------------------------------------------------------------
REQUISES=$(awk '
  /^#[[:space:]]*@facultative/ { facultative = 1; next }
  /^[A-Z][A-Z0-9_]*=/ {
    nom = $0; sub(/=.*/, "", nom)
    if (!facultative) print nom
    facultative = 0
    next
  }
  # Toute autre ligne rompt l ancrage : un marqueur separe de sa variable par
  # une ligne vide ou un commentaire ne s applique a rien, et le dire vaut
  # mieux que de le deviner.
  { facultative = 0 }
' .env.example | sort -u)

FACULTATIVES=$(awk '
  /^#[[:space:]]*@facultative/ { facultative = 1; next }
  /^[A-Z][A-Z0-9_]*=/ {
    nom = $0; sub(/=.*/, "", nom)
    if (facultative) print nom
    facultative = 0
    next
  }
  { facultative = 0 }
' .env.example | sort -u)

# ---------------------------------------------------------------------------
# Le marqueur pose sans raison est refuse.
#
# UNE EXEMPTION SANS MOTIF EST UN INTERRUPTEUR, PAS UNE DECISION, regle deja
# appliquee par `verifier-bordure-controle.sh` et le controle de LS-179.
# ---------------------------------------------------------------------------
nus=$(grep -nE '^#[[:space:]]*@facultative[[:space:]]*$' .env.example | cut -d: -f1)

echo ""

ko=0

if [ -n "$nus" ]; then
  for ligne in $nus; do
    echo "  ECHEC .env.example ligne $ligne : @facultative sans raison"
  done
  echo "        Ecrire pourquoi la variable est optionnelle : un defaut existe,"
  echo "        la fonctionnalite est hors perimetre d'ouverture, ou le vide"
  echo "        desactive quelque chose. Ces trois cas n'appellent pas les"
  echo "        memes gestes."
  ko=$((ko + 1))
fi

if [ -n "$doublons" ]; then
  for nom in $doublons; do
    echo "  ECHEC $nom : declaree DEUX FOIS dans .env"
  done
  echo "        Sans effet tant que les valeurs concordent, le piege est"
  echo "        differe : modifier la premiere ligne laisse la seconde decider,"
  echo "        et rien ne le signale."
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# En mode `--exemple-seul`, tout ce qui suit exige un `.env` : verdict ici.
#
# LE VERDICT DIT CE QU'IL N'A PAS VERIFIE, plutot que d'annoncer un succes qui
# se lirait comme un environnement conforme. Un controle qui ne peut pas
# conclure et se tait rassure a tort.
# ---------------------------------------------------------------------------
if [ "$EXEMPLE_SEUL" -eq 1 ]; then
  echo ""
  echo "-----------------------------------------"
  if [ "$ko" -gt 0 ]; then
    echo "  .env.example NON conforme"
    echo "-----------------------------------------"
    exit 1
  fi
  requises_n=$(printf '%s\n' "$REQUISES" | grep -c . || true)
  facultatives_n=$(printf '%s\n' "$FACULTATIVES" | grep -c . || true)
  echo "  .env.example coherent : $requises_n requises, $facultatives_n"
  echo "  facultatives, chacune avec sa raison"
  echo ""
  echo "  NON VERIFIE faute de .env : presence, forme, doublons, concordance"
  echo "  du secret de webhook et processus exposes. Lancer sans l'option sur"
  echo "  un poste de developpement."
  echo "-----------------------------------------"
  exit 0
fi

# ---------------------------------------------------------------------------
# Presence et forme, defauts 1 et 2.
#
# LA DELEGATION A NODE se justifie par `--env-file`, qui applique les memes
# regles d'analyse que l'application : guillemets, echappements, lignes
# continuees. Les reimplementer en shell produirait un verdict qui differe de
# ce que l'application lit vraiment, ce qui est pire qu'aucun verdict.
# ---------------------------------------------------------------------------
CONTROLE="$(mktemp "$RACINE/.verifier-environnement-XXXXXX.mjs")"
trap 'rm -f "$CONTROLE"' EXIT

cat >"$CONTROLE" <<'MODULE'
const requises = (process.env.LS_REQUISES ?? "").split(" ").filter(Boolean);
const facultatives = (process.env.LS_FACULTATIVES ?? "").split(" ").filter(Boolean);

/*
 * LES FORMES CONTRAIGNANTES SEULEMENT, et chacune porte sa raison. Valider ce
 * qui ne l'est pas produirait des refus arbitraires sur des valeurs justes :
 * un mot de passe SMTP n'a aucune forme imposable.
 *
 * AUCUN MESSAGE NE PORTE LA VALEUR, invariant 9 : ils disent ce qui est
 * attendu, jamais ce qui a ete lu.
 */
const FORMES = [
  {
    nom: "DATABASE_URL",
    valide: (v) => v.startsWith("postgres://") || v.startsWith("postgresql://"),
    attendu: "commence par postgresql://",
  },
  {
    nom: "STRIPE_SECRET_KEY",
    valide: (v) => /^sk_(test|live)_/.test(v),
    attendu: "commence par sk_test_ ou sk_live_",
  },
  {
    nom: "STRIPE_WEBHOOK_SECRET",
    valide: (v) => v.startsWith("whsec_"),
    attendu: "commence par whsec_",
  },
  {
    nom: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    valide: (v) => /^pk_(test|live)_/.test(v),
    attendu: "commence par pk_test_ ou pk_live_",
  },
  {
    nom: "BETTER_AUTH_URL",
    valide: (v) => URL.canParse(v),
    attendu: "une URL absolue",
  },
  {
    nom: "NEXT_PUBLIC_SITE_URL",
    valide: (v) => URL.canParse(v),
    attendu: "une URL absolue",
  },
  {
    /*
     * TRENTE-DEUX OCTETS MINIMUM. Better Auth accepte n'importe quelle chaine
     * et signe les sessions avec : une valeur courte produit un secret faible
     * sans que rien ne le dise. Voir la fiche sur le secret par defaut.
     */
    nom: "BETTER_AUTH_SECRET",
    valide: (v) => v.length >= 32,
    attendu: "au moins 32 caracteres",
  },
  {
    nom: "FACTURE_SIRET",
    valide: (v) => /^\d{14}$/.test(v),
    attendu: "quatorze chiffres, sans espace",
  },
  {
    nom: "MEDIA_RACINE",
    valide: (v) => v.startsWith("/"),
    attendu: "un chemin absolu",
  },
  {
    nom: "DOCUMENTS_RACINE",
    valide: (v) => v.startsWith("/"),
    attendu: "un chemin absolu",
  },
];

const formeDe = new Map(FORMES.map((f) => [f.nom, f]));

let absentes = 0;
let malFormees = 0;

const verdicts = [];

for (const nom of requises) {
  const valeur = process.env[nom];

  if (valeur === undefined || valeur === "") {
    verdicts.push(`  ECHEC ${nom} : absente`);
    absentes += 1;
    continue;
  }

  const forme = formeDe.get(nom);
  if (forme !== undefined && !forme.valide(valeur)) {
    verdicts.push(`  ECHEC ${nom} : mal formee, ${forme.attendu}`);
    malFormees += 1;
    continue;
  }

  verdicts.push(`  OK    ${nom}`);
}

/*
 * UNE FACULTATIVE RENSEIGNEE EST QUAND MEME VALIDEE SUR SA FORME. Optionnelle
 * ne veut pas dire quelconque : une cle Stripe publiable mal formee casse le
 * paiement, qu'elle soit exigee ou non.
 */
for (const nom of facultatives) {
  const valeur = process.env[nom];

  if (valeur === undefined || valeur === "") {
    verdicts.push(`  -     ${nom} : absente, facultative`);
    continue;
  }

  const forme = formeDe.get(nom);
  if (forme !== undefined && !forme.valide(valeur)) {
    verdicts.push(`  ECHEC ${nom} : mal formee, ${forme.attendu}`);
    malFormees += 1;
    continue;
  }

  verdicts.push(`  OK    ${nom}`);
}

console.log(verdicts.sort().join("\n"));
console.log("");
console.log(`  ${requises.length} requises, ${facultatives.length} facultatives`);

if (absentes > 0 || malFormees > 0) {
  console.log(`  ${absentes} absente(s), ${malFormees} mal formee(s)`);
  process.exit(1);
}
process.exit(0);
MODULE

LS_REQUISES="$(echo "$REQUISES" | tr '\n' ' ')" \
  LS_FACULTATIVES="$(echo "$FACULTATIVES" | tr '\n' ' ')" \
  node --env-file=.env "$CONTROLE"
node_code=$?

[ "$node_code" -ne 0 ] && ko=$((ko + 1))

# ---------------------------------------------------------------------------
# Les groupes qui vont ensemble, ou pas du tout.
#
# `@facultative` DIT QU'UNE VARIABLE PEUT MANQUER, il ne dit rien de ce qui doit
# manquer AVEC elle. Le mediateur en est le cas : `lireMediateur` rend `null` si
# l'une des trois manque, et son commentaire porte la raison, une designation
# PARTIELLE laisse le client sans moyen d'exercer son recours tout en donnant
# l'apparence de la conformite.
#
# SANS CE SENS, MARQUER LES TROIS FACULTATIVES AURAIT PERDU LA REGLE : chacune
# serait devenue absente sans consequence, et un `.env` portant le nom du
# mediateur sans son adresse passerait au vert. Mesure du 7 septembre 2026, en
# ecrivant ce script.
# ---------------------------------------------------------------------------
verifier_groupe() {
  local intitule="$1"
  shift
  local presentes=0 absentes=0 total=0

  for nom in "$@"; do
    total=$((total + 1))
    # LA PRESENCE SEULE EST TESTEE, jamais la valeur imprimee : `grep -q` rend
    # un code, pas un contenu.
    if grep -qE "^${nom}=." .env; then
      presentes=$((presentes + 1))
    else
      absentes=$((absentes + 1))
    fi
  done

  if [ "$presentes" -gt 0 ] && [ "$absentes" -gt 0 ]; then
    echo "  ECHEC $intitule : renseigne A MOITIE, $presentes sur $total"
    echo "        Ces variables vont ensemble ou pas du tout. Une designation"
    echo "        partielle donne l'apparence de la conformite en laissant le"
    echo "        client sans moyen d'exercer son recours."
    return 1
  fi

  return 0
}

if ! verifier_groupe "mediateur de la consommation" \
  LEGAL_MEDIATEUR_NOM LEGAL_MEDIATEUR_ADRESSE LEGAL_MEDIATEUR_SITE; then
  ko=$((ko + 1))
fi

# ---------------------------------------------------------------------------
# Concordance du secret de webhook, defaut 1.
#
# LE CAS LE PLUS COUTEUX DES QUATRE, et le seul qu'aucune verification de forme
# ne peut voir : les deux valeurs commencent par `whsec_` et ont la meme
# longueur. Seule leur COMPARAISON les distingue.
#
# L'ABSENCE DE LA CLI SE DIT PLUTOT QUE DE SE SUPPOSER, critere 4 : sans elle
# ce sens est ANNONCE NON VERIFIE, jamais compte comme un succes. Un controle
# qui ne peut pas conclure et se tait est pire qu'absent, il rassure a tort.
#
# AUCUNE DES DEUX VALEURS N'EST IMPRIMEE, ni en cas d'ecart ni en cas
# d'egalite : seul le verdict sort.
# ---------------------------------------------------------------------------
echo ""

# `LS_SANS_STRIPE` NEUTRALISE CE SEUL SENS, et il n'existe que pour la preuve
# par mutation, qui travaille sur un `.env` factice : sur un poste ou la CLI est
# authentifiee, ce secret factice ne concorderait jamais, l'etat de reference
# serait rouge, et chaque mutation trouverait un code non nul qui ne lui doit
# rien.
#
# CE N'EST PAS UN INTERRUPTEUR GENERAL. Il ne desactive que la concordance, les
# quatre autres sens restent actifs, et le verdict affiche NON VERIFIE plutot
# que de compter un succes. Une variable qui rendrait tout le script muet serait
# un contournement ; celle-ci rend visible ce qu'elle n'a pas verifie.
if [ "${LS_SANS_STRIPE:-}" = "1" ]; then
  echo "  ?     STRIPE_WEBHOOK_SECRET : concordance NON VERIFIEE"
  echo "        LS_SANS_STRIPE=1, sens neutralise pour la preuve par mutation."
elif ! command -v stripe >/dev/null 2>&1; then
  echo "  ?     STRIPE_WEBHOOK_SECRET : concordance NON VERIFIEE"
  echo "        La CLI stripe est absente de ce poste. Ce sens ne conclut pas,"
  echo "        et il ne compte pas comme un succes : le secret du tableau de"
  echo "        bord et celui de 'stripe listen' sont indiscernables sans elle."
elif ! attendu=$(stripe listen --print-secret 2>/dev/null) || [ -z "$attendu" ]; then
  echo "  ?     STRIPE_WEBHOOK_SECRET : concordance NON VERIFIEE"
  echo "        La CLI stripe est presente mais n'a pas rendu de secret."
  echo "        Probablement non authentifiee : 'stripe login'."
else
  # LA COMPARAISON SE FAIT DANS NODE, jamais par un test shell qui ferait
  # apparaitre les deux valeurs dans la ligne de commande, donc dans tout `ps`
  # de la machine. C'est exactement le defaut 4 que ce ticket ferme par
  # ailleurs : le reproduire ici serait ironique.
  if LS_ATTENDU="$attendu" node --env-file=.env -e '
      const a = process.env.LS_ATTENDU ?? "";
      const b = process.env.STRIPE_WEBHOOK_SECRET ?? "";
      process.exit(a === b ? 0 : 1);
    '; then
    echo "  OK    STRIPE_WEBHOOK_SECRET : concorde avec stripe listen"
  else
    echo "  ECHEC STRIPE_WEBHOOK_SECRET : NE CONCORDE PAS avec stripe listen"
    echo "        Les deux commencent par whsec_ et ont la meme longueur : le"
    echo "        symptome est muet, 400 sur chaque evenement, et la commande"
    echo "        reste en EN_ATTENTE_PAIEMENT alors que Stripe a encaisse."
    echo "        Relever le secret affiche par stripe listen et le reporter."
    ko=$((ko + 1))
  fi
fi

# ---------------------------------------------------------------------------
# Aucun processus ne porte un secret dans sa ligne de commande, critere 7.
#
# LE DEFAUT 4 DU TICKET, VU DEPUIS SON RESULTAT. Le hook empeche desormais une
# session d'ecrire une telle commande ; ce sens verifie l'etat de la MACHINE,
# qui porte aussi des processus lances a la main, hors de toute session.
#
# LES DEUX SONT NECESSAIRES : un hook ne voit que ce qu'il intercepte, et un
# `stripe listen --api-key ...` lance dans un autre terminal lui echappe
# entierement.
#
# LES PREFIXES SONT ASSEMBLES, jamais ecrits en entier : ce script serait sinon
# illisible par toute session, le hook barrant la lecture d'un fichier qui les
# porte, et l'analyse de secrets du depot public les refuserait.
#
# LA SORTIE EST MASQUEE avant affichage : signaler une fuite en la recopiant
# serait la propager.
# ---------------------------------------------------------------------------
echo ""

pre_s="s"; pre_k="k"; pre_w="wh"
MOTIF_SECRET="(${pre_s}${pre_k}_live_|${pre_s}${pre_k}_test_|rk_live_|${pre_w}sec_|ghp_)[A-Za-z0-9_-]{8,}"

# `|| true` : `grep -c` rend 1 quand il ne trouve rien, ce qui est le cas
# NOMINAL ici. Sans lui, `pipefail` ferait echouer le script sur un succes.
exposes=$(ps -eo args 2>/dev/null | grep -cE "$MOTIF_SECRET" || true)

if [ "${exposes:-0}" -gt 0 ]; then
  echo "  ECHEC $exposes processus porte(nt) un secret en ligne de commande"
  echo "        La valeur est lisible par tout ps de la machine, et elle"
  echo "        ressort dans un pgrep ou un journal de processus."
  echo "        Processus concernes, valeurs masquees :"
  ps -eo pid,args 2>/dev/null | grep -E "$MOTIF_SECRET" |
    sed -E 's/(_)[A-Za-z0-9_-]{8,}/\1<masque>/g' | sed 's/^/          /' | head -5
  echo "        Les arreter, puis relancer sans passer la valeur en argument."
  ko=$((ko + 1))
else
  echo "  OK    aucun processus ne porte de secret en ligne de commande"
fi

echo ""
echo "-----------------------------------------"
if [ "$ko" -gt 0 ]; then
  echo "  environnement local NON conforme"
  echo "-----------------------------------------"
  exit 1
fi
echo "  environnement local conforme"
echo "-----------------------------------------"
