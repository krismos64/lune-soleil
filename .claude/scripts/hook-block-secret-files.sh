#!/bin/bash
# PreToolUse hook (Read|Edit|Write) — bloque tout acces aux fichiers de secrets.
#
# Le cahier des charges Lune & Soleil interdit a l'assistant de lire ou de
# modifier un fichier de secrets (section 27.3). Une regle de CLAUDE.md est
# consultative, ce hook est deterministe.
#
# .env.example est autorise : il ne contient que des noms et des formats.

set -u
input=$(cat)

file=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
[ -z "$file" ] && exit 0

base=$(basename "$file")

# Autorise explicitement les fichiers d'exemple
case "$base" in
  .env.example|.env.sample|.env.template) exit 0 ;;
esac

blocked=0
reason=""

# Fichiers d'environnement
case "$base" in
  .env|.env.*) blocked=1; reason="fichier d'environnement" ;;
esac

# Cles, certificats et magasins de secrets
case "$base" in
  *.pem|*.key|*.p12|*.pfx|*.jks|id_rsa|id_ed25519|*.keystore)
    blocked=1; reason="cle ou certificat" ;;
esac

# Repertoires de secrets
case "$file" in
  */secrets/*|*/.secrets/*|*/.ssh/*|*/.gnupg/*|*/.aws/credentials*)
    blocked=1; reason="repertoire de secrets" ;;
esac

if [ "$blocked" -eq 1 ]; then
  echo "Hook BLOCK: acces refuse a un fichier de secrets ($reason)." >&2
  echo "Fichier : $file" >&2
  echo "" >&2
  echo "Interdit par la section 27.3 du cahier des charges Lune & Soleil." >&2
  echo "Pour connaitre les variables attendues, lire .env.example, qui ne" >&2
  echo "contient que des noms et des formats." >&2
  echo "" >&2
  echo "Si une valeur doit etre renseignee, Christophe le fait lui-meme." >&2
  exit 2
fi

exit 0
